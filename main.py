import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Cookie, Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import GOOGLE_CLIENT_ID, SESSION_EXPIRE_DAYS
from database import get_db, init_db
from models import Session as DBSession, User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Live Auction Stream")

app.mount("/static", StaticFiles(directory="static"), name="static")


# ---------------------------------------------------------------------------
# Startup: create DB tables
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup_event():
    await init_db()
    logger.info("Database initialized.")


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def _session_cookie_kwargs(token: str, expires: datetime) -> dict:
    return dict(
        key="session_id",
        value=token,
        httponly=True,
        samesite="lax",
        expires=int(expires.timestamp()),
        path="/",
    )


async def get_current_user(
    session_id: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not session_id:
        return None
    result = await db.execute(
        select(DBSession)
        .where(DBSession.token == session_id)
        .where(DBSession.expires_at > datetime.now(timezone.utc))
    )
    db_session = result.scalar_one_or_none()
    if not db_session:
        return None
    result = await db.execute(select(User).where(User.id == db_session.user_id))
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.post("/auth/google")
async def google_auth(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    credential = body.get("credential")
    if not credential:
        return JSONResponse({"error": "No credential"}, status_code=400)

    try:
        id_info = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as e:
        logger.warning("Invalid Google token: %s", e)
        return JSONResponse({"error": "Invalid token"}, status_code=401)

    google_id = id_info["sub"]
    email = id_info.get("email", "")
    name = id_info.get("name", email)
    picture = id_info.get("picture")

    # Find or create user
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()
    if user:
        user.name = name
        user.picture = picture
    else:
        user = User(google_id=google_id, email=email, name=name, picture=picture)
        db.add(user)

    await db.flush()  # get user.id

    # Create session
    token = uuid.uuid4().hex
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRE_DAYS)
    db_session = DBSession(token=token, user_id=user.id, expires_at=expires)
    db.add(db_session)
    await db.commit()
    await db.refresh(user)

    response = JSONResponse(user.to_dict())
    response.set_cookie(**_session_cookie_kwargs(token, expires))
    return response


@app.get("/auth/me")
async def auth_me(current_user: Optional[User] = Depends(get_current_user)):
    if not current_user:
        return JSONResponse({"user": None})
    return JSONResponse({"user": current_user.to_dict()})


@app.post("/auth/logout")
async def logout(
    session_id: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if session_id:
        result = await db.execute(select(DBSession).where(DBSession.token == session_id))
        db_session = result.scalar_one_or_none()
        if db_session:
            await db.delete(db_session)
            await db.commit()
    response = JSONResponse({"ok": True})
    response.delete_cookie(key="session_id", path="/")
    return response


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return RedirectResponse(url="/stream")


@app.get("/stream")
async def stream_page():
    with open("static/stream.html", "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.get("/start_stream")
async def start_stream_page():
    with open("static/start_stream.html", "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.streamer: Optional[WebSocket] = None
        self.viewers: List[WebSocket] = []
        self.current_price = 1
        self.chat_messages: List[dict] = []
        self.bids: List[dict] = []
        self.usernames: dict = {}  # websocket id -> username

    async def connect_streamer(self, websocket: WebSocket) -> None:
        if self.streamer:
            try:
                await self.streamer.close()
            except Exception:
                pass
        self.streamer = websocket
        logger.info("Streamer connected")

    def disconnect_streamer(self, websocket: WebSocket) -> None:
        if self.streamer == websocket:
            self.streamer = None
            logger.info("Streamer disconnected")

    async def connect_viewer(self, websocket: WebSocket, username: str = "Anonymous") -> None:
        self.viewers.append(websocket)
        self.usernames[id(websocket)] = username
        await self.broadcast_viewer_count()

    def disconnect_viewer(self, websocket: WebSocket) -> None:
        if websocket in self.viewers:
            self.viewers.remove(websocket)
        self.usernames.pop(id(websocket), None)

    def get_viewer_count(self) -> int:
        count = len(self.viewers)
        if self.streamer:
            count += 1
        return count

    async def broadcast_viewer_count(self) -> None:
        count = self.get_viewer_count()
        msg = {"type": "viewers", "count": count}
        await self.broadcast_to_viewers(msg)
        if self.streamer:
            try:
                await self.streamer.send_json(msg)
            except Exception:
                pass

    async def broadcast_to_viewers(self, message: dict) -> None:
        dead = []
        for ws in self.viewers:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_viewer(ws)

    async def broadcast_frame(self, data: str) -> None:
        await self.broadcast_to_viewers({"type": "frame", "data": data})

    async def broadcast_chat(self, username: str, text: str) -> None:
        msg = {"type": "chat", "username": username, "text": text}
        self.chat_messages.append(msg)
        await self.broadcast_to_viewers(msg)
        if self.streamer:
            try:
                await self.streamer.send_json(msg)
            except Exception:
                pass

    async def broadcast_bid(self, username: str, amount: int) -> None:
        msg = {"type": "bid", "username": username, "amount": amount}
        self.bids.append(msg)
        await self.broadcast_to_viewers(msg)
        if self.streamer:
            try:
                await self.streamer.send_json(msg)
            except Exception:
                pass

    async def broadcast_price(self, price: int) -> None:
        msg = {"type": "price", "current": price}
        await self.broadcast_to_viewers(msg)
        if self.streamer:
            try:
                await self.streamer.send_json(msg)
            except Exception:
                pass

    async def broadcast_live_status(self, is_live: bool) -> None:
        msg = {"type": "live_status", "is_live": is_live}
        await self.broadcast_to_viewers(msg)
        if self.streamer:
            try:
                await self.streamer.send_json(msg)
            except Exception:
                pass


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    await websocket.accept()
    role: Optional[str] = None
    username: Optional[str] = None

    # Try to resolve user from session cookie
    session_id = websocket.cookies.get("session_id")
    if session_id:
        result = await db.execute(
            select(DBSession)
            .where(DBSession.token == session_id)
            .where(DBSession.expires_at > datetime.now(timezone.utc))
        )
        db_session = result.scalar_one_or_none()
        if db_session:
            result = await db.execute(select(User).where(User.id == db_session.user_id))
            user = result.scalar_one_or_none()
            if user:
                username = user.name

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "join":
                role = msg.get("role", "viewer")
                # Username from DB takes priority, fall back to client-provided
                if not username:
                    username = msg.get("username", "Anonymous")

                if role == "streamer":
                    await manager.connect_streamer(websocket)
                    await manager.broadcast_live_status(True)
                    await websocket.send_json({"type": "price", "current": manager.current_price})
                    await websocket.send_json({"type": "viewers", "count": manager.get_viewer_count()})
                    for m in manager.chat_messages[-20:]:
                        await websocket.send_json(m)
                    for b in manager.bids[-10:]:
                        await websocket.send_json(b)
                else:
                    await manager.connect_viewer(websocket, username)
                    await websocket.send_json({"type": "price", "current": manager.current_price})
                    await websocket.send_json({"type": "live_status", "is_live": manager.streamer is not None})
                    for m in manager.chat_messages[-20:]:
                        await websocket.send_json(m)
                    for b in manager.bids[-10:]:
                        await websocket.send_json(b)

            elif msg_type == "set_username":
                # Sent by auth.js after session resolves — update username for this WS session
                new_name = msg.get("username", "").strip()
                if new_name:
                    username = new_name
                    if role == "viewer":
                        manager.usernames[id(websocket)] = new_name

            elif msg_type == "frame" and role == "streamer":
                frame_data = msg.get("data", "")
                if frame_data:
                    await manager.broadcast_frame(frame_data)

            elif msg_type == "chat":
                u = username or msg.get("username", "Anonymous")
                text = msg.get("text", "").strip()
                if text:
                    await manager.broadcast_chat(u, text)

            elif msg_type == "bid":
                u = username or msg.get("username", "Anonymous")
                amount = msg.get("amount")
                try:
                    amount = int(amount)
                except (TypeError, ValueError):
                    continue
                if amount > manager.current_price:
                    manager.current_price = amount
                    await manager.broadcast_bid(u, amount)
                    await manager.broadcast_price(manager.current_price)

            elif msg_type == "buy_now":
                u = username or msg.get("username", "Anonymous")
                manager.current_price += 1
                await manager.broadcast_bid(u, manager.current_price)
                await manager.broadcast_price(manager.current_price)

    except WebSocketDisconnect:
        pass
    finally:
        if role == "streamer":
            manager.disconnect_streamer(websocket)
            await manager.broadcast_live_status(False)
        else:
            manager.disconnect_viewer(websocket)
        try:
            await manager.broadcast_viewer_count()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=50260)

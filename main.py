import json
import logging
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Live Auction Stream Prototype")

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")


class ConnectionManager:
    def __init__(self):
        self.streamer: Optional[WebSocket] = None
        self.viewers: List[WebSocket] = []
        self.current_price = 1
        self.chat_messages: List[dict] = []
        self.bids: List[dict] = []
        self.usernames: dict = {}  # websocket -> username for viewers

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
        if id(websocket) in self.usernames:
            del self.usernames[id(websocket)]

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
        msg = {"type": "frame", "data": data}
        await self.broadcast_to_viewers(msg)

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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    role: Optional[str] = None
    username: Optional[str] = None

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
                username = msg.get("username", "Anonymous")

                if role == "streamer":
                    await manager.connect_streamer(websocket)
                    await manager.broadcast_live_status(True)
                    await websocket.send_json({
                        "type": "price", "current": manager.current_price
                    })
                    await websocket.send_json({
                        "type": "viewers", "count": manager.get_viewer_count()
                    })
                    for m in manager.chat_messages[-20:]:
                        await websocket.send_json(m)
                    for b in manager.bids[-10:]:
                        await websocket.send_json(b)
                else:
                    await manager.connect_viewer(websocket, username)
                    await websocket.send_json({
                        "type": "price", "current": manager.current_price
                    })
                    await websocket.send_json({
                        "type": "live_status",
                        "is_live": manager.streamer is not None
                    })
                    for m in manager.chat_messages[-20:]:
                        await websocket.send_json(m)
                    for b in manager.bids[-10:]:
                        await websocket.send_json(b)

            elif msg_type == "frame" and role == "streamer":
                frame_data = msg.get("data", "")
                if frame_data:
                    await manager.broadcast_frame(frame_data)

            elif msg_type == "chat":
                u = msg.get("username", username or "Anonymous")
                text = msg.get("text", "").strip()
                if text:
                    await manager.broadcast_chat(u, text)

            elif msg_type == "bid":
                u = msg.get("username", username or "Anonymous")
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
                u = msg.get("username", username or "Anonymous")
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

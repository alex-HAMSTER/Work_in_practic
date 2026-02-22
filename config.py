import os

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "1065522748619-l0bepamjkq9a69dn3mlealt3t6a5rjeq.apps.googleusercontent.com"
)

# Switch to postgresql+asyncpg://user:password@host/db for production
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./app.db"
)

SESSION_EXPIRE_DAYS = int(os.getenv("SESSION_EXPIRE_DAYS", "30"))

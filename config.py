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

# SMTP email settings
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "alex2003leon@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "evou hcwn attk zrjq")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@ukraineboost.com")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
STREAM_URL = os.getenv("STREAM_URL", "http://localhost:50260/stream")

"""
email_service.py — Async SMTP email notifications for stream events.
"""
import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List

import aiosmtplib

from config import SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USE_TLS, SMTP_USER, STREAM_URL

logger = logging.getLogger(__name__)


def _build_stream_started_email(to_email: str, user_name: str) -> MIMEMultipart:
    """Build a nicely formatted HTML email for stream-start notification."""
    msg = MIMEMultipart("alternative")
    msg["From"] = f"UkraineBoost <{SMTP_FROM}>"
    msg["To"] = to_email
    msg["Subject"] = "🔴 Стрім розпочався! — UkraineBoost"

    plain = f"""Привіт, {user_name}!

Стрім на UkraineBoost тільки що розпочався!
Приєднуйтесь прямо зараз: {STREAM_URL}

Не пропустіть аукціон — зробіть свою ставку!

—
UkraineBoost
"""

    html = f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#161618;border:1px solid #2a2a2e;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#e63946 0%,#d62839 100%);padding:24px 32px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">🔴 Стрім розпочався!</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6;margin:0 0 16px;">
              Привіт, <strong style="color:#fff;">{user_name}</strong>!
            </p>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Стрім на <strong style="color:#fff;">UkraineBoost</strong> тільки що розпочався.
              Приєднуйтесь прямо зараз, щоб переглянути нові товари та взяти участь в аукціоні!
            </p>
            <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
              <a href="{STREAM_URL}" 
                 style="display:inline-block;background:#e63946;color:#fff;text-decoration:none;
                        padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;
                        letter-spacing:0.02em;">
                Дивитися стрім →
              </a>
            </td></tr></table>
            <p style="color:#8a8a8e;font-size:13px;line-height:1.5;margin:24px 0 0;">
              Не пропустіть! Аукціон активний тільки під час стріму.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #2a2a2e;text-align:center;">
            <p style="color:#5a5a5e;font-size:12px;margin:0;">
              © UkraineBoost — noreply@ukraineboost.com
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    return msg


async def send_email(to_email: str, message: MIMEMultipart) -> bool:
    """Send a single email via SMTP. Returns True on success."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP credentials not configured — skipping email to %s", to_email)
        return False
    try:
        await aiosmtplib.send(
            message,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASSWORD,
            start_tls=SMTP_USE_TLS,
        )
        logger.info("Email sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, e)
        return False


async def notify_stream_started(users: List[dict]) -> int:
    """
    Send stream-started notification to a list of users.
    Each user dict should have 'email' and 'name' keys.
    Returns the number of successfully sent emails.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured — skipping %d notifications", len(users))
        return 0

    tasks = []
    for user in users:
        email = user.get("email")
        name = user.get("name", "Користувач")
        if not email:
            continue
        msg = _build_stream_started_email(email, name)
        tasks.append(send_email(email, msg))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    sent = sum(1 for r in results if r is True)
    logger.info("Stream notifications: %d/%d sent successfully", sent, len(tasks))
    return sent

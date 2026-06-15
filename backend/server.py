from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import base64
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
import pyotp
import qrcode
import httpx
from io import BytesIO
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# Mongo
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# Files on disk
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

JWT_ALGORITHM = "HS256"
ACCESS_MIN = 60 * 8  # 8h so chatting session isn't cut
REFRESH_DAYS = 7

app = FastAPI(title="Leonty Secure Messenger")
api = APIRouter(prefix="/api")

# ---------- Helpers ----------
def now_utc():
    return datetime.now(timezone.utc)

def iso(dt):
    return dt.isoformat() if isinstance(dt, datetime) else dt

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def jwt_secret():
    return os.environ["JWT_SECRET"]

def create_access(user_id: str, email: str):
    payload = {"sub": user_id, "email": email,
               "exp": now_utc() + timedelta(minutes=ACCESS_MIN), "type": "access"}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh(user_id: str):
    payload = {"sub": user_id, "exp": now_utc() + timedelta(days=REFRESH_DAYS), "type": "refresh"}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)

def set_auth_cookies(resp: Response, access: str, refresh: str):
    resp.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                    max_age=ACCESS_MIN * 60, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                    max_age=REFRESH_DAYS * 86400, path="/")

def clear_auth_cookies(resp: Response):
    resp.delete_cookie("access_token", path="/")
    resp.delete_cookie("refresh_token", path="/")

def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "username": u.get("username"),
        "display_name": u.get("display_name"),
        "avatar_url": u.get("avatar_url"),
        "about_me": u.get("about_me", ""),
        "status": u.get("status", "online"),
        "two_factor_enabled": bool(u.get("two_factor_secret")),
        "is_guest": bool(u.get("is_guest", False)),
        "created_at": iso(u.get("created_at")),
    }

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    username: str
    display_name: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    totp_code: Optional[str] = None

class TwoFAVerifyIn(BaseModel):
    code: str

class UpdateProfileIn(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    about_me: Optional[str] = None
    status: Optional[str] = None  # online | idle | dnd | invisible | custom text

class ServerCreateIn(BaseModel):
    name: str
    description: Optional[str] = ""

class ChannelCreateIn(BaseModel):
    name: str
    type: str = "text"  # text | voice

class MessageCreateIn(BaseModel):
    content: str  # For channel messages: plaintext stored encrypted at-rest. Non-E2EE.
    attachment_id: Optional[str] = None

class DMSendIn(BaseModel):
    recipient_id: str
    content: str
    attachment_id: Optional[str] = None

class DMEditIn(BaseModel):
    content: str

class DMReactionIn(BaseModel):
    emoji: str

class FriendRequestIn(BaseModel):
    to_user_id: str

class JoinServerIn(BaseModel):
    invite_code: str

class GuestRegisterIn(BaseModel):
    recovery_code: str  # client-generated; used as password
    display_name: Optional[str] = None

class GuestLoginIn(BaseModel):
    username: str
    recovery_code: str

class UpgradeAccountIn(BaseModel):
    email: EmailStr
    password: str

class GoogleSessionIn(BaseModel):
    session_id: str

class CallSignalIn(BaseModel):
    to_user_id: str
    type: str  # offer | answer | candidate | hangup | ringing
    payload: dict
    call_id: Optional[str] = None

# ---------- Auth Routes ----------
@api.post("/auth/register")
async def register(body: RegisterIn, request: Request, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    if await db.users.find_one({"username": body.username}):
        raise HTTPException(400, "Username already taken")
    uid = str(uuid.uuid4())
    user = {
        "id": uid,
        "email": email,
        "username": body.username,
        "display_name": body.display_name or body.username,
        "avatar_url": None,
        "password_hash": hash_password(body.password),
        "two_factor_secret": None,
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(user)
    await log_session(request, uid, "register")
    access = create_access(uid, email)
    refresh = create_refresh(uid)
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(user), "access_token": access}

@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        await log_session(request, user["id"] if user else "unknown", "login_failed")
        raise HTTPException(401, "Invalid credentials")
    if user.get("two_factor_secret"):
        if not body.totp_code:
            return {"two_factor_required": True}
        totp = pyotp.TOTP(user["two_factor_secret"])
        if not totp.verify(body.totp_code, valid_window=1):
            raise HTTPException(401, "Invalid 2FA code")
    await log_session(request, user["id"], "login")
    access = create_access(user["id"], email)
    refresh = create_refresh(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(user), "access_token": access}

@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": public_user(user)}

@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    rt = request.cookies.get("refresh_token")
    if not rt:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(rt, jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token")
        uid = payload["sub"]
        user = await db.users.find_one({"id": uid}, {"_id": 0})
        if not user:
            raise HTTPException(401, "User missing")
        new_access = create_access(uid, user["email"])
        response.set_cookie("access_token", new_access, httponly=True, secure=True,
                            samesite="none", max_age=ACCESS_MIN * 60, path="/")
        return {"access_token": new_access}
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

# ---------- Guest ----------
@api.post("/auth/guest")
async def register_guest(body: GuestRegisterIn, request: Request, response: Response):
    suffix = secrets.token_hex(3)
    username = f"guest_{suffix}"
    email = f"{username}@guest.cipher.local"
    uid = str(uuid.uuid4())
    user = {
        "id": uid,
        "email": email,
        "username": username,
        "display_name": body.display_name or f"ضيف_{suffix}",
        "avatar_url": None,
        "password_hash": hash_password(body.recovery_code),
        "two_factor_secret": None,
        "is_guest": True,
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(user)
    await log_session(request, uid, "guest_register")
    access = create_access(uid, email)
    refresh = create_refresh(uid)
    set_auth_cookies(response, access, refresh)
    pu = public_user(user)
    pu["is_guest"] = True
    return {"user": pu, "access_token": access, "username": username}

@api.post("/auth/guest/login")
async def login_guest(body: GuestLoginIn, request: Request, response: Response):
    user = await db.users.find_one({"username": body.username, "is_guest": True}, {"_id": 0})
    if not user or not verify_password(body.recovery_code, user["password_hash"]):
        raise HTTPException(401, "اسم المستخدم أو كود الاسترجاع غير صحيح")
    await log_session(request, user["id"], "guest_login")
    access = create_access(user["id"], user["email"])
    refresh = create_refresh(user["id"])
    set_auth_cookies(response, access, refresh)
    pu = public_user(user)
    pu["is_guest"] = True
    return {"user": pu, "access_token": access}

@api.post("/auth/upgrade")
async def upgrade_account(body: UpgradeAccountIn, user: dict = Depends(get_current_user)):
    if not user.get("is_guest"):
        raise HTTPException(400, "الحساب مرقّى مسبقًا")
    new_email = body.email.lower()
    existing = await db.users.find_one({"email": new_email})
    if existing and existing["id"] != user["id"]:
        raise HTTPException(400, "البريد مستخدم مسبقًا")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "email": new_email,
            "password_hash": hash_password(body.password),
            "is_guest": False,
        }}
    )
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": public_user(u)}

# ---------- Emergent Google OAuth ----------
# REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
@api.post("/auth/google/session")
async def google_session(body: GoogleSessionIn, request: Request, response: Response):
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_id},
            )
    except httpx.HTTPError as e:
        raise HTTPException(503, f"Emergent auth unreachable: {e}")
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session_id")
    sd = r.json()
    email = (sd.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(400, "No email returned from provider")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user = existing
        updates = {}
        if not user.get("avatar_url") and sd.get("picture"):
            updates["avatar_url"] = sd["picture"]
        if not user.get("display_name") and sd.get("name"):
            updates["display_name"] = sd["name"]
        if updates:
            await db.users.update_one({"id": user["id"]}, {"$set": updates})
            user.update(updates)
    else:
        uid = str(uuid.uuid4())
        base_username = (email.split("@")[0] or "user")[:20]
        user = {
            "id": uid,
            "email": email,
            "username": f"{base_username}_{uid[:4]}",
            "display_name": sd.get("name") or base_username,
            "avatar_url": sd.get("picture"),
            "password_hash": None,
            "google_id": sd.get("id"),
            "two_factor_secret": None,
            "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(user)
    await log_session(request, user["id"], "google_login")
    access = create_access(user["id"], email)
    refresh = create_refresh(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(user), "access_token": access}

# ---------- 2FA ----------
@api.post("/auth/2fa/setup")
async def twofa_setup(user: dict = Depends(get_current_user)):
    secret = pyotp.random_base32()
    # store pending
    await db.users.update_one({"id": user["id"]}, {"$set": {"two_factor_pending": secret}})
    uri = pyotp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name="Leonty")
    # generate QR
    img = qrcode.make(uri)
    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"secret": secret, "qr_code": f"data:image/png;base64,{b64}", "uri": uri}

@api.post("/auth/2fa/verify")
async def twofa_verify(body: TwoFAVerifyIn, user: dict = Depends(get_current_user)):
    pending = user.get("two_factor_pending")
    if not pending:
        raise HTTPException(400, "No 2FA setup pending")
    if not pyotp.TOTP(pending).verify(body.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"two_factor_secret": pending},
                               "$unset": {"two_factor_pending": ""}})
    return {"enabled": True}

@api.post("/auth/2fa/disable")
async def twofa_disable(body: TwoFAVerifyIn, user: dict = Depends(get_current_user)):
    secret = user.get("two_factor_secret")
    if not secret:
        raise HTTPException(400, "2FA not enabled")
    if not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    await db.users.update_one({"id": user["id"]}, {"$unset": {"two_factor_secret": ""}})
    return {"enabled": False}

# ---------- Sessions / Devices ----------
async def log_session(request: Request, user_id: str, action: str):
    ua = request.headers.get("user-agent", "unknown")
    ip = request.client.host if request.client else "unknown"
    await db.sessions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "action": action,
        "ip": ip,
        "user_agent": ua,
        "created_at": now_utc().isoformat(),
    })

@api.get("/sessions")
async def get_sessions(user: dict = Depends(get_current_user)):
    items = await db.sessions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"sessions": items}

# ---------- Public key lookup ----------
@api.get("/users/search")
async def search_users(q: str, user: dict = Depends(get_current_user)):
    if not q:
        return {"users": []}
    cursor = db.users.find(
        {"$or": [{"username": {"$regex": q, "$options": "i"}},
                 {"display_name": {"$regex": q, "$options": "i"}},
                 {"email": {"$regex": q, "$options": "i"}}]},
        {"_id": 0}
    ).limit(20)
    return {"users": [public_user(u) async for u in cursor if u["id"] != user["id"]]}

@api.get("/users/{user_id}")
async def get_user(user_id: str, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Not found")
    return {"user": public_user(u)}

@api.patch("/users/me")
async def update_me(body: UpdateProfileIn, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": public_user(u)}

# ---------- Servers ----------
def gen_invite():
    return secrets.token_urlsafe(6)

@api.post("/servers")
async def create_server(body: ServerCreateIn, user: dict = Depends(get_current_user)):
    sid = str(uuid.uuid4())
    server = {
        "id": sid,
        "name": body.name,
        "description": body.description,
        "owner_id": user["id"],
        "invite_code": gen_invite(),
        "members": [user["id"]],
        "created_at": now_utc().isoformat(),
    }
    await db.servers.insert_one(server)
    # Default channel
    await db.channels.insert_one({
        "id": str(uuid.uuid4()),
        "server_id": sid,
        "name": "general",
        "type": "text",
        "created_at": now_utc().isoformat(),
    })
    server.pop("_id", None)
    return {"server": server}

@api.get("/servers")
async def list_servers(user: dict = Depends(get_current_user)):
    items = await db.servers.find({"members": user["id"]}, {"_id": 0}).to_list(200)
    return {"servers": items}

@api.get("/servers/{server_id}")
async def get_server(server_id: str, user: dict = Depends(get_current_user)):
    s = await db.servers.find_one({"id": server_id, "members": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Not found")
    members = await db.users.find({"id": {"$in": s["members"]}}, {"_id": 0}).to_list(500)
    return {"server": s, "members": [public_user(m) for m in members]}

@api.post("/servers/join")
async def join_server(body: JoinServerIn, user: dict = Depends(get_current_user)):
    s = await db.servers.find_one({"invite_code": body.invite_code}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Invalid invite code")
    if user["id"] not in s["members"]:
        await db.servers.update_one({"id": s["id"]}, {"$addToSet": {"members": user["id"]}})
    s = await db.servers.find_one({"id": s["id"]}, {"_id": 0})
    return {"server": s}

@api.delete("/servers/{server_id}")
async def delete_server(server_id: str, user: dict = Depends(get_current_user)):
    s = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not s or s["owner_id"] != user["id"]:
        raise HTTPException(403, "Not allowed")
    await db.servers.delete_one({"id": server_id})
    await db.channels.delete_many({"server_id": server_id})
    await db.messages.delete_many({"server_id": server_id})
    return {"ok": True}

# ---------- Channels ----------
@api.post("/servers/{server_id}/channels")
async def create_channel(server_id: str, body: ChannelCreateIn, user: dict = Depends(get_current_user)):
    s = await db.servers.find_one({"id": server_id, "members": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Server not found")
    ch = {
        "id": str(uuid.uuid4()),
        "server_id": server_id,
        "name": body.name,
        "type": body.type,
        "created_at": now_utc().isoformat(),
    }
    await db.channels.insert_one(ch)
    ch.pop("_id", None)
    return {"channel": ch}

@api.get("/servers/{server_id}/channels")
async def list_channels(server_id: str, user: dict = Depends(get_current_user)):
    s = await db.servers.find_one({"id": server_id, "members": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Not found")
    items = await db.channels.find({"server_id": server_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"channels": items}

# ---------- Messages (channel) ----------
@api.post("/channels/{channel_id}/messages")
async def send_message(channel_id: str, body: MessageCreateIn, user: dict = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Channel not found")
    s = await db.servers.find_one({"id": ch["server_id"], "members": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(403, "Not a member")
    msg = {
        "id": str(uuid.uuid4()),
        "channel_id": channel_id,
        "server_id": ch["server_id"],
        "sender_id": user["id"],
        "content": body.content,
        "attachment_id": body.attachment_id,
        "created_at": now_utc().isoformat(),
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    return {"message": msg}

@api.get("/channels/{channel_id}/messages")
async def list_messages(channel_id: str, user: dict = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Channel not found")
    s = await db.servers.find_one({"id": ch["server_id"], "members": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(403, "Not a member")
    items = await db.messages.find({"channel_id": channel_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    # hydrate senders
    sender_ids = list({m["sender_id"] for m in items})
    users = await db.users.find({"id": {"$in": sender_ids}}, {"_id": 0}).to_list(500)
    umap = {u["id"]: public_user(u) for u in users}
    for m in items:
        m["sender"] = umap.get(m["sender_id"])
    return {"messages": items}

# ---------- Direct Messages ----------
@api.post("/dms")
async def send_dm(body: DMSendIn, user: dict = Depends(get_current_user)):
    recipient = await db.users.find_one({"id": body.recipient_id}, {"_id": 0})
    if not recipient:
        raise HTTPException(404, "User not found")
    conv_id = "_".join(sorted([user["id"], body.recipient_id]))
    msg = {
        "id": str(uuid.uuid4()),
        "conversation_id": conv_id,
        "sender_id": user["id"],
        "recipient_id": body.recipient_id,
        "content": body.content,
        "attachment_id": body.attachment_id,
        "reactions": [],
        "edited_at": None,
        "deleted_at": None,
        "created_at": now_utc().isoformat(),
    }
    await db.dms.insert_one(msg)
    msg.pop("_id", None)
    return {"message": msg}

@api.patch("/dms/{message_id}")
async def edit_dm(message_id: str, body: DMEditIn, user: dict = Depends(get_current_user)):
    msg = await db.dms.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg["sender_id"] != user["id"]:
        raise HTTPException(403, "Not your message")
    if msg.get("deleted_at"):
        raise HTTPException(400, "Cannot edit deleted message")
    if msg.get("attachment_id"):
        raise HTTPException(400, "Cannot edit attachment messages")
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "Empty content")
    now_iso = now_utc().isoformat()
    await db.dms.update_one({"id": message_id}, {"$set": {"content": content, "edited_at": now_iso}})
    updated = await db.dms.find_one({"id": message_id}, {"_id": 0})
    return {"message": updated}

@api.delete("/dms/{message_id}")
async def delete_dm(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.dms.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg["sender_id"] != user["id"]:
        raise HTTPException(403, "Not your message")
    if msg.get("deleted_at"):
        return {"ok": True}
    await db.dms.update_one({"id": message_id}, {"$set": {
        "deleted_at": now_utc().isoformat(),
        "content": "",
        "attachment_id": None,
        "reactions": [],
    }})
    return {"ok": True}

@api.post("/dms/{message_id}/reactions")
async def toggle_dm_reaction(message_id: str, body: DMReactionIn, user: dict = Depends(get_current_user)):
    msg = await db.dms.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.get("deleted_at"):
        raise HTTPException(400, "Cannot react to deleted message")
    if user["id"] not in (msg["sender_id"], msg["recipient_id"]):
        raise HTTPException(403, "Not allowed")
    emoji = (body.emoji or "").strip()
    if not emoji or len(emoji) > 16:
        raise HTTPException(400, "Invalid emoji")
    reactions = msg.get("reactions") or []
    existing_idx = next((i for i, r in enumerate(reactions)
                         if r.get("emoji") == emoji and r.get("user_id") == user["id"]), None)
    if existing_idx is not None:
        reactions.pop(existing_idx)
    else:
        reactions.append({"emoji": emoji, "user_id": user["id"], "created_at": now_utc().isoformat()})
    await db.dms.update_one({"id": message_id}, {"$set": {"reactions": reactions}})
    return {"reactions": reactions}

@api.get("/dms/{user_id}")
async def get_dms(user_id: str, user: dict = Depends(get_current_user)):
    conv_id = "_".join(sorted([user["id"], user_id]))
    items = await db.dms.find({"conversation_id": conv_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.dm_reads.update_one(
        {"user_id": user["id"], "conversation_id": conv_id},
        {"$set": {"last_read_at": now_utc().isoformat()}},
        upsert=True,
    )
    return {"messages": items}

@api.post("/dms/{user_id}/read")
async def mark_dm_read(user_id: str, user: dict = Depends(get_current_user)):
    conv_id = "_".join(sorted([user["id"], user_id]))
    await db.dm_reads.update_one(
        {"user_id": user["id"], "conversation_id": conv_id},
        {"$set": {"last_read_at": now_utc().isoformat()}},
        upsert=True,
    )
    return {"ok": True}

@api.get("/dms")
async def list_conversations(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"$or": [{"sender_id": user["id"]}, {"recipient_id": user["id"]}]}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$conversation_id", "last": {"$first": "$$ROOT"}}},
    ]
    reads_cursor = db.dm_reads.find({"user_id": user["id"]}, {"_id": 0})
    reads = {r["conversation_id"]: r["last_read_at"] async for r in reads_cursor}
    convs = []
    async for row in db.dms.aggregate(pipeline):
        last = row["last"]
        partner_id = last["recipient_id"] if last["sender_id"] == user["id"] else last["sender_id"]
        partner = await db.users.find_one({"id": partner_id}, {"_id": 0})
        if not partner:
            continue
        last_read = reads.get(last["conversation_id"], "1970-01-01T00:00:00")
        unread = await db.dms.count_documents({
            "conversation_id": last["conversation_id"],
            "recipient_id": user["id"],
            "deleted_at": None,
            "created_at": {"$gt": last_read},
        })
        preview = "رسالة محذوفة" if last.get("deleted_at") else ((last.get("content") or "")[:80])
        convs.append({
            "partner": public_user(partner),
            "last_message_at": last["created_at"],
            "last_message_preview": preview,
            "unread_count": unread,
        })
    return {"conversations": convs}

# ---------- Friends ----------
@api.post("/friends/requests")
async def send_friend_request(body: FriendRequestIn, user: dict = Depends(get_current_user)):
    if body.to_user_id == user["id"]:
        raise HTTPException(400, "لا يمكن إضافة نفسك")
    target = await db.users.find_one({"id": body.to_user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "المستخدم غير موجود")
    existing = await db.friendships.find_one({
        "$or": [
            {"user_a": user["id"], "user_b": body.to_user_id},
            {"user_a": body.to_user_id, "user_b": user["id"]},
        ],
    }, {"_id": 0})
    if existing:
        raise HTTPException(400, "أنتما أصدقاء بالفعل")
    pending = await db.friend_requests.find_one({
        "$or": [
            {"from_user_id": user["id"], "to_user_id": body.to_user_id},
            {"from_user_id": body.to_user_id, "to_user_id": user["id"]},
        ],
        "status": "pending",
    }, {"_id": 0})
    if pending:
        raise HTTPException(400, "هناك طلب صداقة معلّق")
    req = {
        "id": str(uuid.uuid4()),
        "from_user_id": user["id"],
        "to_user_id": body.to_user_id,
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    await db.friend_requests.insert_one(req)
    req.pop("_id", None)
    return {"request": req}

@api.get("/friends/requests")
async def list_friend_requests(user: dict = Depends(get_current_user)):
    incoming = await db.friend_requests.find(
        {"to_user_id": user["id"], "status": "pending"}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    outgoing = await db.friend_requests.find(
        {"from_user_id": user["id"], "status": "pending"}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    user_ids = list({*[r["from_user_id"] for r in incoming], *[r["to_user_id"] for r in outgoing]})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(500)
    umap = {u["id"]: public_user(u) for u in users}
    for r in incoming:
        r["from_user"] = umap.get(r["from_user_id"])
    for r in outgoing:
        r["to_user"] = umap.get(r["to_user_id"])
    return {"incoming": incoming, "outgoing": outgoing}

@api.post("/friends/requests/{request_id}/accept")
async def accept_friend(request_id: str, user: dict = Depends(get_current_user)):
    req = await db.friend_requests.find_one({"id": request_id, "to_user_id": user["id"], "status": "pending"}, {"_id": 0})
    if not req:
        raise HTTPException(404, "طلب غير موجود")
    await db.friend_requests.update_one({"id": request_id}, {"$set": {"status": "accepted"}})
    pair = sorted([req["from_user_id"], req["to_user_id"]])
    await db.friendships.insert_one({
        "id": str(uuid.uuid4()),
        "user_a": pair[0], "user_b": pair[1],
        "created_at": now_utc().isoformat(),
    })
    return {"ok": True}

@api.post("/friends/requests/{request_id}/decline")
async def decline_friend(request_id: str, user: dict = Depends(get_current_user)):
    req = await db.friend_requests.find_one({"id": request_id, "to_user_id": user["id"], "status": "pending"}, {"_id": 0})
    if not req:
        raise HTTPException(404, "طلب غير موجود")
    await db.friend_requests.update_one({"id": request_id}, {"$set": {"status": "declined"}})
    return {"ok": True}

@api.delete("/friends/requests/{request_id}")
async def cancel_friend_request(request_id: str, user: dict = Depends(get_current_user)):
    res = await db.friend_requests.delete_one({"id": request_id, "from_user_id": user["id"], "status": "pending"})
    if res.deleted_count == 0:
        raise HTTPException(404, "غير موجود")
    return {"ok": True}

@api.get("/friends")
async def list_friends(user: dict = Depends(get_current_user)):
    fs = await db.friendships.find(
        {"$or": [{"user_a": user["id"]}, {"user_b": user["id"]}]}, {"_id": 0}
    ).to_list(500)
    friend_ids = [f["user_b"] if f["user_a"] == user["id"] else f["user_a"] for f in fs]
    users = await db.users.find({"id": {"$in": friend_ids}}, {"_id": 0}).to_list(500)
    return {"friends": [public_user(u) for u in users]}

@api.delete("/friends/{user_id}")
async def remove_friend(user_id: str, user: dict = Depends(get_current_user)):
    pair = sorted([user["id"], user_id])
    await db.friendships.delete_many({"user_a": pair[0], "user_b": pair[1]})
    return {"ok": True}

# ---------- Files ----------
MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024  # 2 GB

@api.post("/files/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    fid = str(uuid.uuid4())
    path = UPLOAD_DIR / fid
    total = 0
    with open(path, "wb") as f:
        while True:
            chunk = await file.read(4 * 1024 * 1024)  # 4MB chunks
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_SIZE:
                f.close()
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(413, "الملف يتجاوز ٢ جيجا")
            f.write(chunk)
    record = {
        "id": fid,
        "uploader_id": user["id"],
        "filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": total,
        "created_at": now_utc().isoformat(),
    }
    await db.files.insert_one(record)
    record.pop("_id", None)
    return {"file": record}

@api.get("/files/{file_id}")
async def get_file(file_id: str, user: dict = Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Not found")
    path = UPLOAD_DIR / file_id
    if not path.exists():
        raise HTTPException(404, "Missing")
    def iterfile():
        with open(path, "rb") as f:
            yield from f
    return StreamingResponse(iterfile(), media_type=rec["content_type"],
                             headers={"Content-Disposition": f'inline; filename="{rec["filename"]}"'})

@api.get("/files/{file_id}/meta")
async def get_file_meta(file_id: str, user: dict = Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Not found")
    return {"file": rec}

# ---------- Emojis ----------
@api.post("/servers/{server_id}/emojis")
async def upload_emoji(server_id: str, name: str, kind: str = "emoji", file: UploadFile = File(...),
                       user: dict = Depends(get_current_user)):
    s = await db.servers.find_one({"id": server_id, "members": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Server not found")
    name = name.strip().lower().replace(" ", "_")
    if not name or len(name) > 32:
        raise HTTPException(400, "Invalid emoji name")
    if kind not in ("emoji", "sticker"):
        raise HTTPException(400, "kind must be emoji or sticker")
    if await db.emojis.find_one({"server_id": server_id, "name": name, "kind": kind}):
        raise HTTPException(400, "Name already used in this server")
    fid = str(uuid.uuid4())
    path = UPLOAD_DIR / fid
    content = await file.read()
    max_size = 1024 * 1024 if kind == "sticker" else 512 * 1024
    if len(content) > max_size:
        raise HTTPException(400, f"{kind} must be under {max_size // 1024}KB")
    with open(path, "wb") as f:
        f.write(content)
    rec = {
        "id": fid,
        "server_id": server_id,
        "name": name,
        "kind": kind,
        "uploader_id": user["id"],
        "content_type": file.content_type or "image/png",
        "created_at": now_utc().isoformat(),
    }
    await db.emojis.insert_one(rec)
    rec.pop("_id", None)
    return {"emoji": rec}

@api.get("/servers/{server_id}/emojis")
async def list_server_emojis(server_id: str, user: dict = Depends(get_current_user)):
    s = await db.servers.find_one({"id": server_id, "members": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Server not found")
    items = await db.emojis.find({"server_id": server_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    for e in items:
        e.setdefault("kind", "emoji")
    return {"emojis": items}

@api.get("/emojis")
async def list_my_emojis(user: dict = Depends(get_current_user)):
    # All emojis from servers the user is a member of
    servers = await db.servers.find({"members": user["id"]}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    sid_map = {s["id"]: s["name"] for s in servers}
    items = await db.emojis.find({"server_id": {"$in": list(sid_map.keys())}}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for e in items:
        e["server_name"] = sid_map.get(e["server_id"], "")
        e.setdefault("kind", "emoji")
    return {"emojis": items}

@api.delete("/servers/{server_id}/emojis/{emoji_id}")
async def delete_emoji(server_id: str, emoji_id: str, user: dict = Depends(get_current_user)):
    s = await db.servers.find_one({"id": server_id, "members": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Server not found")
    emoji = await db.emojis.find_one({"id": emoji_id, "server_id": server_id}, {"_id": 0})
    if not emoji:
        raise HTTPException(404, "Not found")
    if emoji["uploader_id"] != user["id"] and s["owner_id"] != user["id"]:
        raise HTTPException(403, "Not allowed")
    await db.emojis.delete_one({"id": emoji_id})
    try:
        (UPLOAD_DIR / emoji_id).unlink(missing_ok=True)
    except Exception:
        pass
    return {"ok": True}

@api.get("/emojis/{emoji_id}/image")
async def get_emoji_image(emoji_id: str, user: dict = Depends(get_current_user)):
    rec = await db.emojis.find_one({"id": emoji_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Not found")
    path = UPLOAD_DIR / emoji_id
    if not path.exists():
        raise HTTPException(404, "Missing")
    def iterfile():
        with open(path, "rb") as f:
            yield from f
    return StreamingResponse(iterfile(), media_type=rec["content_type"])

# ---------- Calls (WebRTC signaling) ----------
@api.post("/calls/signal")
async def call_signal(body: CallSignalIn, user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"id": body.to_user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Not found")
    sig = {
        "id": str(uuid.uuid4()),
        "from_user_id": user["id"],
        "from_user": {"id": user["id"], "display_name": user.get("display_name"), "username": user.get("username")},
        "to_user_id": body.to_user_id,
        "type": body.type,
        "payload": body.payload,
        "call_id": body.call_id,
        "created_at": now_utc().isoformat(),
    }
    await db.signals.insert_one(sig)
    return {"ok": True}

@api.get("/calls/signals")
async def get_signals(user: dict = Depends(get_current_user)):
    items = await db.signals.find({"to_user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(100)
    if items:
        ids = [i["id"] for i in items]
        await db.signals.delete_many({"id": {"$in": ids}})
    return {"signals": items}

# ---------- Health ----------
@api.get("/")
async def root():
    return {"app": "Leonty", "status": "ok"}

app.include_router(api)

# CORS: for credentialed cookies we need explicit origins — but frontend uses same host via ingress so same-origin. Keep permissive for preview.
cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins != ["*"] else ["*"],
    allow_credentials=True if cors_origins != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True)
    await db.users.create_index("id", unique=True)
    await db.servers.create_index("id", unique=True)
    await db.servers.create_index("invite_code", unique=True)
    await db.channels.create_index("id", unique=True)
    await db.channels.create_index("server_id")
    await db.messages.create_index("channel_id")
    await db.dms.create_index("conversation_id")
    await db.sessions.create_index("user_id")
    await db.signals.create_index("to_user_id")
    await db.signals.create_index([("created_at", 1)], expireAfterSeconds=3600)
    await db.dm_reads.create_index([("user_id", 1), ("conversation_id", 1)], unique=True)
    await db.friend_requests.create_index("from_user_id")
    await db.friend_requests.create_index("to_user_id")
    await db.friendships.create_index([("user_a", 1), ("user_b", 1)], unique=True)
    # Admin user with placeholder keys (admin must re-register or setup keys via UI on first login)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@cipher.io")
    admin_pw = os.environ.get("ADMIN_PASSWORD", "Admin@Cipher2026")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        uid = str(uuid.uuid4())
        await db.users.insert_one({
            "id": uid,
            "email": admin_email,
            "username": "admin",
            "display_name": "Admin",
            "avatar_url": None,
            "password_hash": hash_password(admin_pw),
            "two_factor_secret": None,
            "created_at": now_utc().isoformat(),
            "role": "admin",
        })
        logger.info(f"Seeded admin user: {admin_email}")

@app.on_event("shutdown")
async def shutdown():
    client.close()

# Leonty — Romantic Pink Messenger (PRD)

## Problem Statement
ابغى موقع تواصل اجتماعي مع قاعدة حسابات تسجيل دخول وخصوصية، مشابه ل Teams أو Discord، باسم Leonty وتصميم وردي رومانسي وواجهة عربية (RTL).

## User Choices
- Auth: JWT custom (email + password) — **E2EE removed by user request**
- Features: DMs, Servers + Text Channels, File/Image/Video sharing, Voice/Video calls (WebRTC), Watch Together, Stickers/Emojis, Friends system, Unread message badges
- Privacy: Session/Device logs + 2FA (TOTP)
- Design: Pink/Rose romantic UI, Arabic RTL, named "Leonty"

## Core Architecture
- **Frontend**: React + Tailwind + Shadcn UI + lucide-react icons
- **Backend**: FastAPI + Motor (async Mongo) + bcrypt + PyJWT + pyotp + qrcode
- **Realtime**: WebRTC P2P for voice/video, polling for DMs/messages

## Implemented
- Landing page (Arabic RTL, pink rose theme)
- Auth: Register / Login / Logout / Me / Refresh / 2FA setup+verify+disable (plain JWT, no E2EE)
- Guest login flow (recovery code based)
- Workspace 4-column layout: Servers | Channels/DMs/Friends | Chat | Members
- Servers: create, list, join via invite code, delete (owner)
- Channels: create, list, auto-default "general"
- Channel messages: send, list (with sender hydration), plaintext
- DMs: send, list, plaintext (no longer E2EE)
- DM read tracking + unread badge counts per conversation
- User search (by username / email / display_name)
- Friends system: send/cancel/accept/decline requests, list friends, remove friend
- File upload / download (2GB max, chunked, supports images/videos/files)
- Custom emojis + stickers per server
- WebRTC voice/video calls + screen share
- Voice messages, Watch Together synced video
- Session/device logs (GET /api/sessions)
- 2FA enable with QR code + TOTP verify
- Settings page

## Recently Fixed (2026-06-01)
- Removed E2EE encryption requirement from auth (RegisterIn, GuestRegisterIn, UpgradeAccountIn now don't need public_key/encrypted_private_key/key_salt).
- Cleaned AuthContext.jsx of all WebCrypto key generation / decryption logic.
- Fixed Workspace.jsx FriendsModal function head (missing function declaration was breaking compile).
- Updated landing CTA from "أنشئ مساحتك" → "أنشئ حسابك" per user request.
- Removed encryption messaging from Register/Login pages.
- Verified login + register + admin login + guest register flows via curl and Playwright.

## Backlog / Next Phase (P1/P2)
- Real-time WebSocket messaging (currently polls every 3s) — replace polling.
- Brute-force lockout using login_attempts collection.
- Email verification on register.
- Push notifications.
- Server roles & permissions.
- Message edit/delete.
- Group DMs (multi-recipient).
- Typing indicators.
- Refactor: split server.py (~940 lines) into routes/auth.py, routes/servers.py, routes/dms.py, routes/friends.py for maintainability.
- Remove legacy /app/frontend/src/lib/crypto.js entirely (still used by Settings.jsx/Workspace.jsx for `fingerprint` display which is guarded by `user?.public_key` — safe but dead).

## Users
- Admin (seeded): admin@cipher.io / Admin@Cipher2026

## Files
- `/app/backend/server.py` — all endpoints (940 lines)
- `/app/frontend/src/pages/{Landing,Login,Register,Workspace,Settings}.jsx`
- `/app/frontend/src/lib/{api,crypto}.js` — crypto.js is now legacy
- `/app/frontend/src/contexts/AuthContext.jsx` — simplified, no E2EE
- `/app/frontend/src/{App.js,index.css,App.css}`

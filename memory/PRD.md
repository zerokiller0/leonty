# Cipher — Secure E2EE Messenger (PRD)

## Problem Statement
ابغى موقع تواصل اجتماعي مشفر end to end مع قاعدة حسابات تسجيل دخول وخصوصية جدا عالية والموقع يكون مشابه ل teams او ديسكورد
(End-to-end encrypted social networking site with accounts, very high privacy, similar to Teams/Discord.)

## User Choices
- Auth: JWT custom (email + password)
- Features: DMs, Servers + Text Channels, File Sharing, Voice/Video (deferred — WebRTC scaffolding)
- E2EE: True end-to-end (server stores only ciphertext)
- Privacy: Session/Device logs + 2FA (TOTP)
- Design: Modern distinctive (Swiss high-contrast dark, #0A0A0A + #00FF66 accent, Outfit/Work Sans/IBM Plex Mono)

## Core Architecture
- **Frontend**: React + Tailwind + Shadcn UI + lucide-react icons
- **Backend**: FastAPI + Motor (async Mongo) + bcrypt + PyJWT + pyotp + qrcode
- **E2EE**: RSA-OAEP 2048 (client-side, Web Crypto API) + AES-GCM 256 hybrid wrap
- **Private key storage**: PBKDF2 200K → AES-GCM-encrypted, stored in MongoDB as ciphertext only

## Implemented (2026-02-30)
- Landing page with hero, features grid, security spec, CTA
- Auth: Register (client-generates keys) / Login / Logout / Me / Refresh / 2FA setup+verify+disable
- Workspace 4-column layout: Servers | Channels/DMs | Chat | Members
- Servers: create, list, join via invite code, delete (owner)
- Channels: create, list, auto-default "general"
- Channel messages: send, list (with sender hydration)
- DMs: E2EE send (dual ciphertext: sender + recipient), list by user, list conversations
- User search (by username / email / display_name)
- File upload / download endpoints (no size cap yet)
- Session/device logs (GET /api/sessions)
- 2FA enable with QR code + TOTP verify
- Settings page: Security (2FA), Identity (public key + fingerprint), Sessions log

## Tested
- 13/13 pytest backend tests passed (iteration_1.json): register, login, 2FA round-trip, servers, channels, E2EE DMs, files, unauthorized access.

## Backlog / Next Phase (P1/P2)
- WebRTC voice/video calls (signaling via WebSocket)
- File attachment UI in chat (upload button + preview)
- Real-time WebSocket messaging (currently polls every 3s)
- Brute-force lockout using login_attempts collection
- Email verification on register
- Push notifications
- File size cap + streaming
- Server roles & permissions
- Read receipts (E2EE-compatible: hash-based)
- Message edit/delete
- Ephemeral messages (auto-delete timer)
- Group DMs (multi-recipient)
- Typing indicators

## Users
- Admin (seeded): admin@cipher.io / Admin@Cipher2026
- Test users registered per test via /register

## Files
- `/app/backend/server.py` — all endpoints
- `/app/frontend/src/pages/{Landing,Login,Register,Workspace,Settings}.jsx`
- `/app/frontend/src/lib/{api,crypto}.js`
- `/app/frontend/src/contexts/AuthContext.jsx`
- `/app/frontend/src/{App.js,index.css,App.css}`

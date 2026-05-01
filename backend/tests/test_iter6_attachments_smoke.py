"""Iter 6 smoke test — frontend now uploads images/videos/files via /api/files/upload
and references them via attachment_id on channel messages and DMs.
Backend unchanged; verify nothing regressed.
"""
import os
import io
import uuid
import base64
import struct
import zlib
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://team-secure.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _rand_b64(n=32):
    return base64.b64encode(os.urandom(n)).decode()


def _unique(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _make_png(size_bytes=200 * 1024):
    """Return PNG bytes padded to ~size_bytes via tEXt chunk."""
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = b"\x00\x00\x00\x00"
    idat = zlib.compress(raw)
    parts = [sig, chunk(b"IHDR", ihdr)]
    base_size = len(sig) + 12 + len(ihdr) + 12 + len(idat) + 12
    need = size_bytes - base_size - 12 - len(b"Comment\x00")
    if need > 0:
        parts.append(chunk(b"tEXt", b"Comment\x00" + (b"A" * need)))
    parts.append(chunk(b"IDAT", idat))
    parts.append(chunk(b"IEND", b""))
    return b"".join(parts)


def _register():
    s = requests.Session()
    uname = _unique("TEST_i6")
    payload = {
        "email": f"{uname}@test.io".lower(),
        "password": "Pass@Word1234",
        "username": uname,
        "display_name": f"Test {uname}",
        "public_key": _rand_b64(64),
        "encrypted_private_key": _rand_b64(128),
        "key_salt": _rand_b64(16),
    }
    r = s.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return s, data["user"]


def _upload(sess, filename, content_type, body):
    files = {"file": (filename, io.BytesIO(body), content_type)}
    r = sess.post(f"{API}/files/upload", files=files)
    assert r.status_code == 200, r.text
    return r.json()["file"]


# ============ /api/files/upload — image / video / pdf ============
def test_upload_image_png_200kb():
    s, _ = _register()
    body = _make_png(200 * 1024)
    f = _upload(s, "pic.png", "image/png", body)
    assert "id" in f and len(f["id"]) >= 8
    assert f["content_type"] == "image/png"
    assert f["filename"] == "pic.png"
    assert f["size"] == len(body)


def test_upload_video_mp4_1mb():
    s, _ = _register()
    body = b"\x00\x00\x00\x18ftypmp42" + os.urandom(1024 * 1024 - 8)
    f = _upload(s, "clip.mp4", "video/mp4", body)
    assert f["content_type"] == "video/mp4"
    assert f["size"] == len(body)
    # GET /files/{id} streams back
    r = s.get(f"{API}/files/{f['id']}")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("video/mp4")
    assert len(r.content) == len(body)


def test_upload_pdf():
    s, _ = _register()
    body = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n" + os.urandom(20_000) + b"\n%%EOF"
    f = _upload(s, "doc.pdf", "application/pdf", body)
    assert f["content_type"] == "application/pdf"
    r = s.get(f"{API}/files/{f['id']}")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")


# ============ Channel message + attachment_id ============
def test_channel_message_with_attachment_id():
    s, user = _register()
    # create server + channel
    r = s.post(f"{API}/servers", json={"name": _unique("Srv"), "description": "t"})
    assert r.status_code == 200
    server = r.json()["server"]
    r = s.post(f"{API}/servers/{server['id']}/channels", json={"name": "general", "type": "text"})
    assert r.status_code == 200
    ch = r.json()["channel"]
    # upload file
    f = _upload(s, "a.png", "image/png", _make_png(20 * 1024))
    # send message with attachment_id
    r = s.post(f"{API}/channels/{ch['id']}/messages",
               json={"content": "look at this", "attachment_id": f["id"]})
    assert r.status_code == 200, r.text
    msg = r.json()["message"]
    assert msg["attachment_id"] == f["id"]
    assert msg["content"] == "look at this"
    # GET returns attachment_id
    r = s.get(f"{API}/channels/{ch['id']}/messages")
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert any(m["attachment_id"] == f["id"] for m in msgs)
    # also send message without attachment — still works
    r = s.post(f"{API}/channels/{ch['id']}/messages", json={"content": "no file"})
    assert r.status_code == 200
    assert r.json()["message"]["attachment_id"] is None


# ============ DM (E2EE) + attachment_id ============
def test_dm_with_attachment_id():
    s_a, ua = _register()
    s_b, ub = _register()
    f = _upload(s_a, "doc.pdf", "application/pdf", b"%PDF-1.4 hello")
    body = {
        "recipient_id": ub["id"],
        "sender_ciphertext": _rand_b64(48),
        "recipient_ciphertext": _rand_b64(48),
        "attachment_id": f["id"],
    }
    r = s_a.post(f"{API}/dms", json=body)
    assert r.status_code == 200, r.text
    msg = r.json()["message"]
    assert msg["attachment_id"] == f["id"]
    # recipient fetches the conversation
    r = s_b.get(f"{API}/dms/{ua['id']}")
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert any(m["attachment_id"] == f["id"] for m in msgs)


# ============ Smoke: profile PATCH still works ============
def test_profile_patch_smoke():
    s, _ = _register()
    r = s.patch(f"{API}/users/me", json={"about_me": "hi", "status": "idle"})
    assert r.status_code == 200
    u = r.json()["user"]
    assert u["about_me"] == "hi"
    assert u["status"] == "idle"


# ============ Smoke: emoji upload still works ============
def test_emoji_upload_smoke():
    s, _ = _register()
    r = s.post(f"{API}/servers", json={"name": _unique("Srv"), "description": "t"})
    server = r.json()["server"]
    files = {"file": ("e.png", io.BytesIO(_make_png(5 * 1024)), "image/png")}
    r = s.post(f"{API}/servers/{server['id']}/emojis",
               params={"name": _unique("emj"), "kind": "emoji"}, files=files)
    assert r.status_code in (200, 201), r.text
    assert r.json()["emoji"]["kind"] == "emoji"


# ============ Smoke: calls/signaling endpoints reachable ============
def test_signal_endpoint_smoke():
    s_a, ua = _register()
    s_b, ub = _register()
    payload = {"to_user_id": ub["id"], "type": "offer", "payload": {"sdp": "v=0"}, "call_id": str(uuid.uuid4())}
    r = s_a.post(f"{API}/calls/signal", json=payload)
    assert r.status_code == 200, f"signal post unexpected: {r.status_code} {r.text}"
    assert r.json().get("ok") is True
    # recipient retrieves and queue is drained
    r = s_b.get(f"{API}/calls/signals")
    assert r.status_code == 200
    sigs = r.json()["signals"]
    assert any(sig["from_user_id"] == ua["id"] and sig["type"] == "offer" for sig in sigs)

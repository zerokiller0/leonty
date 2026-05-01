"""Iteration 4 — Leonty backend tests:
- Profile fields: about_me, status
- Emoji kind: sticker (≤1MB) vs emoji (≤512KB)
- /api/files/upload chunked streaming with 2GB limit
- /api/ returns {app: 'Leonty'}
"""
import os
import io
import base64
import uuid
import struct
import zlib
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://team-secure.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _rand_b64(n=32):
    return base64.b64encode(os.urandom(n)).decode()


def _unique(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _make_png(width=1, height=1, size_bytes=None):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\x00\x00\x00" * width for _ in range(height))
    idat = zlib.compress(raw)
    parts = [sig, chunk(b"IHDR", ihdr)]
    if size_bytes:
        current = len(sig) + 12 + len(ihdr) + 12 + len(idat) + 12
        need = size_bytes - current - 12 - len(b"Comment\x00")
        if need > 0:
            text = b"Comment\x00" + (b"A" * need)
            parts.append(chunk(b"tEXt", text))
    parts.append(chunk(b"IDAT", idat))
    parts.append(chunk(b"IEND", b""))
    return b"".join(parts)


def _register_user(suffix=""):
    s = requests.Session()
    uname = _unique("TEST_i4" + suffix)
    email = f"{uname}@test.io".lower()
    payload = {
        "email": email,
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
    return s, data["user"], email, payload["password"]


def _create_server(sess):
    r = sess.post(f"{API}/servers", json={"name": f"TEST_i4_Srv_{uuid.uuid4().hex[:6]}", "description": "t"})
    assert r.status_code == 200, r.text
    return r.json()["server"]


# ============ Root endpoint ============
def test_root_returns_leonty():
    r = requests.get(f"{API}/")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("app") == "Leonty", body


# ============ Profile (about_me, status) ============
def test_patch_users_me_all_fields():
    s, user, *_ = _register_user("p1")
    payload = {
        "display_name": "NewDisplay",
        "about_me": "I love secure messaging.",
        "status": "dnd",
        "avatar_url": "https://cdn.example.com/a.png",
    }
    r = s.patch(f"{API}/users/me", json=payload)
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["display_name"] == "NewDisplay"
    assert u["about_me"] == "I love secure messaging."
    assert u["status"] == "dnd"
    assert u["avatar_url"] == "https://cdn.example.com/a.png"

    # GET /auth/me reflects the same
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200
    me = r.json()["user"]
    assert me["display_name"] == "NewDisplay"
    assert me["about_me"] == "I love secure messaging."
    assert me["status"] == "dnd"
    assert me["avatar_url"] == "https://cdn.example.com/a.png"


def test_patch_users_me_empty_body():
    s, user, *_ = _register_user("p2")
    # set baseline
    s.patch(f"{API}/users/me", json={"about_me": "bio"})
    r = s.patch(f"{API}/users/me", json={})
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    # unchanged
    assert u["about_me"] == "bio"
    assert "status" in u and "about_me" in u


def test_get_user_includes_about_me_and_status():
    s_a, a, *_ = _register_user("p3a")
    s_a.patch(f"{API}/users/me", json={"about_me": "hello world", "status": "idle"})
    s_b, b, *_ = _register_user("p3b")
    r = s_b.get(f"{API}/users/{a['id']}")
    assert r.status_code == 200
    u = r.json()["user"]
    assert u["id"] == a["id"]
    assert u["about_me"] == "hello world"
    assert u["status"] == "idle"
    # Defaults present even before any profile edits
    s_c, c, *_ = _register_user("p3c")
    r = s_b.get(f"{API}/users/{c['id']}")
    cu = r.json()["user"]
    assert "about_me" in cu and "status" in cu
    assert cu["status"] == "online"


# ============ Emoji kind: sticker vs emoji ============
def _upload(sess, server_id, name, kind, png_bytes=None):
    if png_bytes is None:
        png_bytes = _make_png()
    files = {"file": ("e.png", io.BytesIO(png_bytes), "image/png")}
    return sess.post(f"{API}/servers/{server_id}/emojis",
                     params={"name": name, "kind": kind}, files=files)


def test_upload_sticker_succeeds_and_records_kind():
    s, _, *_ = _register_user("st1")
    sv = _create_server(s)
    r = _upload(s, sv["id"], _unique("st"), "sticker")
    assert r.status_code in (200, 201), r.text
    e = r.json()["emoji"]
    assert e.get("kind") == "sticker", f"missing/wrong kind in response: {e}"


def test_upload_emoji_kind_succeeds_and_records_kind():
    s, _, *_ = _register_user("em1")
    sv = _create_server(s)
    r = _upload(s, sv["id"], _unique("em"), "emoji")
    assert r.status_code in (200, 201), r.text
    e = r.json()["emoji"]
    assert e.get("kind") == "emoji", f"missing/wrong kind in response: {e}"


def test_upload_invalid_kind_400():
    s, _, *_ = _register_user("inv")
    sv = _create_server(s)
    r = _upload(s, sv["id"], _unique("bad"), "invalid")
    assert r.status_code == 400, f"expected 400 for kind=invalid, got {r.status_code}: {r.text}"


def test_sticker_over_1mb_rejected():
    s, _, *_ = _register_user("stbig")
    sv = _create_server(s)
    big = _make_png(size_bytes=1100 * 1024)  # ~1.1 MB
    assert len(big) > 1024 * 1024
    r = _upload(s, sv["id"], _unique("stb"), "sticker", png_bytes=big)
    assert r.status_code == 400, f"expected 400 for sticker>1MB, got {r.status_code}"


def test_emoji_over_512kb_rejected():
    s, _, *_ = _register_user("embig")
    sv = _create_server(s)
    big = _make_png(size_bytes=600 * 1024)  # ~600 KB
    assert len(big) > 512 * 1024
    r = _upload(s, sv["id"], _unique("emb"), "emoji", png_bytes=big)
    assert r.status_code == 400, f"expected 400 for emoji>512KB, got {r.status_code}"


def test_sticker_900kb_succeeds():
    """Edge: 900KB sticker should succeed (under 1MB limit)."""
    s, _, *_ = _register_user("stmid")
    sv = _create_server(s)
    mid = _make_png(size_bytes=900 * 1024)
    assert 512 * 1024 < len(mid) < 1024 * 1024
    r = _upload(s, sv["id"], _unique("stmid"), "sticker", png_bytes=mid)
    assert r.status_code in (200, 201), \
        f"900KB sticker rejected (status {r.status_code}); kind=sticker should allow up to 1MB: {r.text}"


def test_list_server_emojis_includes_kind():
    s, _, *_ = _register_user("lst")
    sv = _create_server(s)
    _upload(s, sv["id"], "alpha_em", "emoji")
    _upload(s, sv["id"], "beta_st", "sticker")
    r = s.get(f"{API}/servers/{sv['id']}/emojis")
    assert r.status_code == 200
    items = r.json()["emojis"]
    by_name = {e["name"]: e for e in items}
    assert "alpha_em" in by_name and "beta_st" in by_name
    assert by_name["alpha_em"].get("kind") == "emoji", by_name["alpha_em"]
    assert by_name["beta_st"].get("kind") == "sticker", by_name["beta_st"]


def test_list_my_emojis_includes_kind():
    s, _, *_ = _register_user("lstmy")
    sv = _create_server(s)
    _upload(s, sv["id"], "mine_em", "emoji")
    _upload(s, sv["id"], "mine_st", "sticker")
    r = s.get(f"{API}/emojis")
    assert r.status_code == 200
    items = r.json()["emojis"]
    by_name = {e["name"]: e for e in items}
    assert by_name["mine_em"].get("kind") == "emoji"
    assert by_name["mine_st"].get("kind") == "sticker"


# ============ Files upload chunked / 2GB ============
def test_upload_5mb_file_streams_back():
    s, _, *_ = _register_user("fup")
    blob = os.urandom(5 * 1024 * 1024)  # 5 MB binary
    files = {"file": ("clip.bin", io.BytesIO(blob), "video/mp4")}
    r = s.post(f"{API}/files/upload", files=files)
    assert r.status_code == 200, r.text
    rec = r.json()["file"]
    assert rec["size"] == len(blob)
    assert rec["content_type"] == "video/mp4"
    fid = rec["id"]
    r = s.get(f"{API}/files/{fid}")
    assert r.status_code == 200
    assert r.content == blob


# ============ Regression sanity (iter 1-3 still works) ============
def test_regression_login_servers_messages():
    s, user, email, pw = _register_user("rg")
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200
    sv = _create_server(s)
    r = s.get(f"{API}/servers/{sv['id']}/channels")
    assert r.status_code == 200
    ch = r.json()["channels"][0]
    r = s.post(f"{API}/channels/{ch['id']}/messages", json={"content": "iter4 regression"})
    assert r.status_code == 200

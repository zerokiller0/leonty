"""Cipher backend test suite - covers auth, 2FA, servers, channels, messages, DMs, files."""
import os
import base64
import uuid
import io
import pytest
import pyotp
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://team-secure.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _rand_b64(n=32):
    return base64.b64encode(os.urandom(n)).decode()


def _unique(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _register(suffix=""):
    s = requests.Session()
    uname = _unique("TEST_u" + suffix)
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
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s, data["user"], email, payload["password"], token


# ---------- Health ----------
def test_health():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---------- Auth ----------
def test_register_and_me():
    sess, user, email, _, token = _register()
    assert user["email"] == email
    assert user["two_factor_enabled"] is False
    r = sess.get(f"{API}/auth/me")
    assert r.status_code == 200
    assert r.json()["user"]["id"] == user["id"]
    assert r.json()["encrypted_private_key"]


def test_register_duplicate_email():
    sess, user, email, pw, _ = _register()
    payload = {
        "email": email, "password": pw, "username": _unique("TEST_u2"),
        "public_key": _rand_b64(), "encrypted_private_key": _rand_b64(), "key_salt": _rand_b64(),
    }
    r = requests.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 400


def test_login_success_and_invalid():
    _, user, email, pw, _ = _register()
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200
    d = r.json()
    assert d["user"]["email"] == email
    assert d["access_token"]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
    assert r.status_code == 401


def test_me_unauthorized():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_logout():
    sess, *_ = _register()
    r = sess.post(f"{API}/auth/logout")
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ---------- 2FA ----------
def test_2fa_setup_verify_and_login_flow():
    sess, user, email, pw, _ = _register("2fa")
    r = sess.post(f"{API}/auth/2fa/setup")
    assert r.status_code == 200
    d = r.json()
    assert d["qr_code"].startswith("data:image/png;base64,")
    secret = d["secret"]
    # wrong code
    r = sess.post(f"{API}/auth/2fa/verify", json={"code": "000000"})
    assert r.status_code == 400
    # correct code
    code = pyotp.TOTP(secret).now()
    r = sess.post(f"{API}/auth/2fa/verify", json={"code": code})
    assert r.status_code == 200 and r.json()["enabled"] is True
    # login without totp returns two_factor_required
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200
    assert r.json().get("two_factor_required") is True
    # login with totp
    code = pyotp.TOTP(secret).now()
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw, "totp_code": code})
    assert r.status_code == 200
    assert "access_token" in r.json()


# ---------- Sessions ----------
def test_sessions():
    sess, *_ = _register()
    r = sess.get(f"{API}/sessions")
    assert r.status_code == 200
    assert len(r.json()["sessions"]) >= 1


# ---------- Users search ----------
def test_user_search_excludes_self():
    sess, user, *_ = _register("search")
    r = sess.get(f"{API}/users/search", params={"q": user["username"]})
    assert r.status_code == 200
    ids = [u["id"] for u in r.json()["users"]]
    assert user["id"] not in ids


# ---------- Servers / Channels / Messages ----------
def test_servers_channels_messages_flow():
    sess, user, *_ = _register("srv")
    # create server
    r = sess.post(f"{API}/servers", json={"name": "TEST_Server", "description": "t"})
    assert r.status_code == 200
    server = r.json()["server"]
    sid = server["id"]
    assert server["invite_code"]
    # list servers
    r = sess.get(f"{API}/servers")
    assert r.status_code == 200
    assert any(s["id"] == sid for s in r.json()["servers"])
    # get server details
    r = sess.get(f"{API}/servers/{sid}")
    assert r.status_code == 200
    assert len(r.json()["members"]) == 1
    # default channel auto-created
    r = sess.get(f"{API}/servers/{sid}/channels")
    assert r.status_code == 200
    channels = r.json()["channels"]
    assert any(c["name"] == "general" for c in channels)
    # create channel
    r = sess.post(f"{API}/servers/{sid}/channels", json={"name": "random", "type": "text"})
    assert r.status_code == 200
    ch_id = r.json()["channel"]["id"]
    # send message
    r = sess.post(f"{API}/channels/{ch_id}/messages", json={"content": "hello world"})
    assert r.status_code == 200
    # list messages with sender hydrated
    r = sess.get(f"{API}/channels/{ch_id}/messages")
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert len(msgs) == 1
    assert msgs[0]["sender"]["id"] == user["id"]
    # join flow: another user joins via invite
    sess2, user2, *_ = _register("join")
    r = sess2.post(f"{API}/servers/join", json={"invite_code": server["invite_code"]})
    assert r.status_code == 200
    assert user2["id"] in r.json()["server"]["members"]
    # invalid invite
    r = sess2.post(f"{API}/servers/join", json={"invite_code": "bad-code-xyz"})
    assert r.status_code == 404


# ---------- DMs ----------
def test_dms_flow():
    alice_sess, alice, *_ = _register("alice")
    bob_sess, bob, *_ = _register("bob")
    payload = {
        "recipient_id": bob["id"],
        "sender_ciphertext": _rand_b64(),
        "recipient_ciphertext": _rand_b64(),
    }
    r = alice_sess.post(f"{API}/dms", json=payload)
    assert r.status_code == 200
    m = r.json()["message"]
    assert m["sender_ciphertext"] and m["recipient_ciphertext"]
    # get conversation as alice
    r = alice_sess.get(f"{API}/dms/{bob['id']}")
    assert r.status_code == 200
    assert len(r.json()["messages"]) >= 1
    # bob sees same conversation
    r = bob_sess.get(f"{API}/dms/{alice['id']}")
    assert r.status_code == 200
    assert len(r.json()["messages"]) >= 1
    # list conversations aggregated
    r = alice_sess.get(f"{API}/dms")
    assert r.status_code == 200
    convs = r.json()["conversations"]
    assert any(c["partner"]["id"] == bob["id"] for c in convs)


# ---------- Files ----------
def test_file_upload_and_download():
    sess, *_ = _register("file")
    content = b"Hello Cipher file contents " + os.urandom(8)
    files = {"file": ("hello.txt", io.BytesIO(content), "text/plain")}
    r = sess.post(f"{API}/files/upload", files=files)
    assert r.status_code == 200, r.text
    fid = r.json()["file"]["id"]
    assert r.json()["file"]["size"] == len(content)
    # download
    r = sess.get(f"{API}/files/{fid}")
    assert r.status_code == 200
    assert r.content == content


# ---------- Unauthorized ----------
def test_unauthorized_endpoints():
    for path in ["/servers", "/dms", "/sessions", "/users/search?q=a"]:
        r = requests.get(f"{API}{path}")
        assert r.status_code == 401, f"{path} should require auth"

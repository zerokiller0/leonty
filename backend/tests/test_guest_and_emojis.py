"""Cipher backend test suite - Guest registration/login/upgrade + custom server emojis."""
import os
import io
import base64
import uuid
import secrets
import string
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://team-secure.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- helpers ----------------
def _rand_b64(n=32):
    return base64.b64encode(os.urandom(n)).decode()


def _unique(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _make_png(width=1, height=1, size_bytes=None):
    """Create a minimal valid PNG. If size_bytes given, pad via an ancillary chunk (tEXt) to reach target size."""
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # RGB, 8-bit
    raw = b"".join(b"\x00" + b"\x00\x00\x00" * width for _ in range(height))
    idat = zlib.compress(raw)
    parts = [sig, chunk(b"IHDR", ihdr)]
    if size_bytes:
        # pad with tEXt ancillary chunk
        current = len(sig) + 12 + len(ihdr) + 12 + len(idat) + 12  # IHDR, IDAT, IEND
        need = size_bytes - current - 12 - len(b"Comment\x00")  # tEXt chunk overhead
        if need > 0:
            text = b"Comment\x00" + (b"A" * need)
            parts.append(chunk(b"tEXt", text))
    parts.append(chunk(b"IDAT", idat))
    parts.append(chunk(b"IEND", b""))
    return b"".join(parts)


def _recovery_code():
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(16))


def _register_user(suffix=""):
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
    assert r.status_code == 200, r.text
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return s, data["user"], email, payload["password"]


def _register_guest():
    s = requests.Session()
    rc = _recovery_code()
    payload = {
        "public_key": _rand_b64(64),
        "encrypted_private_key": _rand_b64(128),
        "key_salt": _rand_b64(16),
        "recovery_code": rc,
        "display_name": "TEST_Guest",
    }
    r = s.post(f"{API}/auth/guest", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return s, data, rc


# ============= GUEST TESTS =============

def test_guest_register_returns_user_and_token():
    s, data, rc = _register_guest()
    assert "user" in data and "access_token" in data
    assert "username" in data and data["username"].startswith("guest_")
    assert data["user"]["is_guest"] is True
    assert data["encrypted_private_key"]
    assert data["key_salt"]
    # verify /auth/me works
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200
    me = r.json()["user"]
    assert me["id"] == data["user"]["id"]
    assert me.get("is_guest") is True


def test_guest_login_correct_recovery_code():
    _, data, rc = _register_guest()
    username = data["username"]
    r = requests.post(f"{API}/auth/guest/login", json={"username": username, "recovery_code": rc})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["id"] == data["user"]["id"]
    assert d["access_token"]
    assert d.get("encrypted_private_key") == data["encrypted_private_key"]


def test_guest_login_wrong_recovery_code():
    _, data, _ = _register_guest()
    r = requests.post(f"{API}/auth/guest/login",
                      json={"username": data["username"], "recovery_code": "WRONG1234567890A"})
    assert r.status_code == 401


def test_guest_login_non_guest_user():
    # register a normal user
    _, user, email, pw = _register_user("nonguest")
    r = requests.post(f"{API}/auth/guest/login",
                      json={"username": user["username"], "recovery_code": pw})
    assert r.status_code == 401


def test_upgrade_guest_to_permanent():
    s, data, rc = _register_guest()
    new_email = _unique("TEST_upg") + "@test.io"
    new_pw = "Upgraded@Pass1234"
    payload = {
        "email": new_email,
        "password": new_pw,
        "encrypted_private_key": _rand_b64(128),
        "key_salt": _rand_b64(16),
    }
    r = s.post(f"{API}/auth/upgrade", json=payload)
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["email"] == new_email.lower()
    assert u.get("is_guest") is False

    # Login via /auth/login with the new credentials
    r = requests.post(f"{API}/auth/login", json={"email": new_email, "password": new_pw})
    assert r.status_code == 200
    assert r.json()["user"]["id"] == data["user"]["id"]


def test_upgrade_non_guest_rejected():
    s, user, email, pw = _register_user("regupg")
    payload = {
        "email": _unique("TEST_nope") + "@test.io",
        "password": "Whatever@123",
        "encrypted_private_key": _rand_b64(128),
        "key_salt": _rand_b64(16),
    }
    r = s.post(f"{API}/auth/upgrade", json=payload)
    assert r.status_code == 400


def test_upgrade_duplicate_email():
    # existing user
    _, existing_user, existing_email, _ = _register_user("exist")
    # new guest trying to upgrade to same email
    s, data, rc = _register_guest()
    payload = {
        "email": existing_email,
        "password": "Whatever@123",
        "encrypted_private_key": _rand_b64(128),
        "key_salt": _rand_b64(16),
    }
    r = s.post(f"{API}/auth/upgrade", json=payload)
    assert r.status_code == 400


# ============= EMOJI TESTS =============

def _create_server(sess, name_suffix=""):
    r = sess.post(f"{API}/servers", json={"name": f"TEST_EmojiSrv_{uuid.uuid4().hex[:6]}", "description": "t"})
    assert r.status_code == 200, r.text
    return r.json()["server"]


def _upload_emoji(sess, server_id, name, png_bytes=None, content_type="image/png", expect=201):
    if png_bytes is None:
        png_bytes = _make_png()
    files = {"file": ("e.png", io.BytesIO(png_bytes), content_type)}
    r = sess.post(f"{API}/servers/{server_id}/emojis", params={"name": name}, files=files)
    return r


def test_emoji_upload_by_member():
    sess, user, *_ = _register_user("emoup")
    server = _create_server(sess)
    r = _upload_emoji(sess, server["id"], "happy_face")
    # endpoint returns 200 (not 201) by FastAPI default; accept either
    assert r.status_code in (200, 201), r.text
    emoji = r.json()["emoji"]
    assert emoji["name"] == "happy_face"
    assert emoji["server_id"] == server["id"]
    assert emoji["uploader_id"] == user["id"]
    assert "id" in emoji


def test_emoji_duplicate_name_in_same_server():
    sess, _, *_ = _register_user("emodup")
    server = _create_server(sess)
    r1 = _upload_emoji(sess, server["id"], "dup_name")
    assert r1.status_code in (200, 201)
    r2 = _upload_emoji(sess, server["id"], "dup_name")
    assert r2.status_code == 400


def test_emoji_upload_size_limit_exceeded():
    sess, _, *_ = _register_user("emobig")
    server = _create_server(sess)
    big = _make_png(size_bytes=600 * 1024)  # ~600KB
    assert len(big) > 512 * 1024
    r = _upload_emoji(sess, server["id"], "toobig", png_bytes=big)
    assert r.status_code == 400


def test_emoji_upload_by_non_member():
    sess_owner, _, *_ = _register_user("emoown")
    server = _create_server(sess_owner)
    sess_stranger, _, *_ = _register_user("emostr")
    r = _upload_emoji(sess_stranger, server["id"], "nope")
    assert r.status_code == 404


def test_list_server_emojis():
    sess, _, *_ = _register_user("emolst")
    server = _create_server(sess)
    _upload_emoji(sess, server["id"], "alpha")
    _upload_emoji(sess, server["id"], "beta")
    r = sess.get(f"{API}/servers/{server['id']}/emojis")
    assert r.status_code == 200
    names = [e["name"] for e in r.json()["emojis"]]
    assert "alpha" in names and "beta" in names


def test_list_my_emojis_only_from_member_servers():
    # user A owns server with emoji
    a_sess, a_user, *_ = _register_user("emoA")
    a_server = _create_server(a_sess)
    _upload_emoji(a_sess, a_server["id"], "a_only")

    # user B owns a different server with different emoji
    b_sess, b_user, *_ = _register_user("emoB")
    b_server = _create_server(b_sess)
    _upload_emoji(b_sess, b_server["id"], "b_only")

    # A should see only a_only in /emojis, not b_only
    r = a_sess.get(f"{API}/emojis")
    assert r.status_code == 200
    items = r.json()["emojis"]
    names = [e["name"] for e in items]
    assert "a_only" in names
    assert "b_only" not in names
    # server_name attached
    a_emoji = next(e for e in items if e["name"] == "a_only")
    assert a_emoji.get("server_name") == a_server["name"]

    # B joins A's server via invite → now sees a_only
    r = b_sess.post(f"{API}/servers/join", json={"invite_code": a_server["invite_code"]})
    assert r.status_code == 200
    r = b_sess.get(f"{API}/emojis")
    assert r.status_code == 200
    names = [e["name"] for e in r.json()["emojis"]]
    assert "a_only" in names and "b_only" in names


def test_emoji_delete_by_uploader():
    sess, _, *_ = _register_user("emodelU")
    server = _create_server(sess)
    r = _upload_emoji(sess, server["id"], "to_del")
    emoji_id = r.json()["emoji"]["id"]
    r = sess.delete(f"{API}/servers/{server['id']}/emojis/{emoji_id}")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    # confirm gone
    r = sess.get(f"{API}/servers/{server['id']}/emojis")
    assert all(e["id"] != emoji_id for e in r.json()["emojis"])


def test_emoji_delete_by_server_owner():
    owner_sess, owner, *_ = _register_user("emoOwn")
    server = _create_server(owner_sess)
    # invite a member
    member_sess, member, *_ = _register_user("emoMem")
    r = member_sess.post(f"{API}/servers/join", json={"invite_code": server["invite_code"]})
    assert r.status_code == 200
    # member uploads emoji
    r = _upload_emoji(member_sess, server["id"], "mem_emo")
    emoji_id = r.json()["emoji"]["id"]
    # owner deletes
    r = owner_sess.delete(f"{API}/servers/{server['id']}/emojis/{emoji_id}")
    assert r.status_code == 200


def test_emoji_delete_by_random_member_forbidden():
    owner_sess, owner, *_ = _register_user("emoO2")
    server = _create_server(owner_sess)
    # uploader (owner) uploads
    r = _upload_emoji(owner_sess, server["id"], "owner_emo")
    emoji_id = r.json()["emoji"]["id"]
    # random member joins
    rand_sess, rand, *_ = _register_user("emoRand")
    r = rand_sess.post(f"{API}/servers/join", json={"invite_code": server["invite_code"]})
    assert r.status_code == 200
    # random member tries to delete
    r = rand_sess.delete(f"{API}/servers/{server['id']}/emojis/{emoji_id}")
    assert r.status_code == 403


def test_emoji_image_bytes():
    sess, _, *_ = _register_user("emoimg")
    server = _create_server(sess)
    png = _make_png()
    r = _upload_emoji(sess, server["id"], "img_test", png_bytes=png)
    emoji_id = r.json()["emoji"]["id"]
    r = sess.get(f"{API}/emojis/{emoji_id}/image")
    assert r.status_code == 200
    assert r.content == png
    assert r.headers.get("content-type", "").startswith("image/")


# ============= REGRESSION (sanity) =============

def test_regression_core_endpoints():
    # register + login + me
    s, user, email, pw = _register_user("reg")
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200
    # server list + create channel message
    server = _create_server(s)
    r = s.get(f"{API}/servers/{server['id']}/channels")
    assert r.status_code == 200
    ch = r.json()["channels"][0]
    r = s.post(f"{API}/channels/{ch['id']}/messages", json={"content": "hi from regression"})
    assert r.status_code == 200
    # DMs list works
    r = s.get(f"{API}/dms")
    assert r.status_code == 200

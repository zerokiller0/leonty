"""Iteration 3 — Cipher WebRTC signaling endpoints.
Covers POST /api/calls/signal and GET /api/calls/signals (auth, scoping, types, errors)."""
import os
import base64
import uuid
import json
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://team-secure.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _rand_b64(n=32):
    return base64.b64encode(os.urandom(n)).decode()


def _unique(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _register(suffix=""):
    s = requests.Session()
    uname = _unique("TEST_call" + suffix)
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
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return s, data["user"]


# ---------- POST /api/calls/signal + GET /api/calls/signals ----------

def test_signal_offer_stored_and_retrievable_with_from_user():
    """POST offer → GET returns it with embedded from_user {id,display_name,username}; then deletes (GET again empty)."""
    alice_sess, alice = _register("aA")
    bob_sess, bob = _register("bB")

    call_id = str(uuid.uuid4())
    sdp_payload = {"sdp": "v=0\r\no=- 123 456 IN IP4 0.0.0.0\r\n", "type": "offer"}
    r = alice_sess.post(f"{API}/calls/signal", json={
        "to_user_id": bob["id"],
        "type": "offer",
        "payload": sdp_payload,
        "call_id": call_id,
    })
    assert r.status_code == 200, f"POST signal failed: {r.status_code} {r.text}"
    assert r.json().get("ok") is True

    # Bob fetches — should get exactly that signal
    r = bob_sess.get(f"{API}/calls/signals")
    assert r.status_code == 200
    body = r.json()
    assert "signals" in body
    sigs = body["signals"]
    assert len(sigs) >= 1
    # Find the signal we just sent
    matching = [s for s in sigs if s.get("call_id") == call_id]
    assert len(matching) == 1, f"expected 1 matching signal, got {len(matching)}"
    sig = matching[0]

    # Core fields
    assert sig["type"] == "offer"
    assert sig["payload"] == sdp_payload
    assert sig["to_user_id"] == bob["id"]
    assert sig["from_user_id"] == alice["id"]
    assert "created_at" in sig and isinstance(sig["created_at"], str)
    assert "id" in sig
    # No mongo _id leakage
    assert "_id" not in sig

    # Embedded from_user
    assert "from_user" in sig
    fu = sig["from_user"]
    assert fu["id"] == alice["id"]
    assert fu["display_name"] == alice["display_name"]
    assert fu["username"] == alice["username"]

    # Subsequent call must be empty (signals consumed/deleted)
    r2 = bob_sess.get(f"{API}/calls/signals")
    assert r2.status_code == 200
    # Filter out anything that wasn't ours (shouldn't be any, but be safe)
    remaining = [s for s in r2.json()["signals"] if s.get("call_id") == call_id]
    assert remaining == [], "signals should be deleted after retrieval"


def test_signal_answer_retrievable_by_recipient():
    alice_sess, alice = _register("ansA")
    bob_sess, bob = _register("ansB")
    call_id = str(uuid.uuid4())
    answer = {"sdp": "v=0\r\no=answer\r\n", "type": "answer"}
    r = bob_sess.post(f"{API}/calls/signal", json={
        "to_user_id": alice["id"], "type": "answer", "payload": answer, "call_id": call_id,
    })
    assert r.status_code == 200

    r = alice_sess.get(f"{API}/calls/signals")
    assert r.status_code == 200
    sigs = [s for s in r.json()["signals"] if s.get("call_id") == call_id]
    assert len(sigs) == 1
    assert sigs[0]["type"] == "answer"
    assert sigs[0]["payload"] == answer
    assert sigs[0]["from_user"]["id"] == bob["id"]


def test_signal_candidate_retrievable():
    alice_sess, alice = _register("cndA")
    bob_sess, bob = _register("cndB")
    call_id = str(uuid.uuid4())
    candidate_payload = {
        "candidate": "candidate:1 1 UDP 2122252543 192.168.1.2 54321 typ host",
        "sdpMid": "0",
        "sdpMLineIndex": 0,
    }
    r = alice_sess.post(f"{API}/calls/signal", json={
        "to_user_id": bob["id"], "type": "candidate", "payload": candidate_payload, "call_id": call_id,
    })
    assert r.status_code == 200
    r = bob_sess.get(f"{API}/calls/signals")
    assert r.status_code == 200
    sigs = [s for s in r.json()["signals"] if s.get("call_id") == call_id]
    assert len(sigs) == 1
    assert sigs[0]["type"] == "candidate"
    assert sigs[0]["payload"] == candidate_payload


def test_signal_hangup_retrievable():
    alice_sess, alice = _register("hupA")
    bob_sess, bob = _register("hupB")
    call_id = str(uuid.uuid4())
    r = alice_sess.post(f"{API}/calls/signal", json={
        "to_user_id": bob["id"], "type": "hangup", "payload": {"reason": "user_ended"}, "call_id": call_id,
    })
    assert r.status_code == 200
    r = bob_sess.get(f"{API}/calls/signals")
    assert r.status_code == 200
    sigs = [s for s in r.json()["signals"] if s.get("call_id") == call_id]
    assert len(sigs) == 1
    assert sigs[0]["type"] == "hangup"
    assert sigs[0]["payload"] == {"reason": "user_ended"}


def test_signals_sorted_by_created_at():
    """Multiple signals A→B should come back in ascending created_at order."""
    alice_sess, alice = _register("sortA")
    bob_sess, bob = _register("sortB")
    call_id = str(uuid.uuid4())
    types_order = ["offer", "candidate", "candidate", "hangup"]
    for i, t in enumerate(types_order):
        r = alice_sess.post(f"{API}/calls/signal", json={
            "to_user_id": bob["id"],
            "type": t,
            "payload": {"idx": i},
            "call_id": call_id,
        })
        assert r.status_code == 200

    r = bob_sess.get(f"{API}/calls/signals")
    assert r.status_code == 200
    sigs = [s for s in r.json()["signals"] if s.get("call_id") == call_id]
    assert len(sigs) == 4
    # created_at ascending
    created = [s["created_at"] for s in sigs]
    assert created == sorted(created), f"signals not sorted ascending: {created}"
    # Payload idx order preserved
    idxs = [s["payload"]["idx"] for s in sigs]
    assert idxs == [0, 1, 2, 3]


def test_signal_to_nonexistent_user_returns_404():
    sess, _ = _register("nf")
    r = sess.post(f"{API}/calls/signal", json={
        "to_user_id": str(uuid.uuid4()),  # random, won't exist
        "type": "offer",
        "payload": {"sdp": "x"},
        "call_id": str(uuid.uuid4()),
    })
    assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"


def test_signals_scoped_per_recipient():
    """Signal from A→B must NOT be visible to C."""
    alice_sess, alice = _register("scpA")
    bob_sess, bob = _register("scpB")
    carol_sess, carol = _register("scpC")

    call_id = str(uuid.uuid4())
    r = alice_sess.post(f"{API}/calls/signal", json={
        "to_user_id": bob["id"], "type": "offer", "payload": {"sdp": "forbob"}, "call_id": call_id,
    })
    assert r.status_code == 200

    # Carol should not see it
    r = carol_sess.get(f"{API}/calls/signals")
    assert r.status_code == 200
    carol_sigs = [s for s in r.json()["signals"] if s.get("call_id") == call_id]
    assert carol_sigs == [], "Carol must not see signals intended for Bob"

    # Bob should still see it (Carol's GET must not consume it)
    r = bob_sess.get(f"{API}/calls/signals")
    assert r.status_code == 200
    bob_sigs = [s for s in r.json()["signals"] if s.get("call_id") == call_id]
    assert len(bob_sigs) == 1


def test_post_signal_unauthorized():
    r = requests.post(f"{API}/calls/signal", json={
        "to_user_id": str(uuid.uuid4()), "type": "offer", "payload": {}, "call_id": None,
    })
    assert r.status_code == 401, f"expected 401, got {r.status_code}"


def test_get_signals_unauthorized():
    r = requests.get(f"{API}/calls/signals")
    assert r.status_code == 401, f"expected 401, got {r.status_code}"

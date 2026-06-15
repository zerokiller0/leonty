"""Iter 7 — DM edit/delete/reactions + auth (E2EE removed)."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fall back to reading frontend/.env at runtime
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"


def _reg(suffix=""):
    s = requests.Session()
    u = f"TESTi7_{uuid.uuid4().hex[:8]}{suffix}"
    payload = {"email": f"{u}@test.com", "username": u, "password": "Passw0rd!2026", "display_name": u}
    r = s.post(f"{API}/auth/register", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    s.headers.update({"Authorization": f"Bearer {body['access_token']}"})
    return s, body["user"], u


# -------- auth basics --------
class TestAuthNoRSA:
    def test_register_no_rsa_fields(self):
        s, user, _ = _reg()
        assert "id" in user
        assert "password_hash" not in user
        # public user must not leak password
        assert user.get("email", "").endswith("@test.com")

    def test_login_admin_seeded(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "admin@cipher.io", "password": "Admin@Cipher2026"},
                          timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert body["user"]["email"] == "admin@cipher.io"

    def test_guest_register(self):
        rc = uuid.uuid4().hex
        r = requests.post(f"{API}/auth/guest", json={"recovery_code": rc, "display_name": "GuestX"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["is_guest"] is True
        assert "username" in body
        # guest login
        r2 = requests.post(f"{API}/auth/guest/login",
                           json={"username": body["username"], "recovery_code": rc}, timeout=20)
        assert r2.status_code == 200


# -------- DM new fields --------
class TestDMCore:
    def setup_method(self):
        self.a, self.alice, _ = _reg("a")
        self.b, self.bob, _ = _reg("b")

    def test_send_dm_returns_new_fields(self):
        r = self.a.post(f"{API}/dms",
                        json={"recipient_id": self.bob["id"], "content": "hello bob"},
                        timeout=20)
        assert r.status_code == 200, r.text
        m = r.json()["message"]
        assert m["content"] == "hello bob"
        assert m["reactions"] == []
        assert m["edited_at"] is None
        assert m["deleted_at"] is None
        assert "id" in m

    def test_get_dms_persists_fields(self):
        self.a.post(f"{API}/dms", json={"recipient_id": self.bob["id"], "content": "x"}, timeout=20)
        r = self.b.get(f"{API}/dms/{self.alice['id']}", timeout=20)
        assert r.status_code == 200
        msgs = r.json()["messages"]
        assert len(msgs) >= 1
        last = msgs[-1]
        assert "reactions" in last and "edited_at" in last and "deleted_at" in last


class TestDMEdit:
    def setup_method(self):
        self.a, self.alice, _ = _reg("a")
        self.b, self.bob, _ = _reg("b")
        r = self.a.post(f"{API}/dms",
                        json={"recipient_id": self.bob["id"], "content": "orig"},
                        timeout=20)
        self.mid = r.json()["message"]["id"]

    def test_edit_own_message_sets_edited_at(self):
        r = self.a.patch(f"{API}/dms/{self.mid}", json={"content": "edited!"}, timeout=20)
        assert r.status_code == 200, r.text
        m = r.json()["message"]
        assert m["content"] == "edited!"
        assert m["edited_at"] is not None
        # verify via GET
        g = self.a.get(f"{API}/dms/{self.bob['id']}", timeout=20)
        target = next(x for x in g.json()["messages"] if x["id"] == self.mid)
        assert target["content"] == "edited!"
        assert target["edited_at"] is not None

    def test_edit_non_owner_403(self):
        r = self.b.patch(f"{API}/dms/{self.mid}", json={"content": "hacked"}, timeout=20)
        assert r.status_code == 403

    def test_edit_deleted_message_400(self):
        self.a.delete(f"{API}/dms/{self.mid}", timeout=20)
        r = self.a.patch(f"{API}/dms/{self.mid}", json={"content": "reborn"}, timeout=20)
        assert r.status_code == 400

    def test_edit_attachment_message_400(self):
        # send a DM with attachment_id
        r = self.a.post(f"{API}/dms",
                        json={"recipient_id": self.bob["id"], "content": "see attached",
                              "attachment_id": "fake-att-id"},
                        timeout=20)
        att_mid = r.json()["message"]["id"]
        r2 = self.a.patch(f"{API}/dms/{att_mid}", json={"content": "edit attempt"}, timeout=20)
        assert r2.status_code == 400


class TestDMDelete:
    def setup_method(self):
        self.a, self.alice, _ = _reg("a")
        self.b, self.bob, _ = _reg("b")
        r = self.a.post(f"{API}/dms",
                        json={"recipient_id": self.bob["id"], "content": "to delete"},
                        timeout=20)
        self.mid = r.json()["message"]["id"]

    def test_delete_own_sets_deleted_at_and_clears_content(self):
        r = self.a.delete(f"{API}/dms/{self.mid}", timeout=20)
        assert r.status_code == 200
        g = self.a.get(f"{API}/dms/{self.bob['id']}", timeout=20)
        target = next(x for x in g.json()["messages"] if x["id"] == self.mid)
        assert target["deleted_at"] is not None
        assert target["content"] == ""

    def test_delete_non_owner_403(self):
        r = self.b.delete(f"{API}/dms/{self.mid}", timeout=20)
        assert r.status_code == 403

    def test_conversation_list_preview_deleted(self):
        self.a.delete(f"{API}/dms/{self.mid}", timeout=20)
        r = self.a.get(f"{API}/dms", timeout=20)
        convs = r.json()["conversations"]
        match = [c for c in convs if c["partner"]["id"] == self.bob["id"]]
        assert match, "conversation missing"
        assert match[0]["last_message_preview"] == "رسالة محذوفة"


class TestDMReactions:
    def setup_method(self):
        self.a, self.alice, _ = _reg("a")
        self.b, self.bob, _ = _reg("b")
        self.c, self.carol, _ = _reg("c")
        r = self.a.post(f"{API}/dms",
                        json={"recipient_id": self.bob["id"], "content": "react me"},
                        timeout=20)
        self.mid = r.json()["message"]["id"]

    def test_toggle_reaction_add_then_remove(self):
        r = self.b.post(f"{API}/dms/{self.mid}/reactions", json={"emoji": "❤️"}, timeout=20)
        assert r.status_code == 200, r.text
        reactions = r.json()["reactions"]
        assert any(x["emoji"] == "❤️" and x["user_id"] == self.bob["id"] for x in reactions)
        # toggle off
        r2 = self.b.post(f"{API}/dms/{self.mid}/reactions", json={"emoji": "❤️"}, timeout=20)
        assert r2.status_code == 200
        reactions = r2.json()["reactions"]
        assert not any(x["emoji"] == "❤️" and x["user_id"] == self.bob["id"] for x in reactions)

    def test_reaction_non_participant_403(self):
        r = self.c.post(f"{API}/dms/{self.mid}/reactions", json={"emoji": "🔥"}, timeout=20)
        assert r.status_code == 403

    def test_reaction_on_deleted_400(self):
        self.a.delete(f"{API}/dms/{self.mid}", timeout=20)
        r = self.a.post(f"{API}/dms/{self.mid}/reactions", json={"emoji": "🔥"}, timeout=20)
        assert r.status_code == 400

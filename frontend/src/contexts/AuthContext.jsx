import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import {
  generateKeyPair,
  encryptPrivateKey,
  decryptPrivateKey,
} from "../lib/crypto";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function genRecoveryCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) out += "-";
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [privateKeyB64, setPrivateKeyB64] = useState(null);

  const bootstrap = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      const cached = localStorage.getItem("priv_key");
      if (cached) setPrivateKeyB64(cached);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const register = async ({ email, password, username, display_name }) => {
    const { publicKeyB64, privateKeyB64: pk } = await generateKeyPair();
    const { encryptedPrivateKeyB64, saltB64 } = await encryptPrivateKey(pk, password);
    const { data } = await api.post("/auth/register", {
      email, password, username, display_name,
      public_key: publicKeyB64,
      encrypted_private_key: encryptedPrivateKeyB64,
      key_salt: saltB64,
    });
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("priv_key", pk);
    setPrivateKeyB64(pk);
    setUser(data.user);
    return data.user;
  };

  const registerGuest = async ({ display_name } = {}) => {
    const recovery_code = genRecoveryCode();
    const { publicKeyB64, privateKeyB64: pk } = await generateKeyPair();
    const { encryptedPrivateKeyB64, saltB64 } = await encryptPrivateKey(pk, recovery_code);
    const { data } = await api.post("/auth/guest", {
      public_key: publicKeyB64,
      encrypted_private_key: encryptedPrivateKeyB64,
      key_salt: saltB64,
      recovery_code,
      display_name,
    });
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("priv_key", pk);
    setPrivateKeyB64(pk);
    setUser(data.user);
    return { user: data.user, username: data.username, recovery_code };
  };

  const loginGuest = async ({ username, recovery_code }) => {
    const { data } = await api.post("/auth/guest/login", { username, recovery_code });
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    if (data.encrypted_private_key && data.encrypted_private_key !== "PENDING") {
      try {
        const pk = await decryptPrivateKey(data.encrypted_private_key, recovery_code, data.key_salt);
        localStorage.setItem("priv_key", pk);
        setPrivateKeyB64(pk);
      } catch (e) { console.error("guest decrypt failed", e); }
    }
    setUser(data.user);
    return data.user;
  };

  const upgradeAccount = async ({ email, password, currentRecoveryCode }) => {
    // Decrypt current private key with recovery_code, re-encrypt with new password
    const { data: meData } = await api.get("/auth/me");
    if (!meData.encrypted_private_key || meData.encrypted_private_key === "PENDING") {
      throw new Error("لا يمكن ترقية هذا الحساب");
    }
    const pk = await decryptPrivateKey(meData.encrypted_private_key, currentRecoveryCode, meData.key_salt);
    const { encryptedPrivateKeyB64, saltB64 } = await encryptPrivateKey(pk, password);
    const { data } = await api.post("/auth/upgrade", {
      email, password,
      encrypted_private_key: encryptedPrivateKeyB64,
      key_salt: saltB64,
    });
    setUser(data.user);
    localStorage.setItem("priv_key", pk);
    setPrivateKeyB64(pk);
    return data.user;
  };

  const login = async ({ email, password, totp_code }) => {
    const { data } = await api.post("/auth/login", { email, password, totp_code });
    if (data.two_factor_required) return { two_factor_required: true };
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    if (data.encrypted_private_key && data.encrypted_private_key !== "PENDING") {
      try {
        const pk = await decryptPrivateKey(data.encrypted_private_key, password, data.key_salt);
        localStorage.setItem("priv_key", pk);
        setPrivateKeyB64(pk);
      } catch (e) { console.error("decrypt failed", e); }
    }
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("access_token");
    localStorage.removeItem("priv_key");
    setUser(false);
    setPrivateKeyB64(null);
  };

  const refreshUser = async () => {
    const { data } = await api.get("/auth/me");
    setUser(data.user);
  };

  return (
    <AuthCtx.Provider value={{
      user, setUser, privateKeyB64,
      register, registerGuest, loginGuest, upgradeAccount, login, logout, refreshUser
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

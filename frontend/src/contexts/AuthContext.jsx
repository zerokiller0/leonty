import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import {
  generateKeyPair,
  encryptPrivateKey,
  decryptPrivateKey,
} from "../lib/crypto";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = logged out
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

  const login = async ({ email, password, totp_code }) => {
    const { data } = await api.post("/auth/login", { email, password, totp_code });
    if (data.two_factor_required) return { two_factor_required: true };
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    // decrypt private key
    if (data.encrypted_private_key && data.encrypted_private_key !== "PENDING") {
      try {
        const pk = await decryptPrivateKey(data.encrypted_private_key, password, data.key_salt);
        localStorage.setItem("priv_key", pk);
        setPrivateKeyB64(pk);
      } catch (e) {
        console.error("Failed to decrypt private key", e);
      }
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
    <AuthCtx.Provider value={{ user, setUser, privateKeyB64, register, login, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

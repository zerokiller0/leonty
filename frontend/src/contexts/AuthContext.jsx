import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../lib/api";

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

  const bootstrap = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const register = async ({ email, password, username, display_name }) => {
    const { data } = await api.post("/auth/register", {
      email, password, username, display_name,
    });
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    setUser(data.user);
    return data.user;
  };

  const registerGuest = async ({ display_name } = {}) => {
    const recovery_code = genRecoveryCode();
    const { data } = await api.post("/auth/guest", {
      recovery_code,
      display_name,
    });
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    setUser(data.user);
    return { user: data.user, username: data.username, recovery_code };
  };

  const loginGuest = async ({ username, recovery_code }) => {
    const { data } = await api.post("/auth/guest/login", { username, recovery_code });
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    setUser(data.user);
    return data.user;
  };

  const upgradeAccount = async ({ email, password }) => {
    const { data } = await api.post("/auth/upgrade", { email, password });
    setUser(data.user);
    return data.user;
  };

  const login = async ({ email, password, totp_code }) => {
    const { data } = await api.post("/auth/login", { email, password, totp_code });
    if (data.two_factor_required) return { two_factor_required: true };
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("access_token");
    setUser(false);
  };

  const refreshUser = async () => {
    const { data } = await api.get("/auth/me");
    setUser(data.user);
  };

  return (
    <AuthCtx.Provider value={{
      user, setUser,
      register, registerGuest, loginGuest, upgradeAccount, login, logout, refreshUser
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

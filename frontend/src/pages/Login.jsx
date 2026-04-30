import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/api";
import { Shield, Lock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await login({ email, password, totp_code: totpCode || undefined });
      if (res?.two_factor_required) {
        setNeeds2fa(true);
        toast.info("Enter your 2FA code");
      } else {
        toast.success("Welcome back");
        nav("/app");
      }
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 grid-lines opacity-30 pointer-events-none" />
      <Link to="/" data-testid="back-home" className="absolute top-6 left-6 text-xs text-gray-500 hover:text-white flex items-center gap-2">
        <ArrowLeft size={14} /> BACK
      </Link>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-9 h-9 border border-[#00FF66] flex items-center justify-center">
              <Shield size={16} className="text-[#00FF66]" />
            </div>
            <span className="font-display text-2xl tracking-tight">CIPHER</span>
          </div>
          <h1 className="font-display text-3xl tracking-tight">Sign in</h1>
          <p className="text-sm text-gray-500 mt-2 font-mono-key tracking-widest">SECURE · END-TO-END</p>
        </div>

        <form onSubmit={submit} className="space-y-5 border border-white/10 bg-[#141414] p-8">
          {!needs2fa && (
            <>
              <div>
                <label className="block text-xs font-mono-key tracking-widest text-gray-500 mb-2">EMAIL</label>
                <input
                  data-testid="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-mono-key tracking-widest text-gray-500 mb-2">PASSWORD</label>
                <input
                  data-testid="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66] transition-colors"
                />
              </div>
            </>
          )}
          {needs2fa && (
            <div>
              <label className="block text-xs font-mono-key tracking-widest text-gray-500 mb-2">2FA CODE</label>
              <input
                data-testid="login-totp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full bg-transparent border border-white/20 px-4 py-3 text-lg font-mono-key tracking-[0.5em] text-center focus:outline-none focus:border-[#00FF66]"
                placeholder="000000"
              />
            </div>
          )}

          {err && <div className="text-xs text-[#FF3333] font-mono-key" data-testid="login-error">{err}</div>}

          <button
            data-testid="login-submit"
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black py-3 text-sm font-medium hover:bg-[#00FF66] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Lock size={14} />
            {loading ? "SIGNING IN..." : needs2fa ? "VERIFY & SIGN IN" : "SIGN IN"}
          </button>

          <div className="text-center pt-2">
            <Link to="/register" data-testid="goto-register" className="text-xs text-gray-500 hover:text-white font-mono-key tracking-widest">
              NEW TO CIPHER? CREATE ACCOUNT →
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

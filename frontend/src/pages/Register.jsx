import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/api";
import { Shield, ArrowLeft, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", username: "", display_name: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (form.password !== form.confirm) { setErr("Passwords don't match"); return; }
    if (form.password.length < 8) { setErr("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        username: form.username,
        display_name: form.display_name || form.username,
      });
      toast.success("Keys generated — welcome to Cipher");
      nav("/app");
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

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
          <h1 className="font-display text-3xl tracking-tight">Create account</h1>
          <p className="text-sm text-gray-500 mt-2 font-mono-key tracking-widest">KEYS GENERATED ON THIS DEVICE</p>
        </div>

        <form onSubmit={submit} className="space-y-4 border border-white/10 bg-[#141414] p-8">
          <div>
            <label className="block text-xs font-mono-key tracking-widest text-gray-500 mb-2">EMAIL</label>
            <input data-testid="reg-email" type="email" required value={form.email} onChange={update("email")}
              className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono-key tracking-widest text-gray-500 mb-2">USERNAME</label>
              <input data-testid="reg-username" type="text" required minLength={3} value={form.username} onChange={update("username")}
                className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
            </div>
            <div>
              <label className="block text-xs font-mono-key tracking-widest text-gray-500 mb-2">DISPLAY</label>
              <input data-testid="reg-display" type="text" value={form.display_name} onChange={update("display_name")}
                className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono-key tracking-widest text-gray-500 mb-2">PASSWORD</label>
            <input data-testid="reg-password" type="password" required minLength={8} value={form.password} onChange={update("password")}
              className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
          </div>
          <div>
            <label className="block text-xs font-mono-key tracking-widest text-gray-500 mb-2">CONFIRM PASSWORD</label>
            <input data-testid="reg-confirm" type="password" required value={form.confirm} onChange={update("confirm")}
              className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
          </div>

          <div className="border border-[#00FF66]/30 bg-[#00FF66]/5 p-3 flex gap-3 items-start">
            <KeyRound size={14} className="text-[#00FF66] mt-0.5 shrink-0" />
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Your password encrypts your private key. <span className="text-[#00FF66]">Lose it and your messages are unrecoverable.</span>
            </p>
          </div>

          {err && <div className="text-xs text-[#FF3333] font-mono-key" data-testid="reg-error">{err}</div>}

          <button
            data-testid="reg-submit"
            type="submit"
            disabled={loading}
            className="w-full bg-[#00FF66] text-black py-3 text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
          >
            {loading ? "GENERATING KEYS..." : "CREATE ENCRYPTED ACCOUNT"}
          </button>

          <div className="text-center pt-2">
            <Link to="/login" data-testid="goto-login" className="text-xs text-gray-500 hover:text-white font-mono-key tracking-widest">
              ALREADY HAVE AN ACCOUNT? SIGN IN →
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

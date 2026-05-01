import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/api";
import { Heart, Lock, ArrowRight, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login, loginGuest } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("regular");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [guestUsername, setGuestUsername] = useState("");
  const [guestCode, setGuestCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submitRegular = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const res = await login({ email, password, totp_code: totpCode || undefined });
      if (res?.two_factor_required) { setNeeds2fa(true); toast.info("أدخل رمز المصادقة"); }
      else { toast.success("مرحباً بعودتك"); nav("/app"); }
    } catch (e) { setErr(formatApiError(e)); } finally { setLoading(false); }
  };

  const submitGuest = async (e) => {
    e.preventDefault(); setErr(""); setLoading(true);
    try {
      await loginGuest({ username: guestUsername.trim(), recovery_code: guestCode.trim() });
      toast.success("تم الدخول"); nav("/app");
    } catch (e) { setErr(formatApiError(e)); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[10%] right-[15%] w-96 h-96 rounded-full bg-[var(--accent)]/10 blur-3xl float-blob pointer-events-none" />
      <div className="absolute bottom-[15%] left-[10%] w-80 h-80 rounded-full bg-[var(--secondary)]/10 blur-3xl float-blob pointer-events-none" style={{animationDelay: "3s"}} />

      <Link to="/" data-testid="back-home" className="absolute top-6 right-6 text-xs text-[var(--muted)] hover:text-white flex items-center gap-2">
        <ArrowRight size={14} /> الرئيسية
      </Link>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-11 h-11 rounded-2xl gradient-rose flex items-center justify-center shadow-lg shadow-[var(--accent)]/20">
              <Heart size={18} className="text-white" fill="white" />
            </div>
            <span className="font-display-en text-2xl">Cipher</span>
          </Link>
          <h1 className="font-display text-3xl">أهلاً بعودتك</h1>
          <p className="text-sm text-[var(--muted)] mt-2">سجّل دخول لمساحتك المشفّرة</p>
        </div>

        <div className="glass-card p-2 mb-4 flex">
          <button onClick={() => setTab("regular")} data-testid="tab-regular"
            className={`flex-1 px-3 py-2.5 text-xs rounded-xl transition-colors ${tab === "regular" ? "gradient-rose text-white" : "text-[var(--muted)] hover:text-white"}`}>
            حساب عادي
          </button>
          <button onClick={() => setTab("guest")} data-testid="tab-guest"
            className={`flex-1 px-3 py-2.5 text-xs rounded-xl transition-colors ${tab === "guest" ? "gradient-rose text-white" : "text-[var(--muted)] hover:text-white"}`}>
            دخول كضيف
          </button>
        </div>

        {tab === "regular" ? (
          <form onSubmit={submitRegular} className="glass-card p-8 space-y-5">
            {!needs2fa && (
              <>
                <div>
                  <label className="block label-soft mb-2">البريد الإلكتروني</label>
                  <input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    dir="ltr" className="w-full input-soft px-4 py-3 text-sm" />
                </div>
                <div>
                  <label className="block label-soft mb-2">كلمة المرور</label>
                  <input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                    dir="ltr" className="w-full input-soft px-4 py-3 text-sm" />
                </div>
              </>
            )}
            {needs2fa && (
              <div>
                <label className="block label-soft mb-2">رمز المصادقة الثنائية</label>
                <input data-testid="login-totp" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} required
                  value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="000000"
                  dir="ltr" className="w-full input-soft px-4 py-3 text-lg font-mono-key tracking-[0.5em] text-center" />
              </div>
            )}
            {err && <div className="text-xs text-[var(--error)]" data-testid="login-error">{err}</div>}
            <button data-testid="login-submit" type="submit" disabled={loading}
              className="btn-rose w-full py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              <Lock size={14} />
              {loading ? "جاري الدخول..." : needs2fa ? "تحقّق وادخل" : "دخول"}
            </button>
            <div className="text-center pt-2">
              <Link to="/register" data-testid="goto-register" className="text-xs text-[var(--muted)] hover:text-[var(--accent)]">
                جديد على Cipher؟ أنشئ حساباً ←
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={submitGuest} className="glass-card p-8 space-y-5">
            <div>
              <label className="block label-soft mb-2">اسم المستخدم</label>
              <input data-testid="guest-username" type="text" required placeholder="guest_xxxxxx"
                value={guestUsername} onChange={(e) => setGuestUsername(e.target.value)}
                dir="ltr" className="w-full input-soft px-4 py-3 text-sm font-mono-key" />
            </div>
            <div>
              <label className="block label-soft mb-2">كود الاسترجاع</label>
              <input data-testid="guest-recovery-code" type="text" required placeholder="XXXX-XXXX-XXXX-XXXX"
                value={guestCode} onChange={(e) => setGuestCode(e.target.value.toUpperCase())}
                dir="ltr" className="w-full input-soft px-4 py-3 text-sm font-mono-key tracking-widest" />
            </div>
            {err && <div className="text-xs text-[var(--error)]" data-testid="guest-login-error">{err}</div>}
            <button data-testid="guest-login-submit" type="submit" disabled={loading}
              className="btn-rose w-full py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              <KeyRound size={14} />
              {loading ? "جاري الدخول..." : "دخول كضيف"}
            </button>
            <p className="text-[11px] text-[var(--muted)] leading-relaxed text-center">
              ضيف لأول مرة؟ <Link to="/register" className="text-[var(--accent)] hover:underline">من هنا</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

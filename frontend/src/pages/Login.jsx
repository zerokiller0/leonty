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
            <span className="font-display-en text-2xl">Leonty</span>
          </Link>
          <h1 className="font-display text-3xl">أهلاً بعودتك</h1>
          <p className="text-sm text-[var(--muted)] mt-2">سجّل دخول لتبدأ التواصل</p>
        </div>

        {/* Google Sign-in */}
        <button
          type="button"
          data-testid="google-signin-btn"
          onClick={() => {
            // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
            const redirectUrl = window.location.origin + "/app";
            window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
          }}
          className="w-full mb-4 py-3.5 rounded-2xl bg-white text-[#1f1f1f] hover:bg-white/90 transition-colors text-sm flex items-center justify-center gap-3 font-medium shadow-sm"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          المتابعة عبر Google
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="text-[10px] label-soft tracking-widest">أو</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
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
                جديد على Leonty؟ أنشئ حساباً ←
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

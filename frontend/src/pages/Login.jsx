import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/api";
import { Shield, Lock, ArrowRight, UserPlus, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login, loginGuest } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("regular"); // regular | guest
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
    setErr("");
    setLoading(true);
    try {
      const res = await login({ email, password, totp_code: totpCode || undefined });
      if (res?.two_factor_required) {
        setNeeds2fa(true);
        toast.info("أدخل رمز المصادقة الثنائية");
      } else {
        toast.success("مرحباً بعودتك");
        nav("/app");
      }
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  const submitGuest = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await loginGuest({ username: guestUsername.trim(), recovery_code: guestCode.trim() });
      toast.success("تم الدخول كضيف");
      nav("/app");
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 grid-lines opacity-30 pointer-events-none" />
      <Link to="/" data-testid="back-home" className="absolute top-6 right-6 text-xs text-gray-500 hover:text-white flex items-center gap-2">
        <ArrowRight size={14} /> الرئيسية
      </Link>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-9 h-9 border border-[#00FF66] flex items-center justify-center">
              <Shield size={16} className="text-[#00FF66]" />
            </div>
            <span className="font-display-en text-2xl">CIPHER</span>
          </div>
          <h1 className="font-display text-3xl">تسجيل الدخول</h1>
          <p className="text-sm text-gray-500 mt-2 font-mono-key tracking-widest">SECURE · END-TO-END</p>
        </div>

        <div className="border border-white/10 bg-[#141414] p-2 mb-4 flex">
          <button onClick={() => setTab("regular")} data-testid="tab-regular"
            className={`flex-1 px-3 py-2 text-xs transition-colors ${tab === "regular" ? "bg-white/10 text-[#00FF66]" : "text-gray-500 hover:text-white"}`}>
            حساب عادي
          </button>
          <button onClick={() => setTab("guest")} data-testid="tab-guest"
            className={`flex-1 px-3 py-2 text-xs transition-colors ${tab === "guest" ? "bg-white/10 text-[#00FF66]" : "text-gray-500 hover:text-white"}`}>
            دخول كضيف
          </button>
        </div>

        {tab === "regular" ? (
          <form onSubmit={submitRegular} className="space-y-5 border border-white/10 bg-[#141414] p-8">
            {!needs2fa && (
              <>
                <div>
                  <label className="block label-ar mb-2">البريد الإلكتروني</label>
                  <input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    dir="ltr" className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
                </div>
                <div>
                  <label className="block label-ar mb-2">كلمة المرور</label>
                  <input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                    dir="ltr" className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
                </div>
              </>
            )}
            {needs2fa && (
              <div>
                <label className="block label-ar mb-2">رمز المصادقة الثنائية</label>
                <input data-testid="login-totp" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} required
                  value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="000000"
                  dir="ltr" className="w-full bg-transparent border border-white/20 px-4 py-3 text-lg font-mono-key tracking-[0.5em] text-center focus:outline-none focus:border-[#00FF66]" />
              </div>
            )}
            {err && <div className="text-xs text-[#FF3333]" data-testid="login-error">{err}</div>}
            <button data-testid="login-submit" type="submit" disabled={loading}
              className="w-full bg-white text-black py-3 text-sm font-medium hover:bg-[#00FF66] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <Lock size={14} />
              {loading ? "جاري الدخول..." : needs2fa ? "تحقّق وادخل" : "دخول"}
            </button>
            <div className="text-center pt-2">
              <Link to="/register" data-testid="goto-register" className="text-xs text-gray-500 hover:text-white">
                جديد على Cipher؟ أنشئ حساباً ←
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={submitGuest} className="space-y-5 border border-white/10 bg-[#141414] p-8">
            <div>
              <label className="block label-ar mb-2">اسم المستخدم</label>
              <input data-testid="guest-username" type="text" required placeholder="guest_xxxxxx"
                value={guestUsername} onChange={(e) => setGuestUsername(e.target.value)}
                dir="ltr" className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm font-mono-key focus:outline-none focus:border-[#00FF66]" />
            </div>
            <div>
              <label className="block label-ar mb-2">كود الاسترجاع</label>
              <input data-testid="guest-recovery-code" type="text" required placeholder="XXXX-XXXX-XXXX-XXXX"
                value={guestCode} onChange={(e) => setGuestCode(e.target.value.toUpperCase())}
                dir="ltr" className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm font-mono-key tracking-widest focus:outline-none focus:border-[#00FF66]" />
            </div>
            {err && <div className="text-xs text-[#FF3333]" data-testid="guest-login-error">{err}</div>}
            <button data-testid="guest-login-submit" type="submit" disabled={loading}
              className="w-full bg-[#00FF66] text-black py-3 text-sm font-medium hover:bg-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <KeyRound size={14} />
              {loading ? "جاري الدخول..." : "دخول لحساب الضيف"}
            </button>
            <p className="text-[11px] text-gray-500 leading-relaxed text-center">
              أو ادخل لأول مرة كضيف من <Link to="/register" className="text-[#00FF66] hover:underline">صفحة التسجيل</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

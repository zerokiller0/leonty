import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/api";
import { Heart, ArrowRight, KeyRound, Copy, Check, UserCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
  const { register, registerGuest } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", username: "", display_name: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [guestInfo, setGuestInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (form.password !== form.confirm) { setErr("كلمتا المرور غير متطابقتين"); return; }
    if (form.password.length < 8) { setErr("كلمة المرور يجب ألا تقل عن ٨ أحرف"); return; }
    setLoading(true);
    try {
      await register({
        email: form.email, password: form.password,
        username: form.username, display_name: form.display_name || form.username,
      });
      toast.success("تم إنشاء الحساب — أهلاً");
      nav("/app");
    } catch (e) { setErr(formatApiError(e)); } finally { setLoading(false); }
  };

  const guestSubmit = async () => {
    setErr(""); setLoading(true);
    try {
      const info = await registerGuest({ display_name: form.display_name || undefined });
      setGuestInfo(info);
      toast.success("تم إنشاء حساب ضيف");
    } catch (e) { setErr(formatApiError(e)); } finally { setLoading(false); }
  };

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (guestInfo) {
    const copyAll = () => {
      navigator.clipboard.writeText(`Username: ${guestInfo.username}\nRecovery Code: ${guestInfo.recovery_code}`);
      setCopied(true); toast.success("تم النسخ");
      setTimeout(() => setCopied(false), 2000);
    };
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-lg glass-card p-8 space-y-6 border-[var(--accent)]/30">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl gradient-rose flex items-center justify-center">
              <KeyRound size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl">احفظ بيانات الاسترجاع</h1>
              <p className="text-xs text-[var(--muted)]">هذه فرصتك الوحيدة لحفظها</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--error)]/30 bg-[var(--error)]/5 p-4 text-xs text-[var(--text)] leading-relaxed">
            ⚠️ <strong className="text-[var(--error)]">تحذير:</strong> لا يمكن استرجاع حساب الضيف بدون هذه البيانات.
            احفظها في مدير كلمات مرور أو مكان آمن.
          </div>

          <div className="space-y-3">
            <div>
              <div className="label-soft mb-2">اسم المستخدم</div>
              <code data-testid="guest-username-display" className="block font-mono-key text-base bg-[var(--surface)] rounded-xl p-3 select-all">{guestInfo.username}</code>
            </div>
            <div>
              <div className="label-soft mb-2">كود الاسترجاع</div>
              <code data-testid="guest-code-display" className="block font-mono-key text-lg text-[var(--accent)] bg-[var(--surface)] rounded-xl p-3 tracking-widest select-all">{guestInfo.recovery_code}</code>
            </div>
          </div>

          <div className="flex gap-3">
            <button data-testid="copy-guest-creds" onClick={copyAll} className="btn-soft flex-1 py-3 text-sm flex items-center justify-center gap-2">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "تم" : "نسخ"}
            </button>
            <button data-testid="guest-continue" onClick={() => nav("/app")} className="btn-rose flex-1 py-3 text-sm">
              متابعة
            </button>
          </div>

          <p className="text-[11px] text-[var(--muted)] text-center leading-relaxed">
            يمكنك ترقية الحساب لاحقاً من الإعدادات.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[10%] right-[15%] w-96 h-96 rounded-full bg-[var(--accent)]/10 blur-3xl float-blob pointer-events-none" />
      <Link to="/" data-testid="back-home" className="absolute top-6 right-6 text-xs text-[var(--muted)] hover:text-white flex items-center gap-2">
        <ArrowRight size={14} /> الرئيسية
      </Link>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-11 h-11 rounded-2xl gradient-rose flex items-center justify-center">
              <Heart size={18} className="text-white" fill="white" />
            </div>
            <span className="font-display-en text-2xl">Leonty</span>
          </Link>
          <h1 className="font-display text-3xl">أنشئ حسابك</h1>
          <p className="text-sm text-[var(--muted)] mt-2">انضم إلى Leonty وابدأ التواصل</p>
        </div>

        <form onSubmit={submit} className="glass-card p-8 space-y-4">
          <div>
            <label className="block label-soft mb-2">البريد الإلكتروني</label>
            <input data-testid="reg-email" type="email" required value={form.email} onChange={update("email")}
              dir="ltr" className="w-full input-soft px-4 py-3 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block label-soft mb-2">اسم المستخدم</label>
              <input data-testid="reg-username" type="text" required minLength={3} value={form.username} onChange={update("username")}
                dir="ltr" className="w-full input-soft px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="block label-soft mb-2">الاسم الظاهر</label>
              <input data-testid="reg-display" type="text" value={form.display_name} onChange={update("display_name")}
                className="w-full input-soft px-4 py-3 text-sm" />
            </div>
          </div>
          <div>
            <label className="block label-soft mb-2">كلمة المرور</label>
            <input data-testid="reg-password" type="password" required minLength={8} value={form.password} onChange={update("password")}
              dir="ltr" className="w-full input-soft px-4 py-3 text-sm" />
          </div>
          <div>
            <label className="block label-soft mb-2">تأكيد كلمة المرور</label>
            <input data-testid="reg-confirm" type="password" required value={form.confirm} onChange={update("confirm")}
              dir="ltr" className="w-full input-soft px-4 py-3 text-sm" />
          </div>

          <div className="rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3 flex gap-3 items-start">
            <KeyRound size={14} className="text-[var(--accent)] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[var(--muted)] leading-relaxed">
              اختر كلمة مرور قوية. <span className="text-[var(--accent)]">احفظها في مكان آمن.</span>
            </p>
          </div>

          {err && <div className="text-xs text-[var(--error)]" data-testid="reg-error">{err}</div>}

          <button data-testid="reg-submit" type="submit" disabled={loading}
            className="btn-rose w-full py-3.5 text-sm disabled:opacity-50">
            {loading ? "جاري الإنشاء..." : "إنشاء الحساب"}
          </button>

          <div className="relative my-2 flex items-center">
            <div className="flex-1 border-t border-[var(--border)]"></div>
            <span className="px-3 text-[10px] text-[var(--muted-soft)]">أو</span>
            <div className="flex-1 border-t border-[var(--border)]"></div>
          </div>

          <button type="button" data-testid="guest-register-btn" onClick={guestSubmit} disabled={loading}
            className="btn-soft w-full py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            <UserCircle2 size={14} />
            دخول كضيف (بدون بريد)
          </button>

          <div className="text-center pt-2">
            <Link to="/login" data-testid="goto-login" className="text-xs text-[var(--muted)] hover:text-[var(--accent)]">
              لديك حساب بالفعل؟ سجّل الدخول ←
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

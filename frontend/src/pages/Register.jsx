import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/api";
import { Shield, ArrowRight, KeyRound, Copy, Check, UserCircle2 } from "lucide-react";
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
      toast.success("تم توليد المفاتيح — أهلاً في Cipher");
      nav("/app");
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  const guestSubmit = async () => {
    setErr("");
    setLoading(true);
    try {
      const info = await registerGuest({ display_name: form.display_name || undefined });
      setGuestInfo(info);
      toast.success("تم إنشاء حساب ضيف");
    } catch (e) { setErr(formatApiError(e)); }
    finally { setLoading(false); }
  };

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (guestInfo) {
    const copyAll = () => {
      navigator.clipboard.writeText(`Username: ${guestInfo.username}\nRecovery Code: ${guestInfo.recovery_code}`);
      setCopied(true);
      toast.success("تم النسخ");
      setTimeout(() => setCopied(false), 2000);
    };
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-lg border border-[#00FF66]/30 bg-[#141414] p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border border-[#00FF66] flex items-center justify-center">
              <KeyRound size={18} className="text-[#00FF66]" />
            </div>
            <div>
              <h1 className="font-display text-2xl">احفظ بيانات الاسترجاع</h1>
              <p className="text-xs text-gray-500">هذه فرصتك الوحيدة لحفظها</p>
            </div>
          </div>

          <div className="border border-[#FF3333]/30 bg-[#FF3333]/5 p-4 text-xs text-gray-300 leading-relaxed">
            ⚠️ <strong className="text-[#FF3333]">تحذير:</strong> لا يمكن استرجاع حساب الضيف بدون هذه البيانات.
            احفظها في مدير كلمات مرور أو مكان آمن.
          </div>

          <div className="space-y-3">
            <div>
              <div className="label-ar mb-2">اسم المستخدم</div>
              <code data-testid="guest-username-display" className="block font-mono-key text-base bg-black/40 p-3 select-all">{guestInfo.username}</code>
            </div>
            <div>
              <div className="label-ar mb-2">كود الاسترجاع</div>
              <code data-testid="guest-code-display" className="block font-mono-key text-lg text-[#00FF66] bg-black/40 p-3 tracking-widest select-all">{guestInfo.recovery_code}</code>
            </div>
          </div>

          <div className="flex gap-3">
            <button data-testid="copy-guest-creds" onClick={copyAll}
              className="flex-1 border border-white/20 py-3 text-sm hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "تم النسخ" : "نسخ البيانات"}
            </button>
            <button data-testid="guest-continue" onClick={() => nav("/app")}
              className="flex-1 bg-[#00FF66] text-black py-3 text-sm font-medium hover:bg-white transition-colors">
              متابعة للتطبيق
            </button>
          </div>

          <p className="text-[11px] text-gray-500 text-center leading-relaxed">
            يمكنك ترقية حساب الضيف لاحقاً لحساب دائم من الإعدادات.
          </p>
        </div>
      </div>
    );
  }

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
          <h1 className="font-display text-3xl">إنشاء حساب</h1>
          <p className="text-sm text-gray-500 mt-2 font-mono-key tracking-widest">KEYS GENERATED ON THIS DEVICE</p>
        </div>

        <form onSubmit={submit} className="space-y-4 border border-white/10 bg-[#141414] p-8">
          <div>
            <label className="block label-ar mb-2">البريد الإلكتروني</label>
            <input data-testid="reg-email" type="email" required value={form.email} onChange={update("email")}
              dir="ltr" className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block label-ar mb-2">اسم المستخدم</label>
              <input data-testid="reg-username" type="text" required minLength={3} value={form.username} onChange={update("username")}
                dir="ltr" className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
            </div>
            <div>
              <label className="block label-ar mb-2">الاسم الظاهر</label>
              <input data-testid="reg-display" type="text" value={form.display_name} onChange={update("display_name")}
                className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
            </div>
          </div>
          <div>
            <label className="block label-ar mb-2">كلمة المرور</label>
            <input data-testid="reg-password" type="password" required minLength={8} value={form.password} onChange={update("password")}
              dir="ltr" className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
          </div>
          <div>
            <label className="block label-ar mb-2">تأكيد كلمة المرور</label>
            <input data-testid="reg-confirm" type="password" required value={form.confirm} onChange={update("confirm")}
              dir="ltr" className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
          </div>

          <div className="border border-[#00FF66]/30 bg-[#00FF66]/5 p-3 flex gap-3 items-start">
            <KeyRound size={14} className="text-[#00FF66] mt-0.5 shrink-0" />
            <p className="text-[11px] text-gray-400 leading-relaxed">
              كلمة مرورك تشفّر مفتاحك الخاص. <span className="text-[#00FF66]">لو نسيتها فلن تستطيع استرجاع رسائلك.</span>
            </p>
          </div>

          {err && <div className="text-xs text-[#FF3333]" data-testid="reg-error">{err}</div>}

          <button data-testid="reg-submit" type="submit" disabled={loading}
            className="w-full bg-[#00FF66] text-black py-3 text-sm font-medium hover:bg-white transition-colors disabled:opacity-50">
            {loading ? "جاري توليد المفاتيح..." : "إنشاء حساب مشفّر"}
          </button>

          <div className="relative my-2 flex items-center">
            <div className="flex-1 border-t border-white/10"></div>
            <span className="px-3 text-[10px] text-gray-600">أو</span>
            <div className="flex-1 border-t border-white/10"></div>
          </div>

          <button type="button" data-testid="guest-register-btn" onClick={guestSubmit} disabled={loading}
            className="w-full border border-white/20 text-white py-3 text-sm hover:border-[#00FF66] hover:text-[#00FF66] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <UserCircle2 size={14} />
            دخول كضيف (بدون بريد)
          </button>

          <div className="text-center pt-2">
            <Link to="/login" data-testid="goto-login" className="text-xs text-gray-500 hover:text-white">
              لديك حساب بالفعل؟ سجّل الدخول ←
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

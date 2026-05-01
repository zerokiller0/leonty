import { Link } from "react-router-dom";
import { Shield, Lock, Users, KeyRound, Fingerprint, Eye, ArrowLeft } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden">
      <div className="absolute inset-0 grid-lines opacity-40 pointer-events-none" />

      <nav className="relative z-10 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
            <div className="w-7 h-7 border border-[#00FF66] flex items-center justify-center">
              <Shield size={14} className="text-[#00FF66]" />
            </div>
            <span className="font-display-en text-lg">CIPHER</span>
            <span className="font-mono-key text-[10px] text-[#00FF66] tracking-widest">//E2EE</span>
          </Link>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">المميزات</a>
            <a href="#security" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">الأمان</a>
            <Link to="/login" data-testid="nav-login-btn" className="text-sm text-gray-300 hover:text-white">تسجيل الدخول</Link>
            <Link to="/register" data-testid="nav-signup-btn" className="text-sm bg-white text-black px-4 py-2 hover:bg-[#00FF66] transition-colors font-medium">
              ابدأ الآن
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 border border-white/10 px-3 py-1.5 mb-8">
              <span className="w-1.5 h-1.5 bg-[#00FF66] rounded-full pulse-dot" />
              <span className="font-mono-key text-[10px] tracking-[0.3em] text-gray-400">ZERO-KNOWLEDGE · END-TO-END</span>
            </div>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.05]">
              مُراسِل آمن<br />
              <span className="text-[#00FF66]">السيرفرات لا تستطيع قراءته.</span>
            </h1>
            <p className="mt-8 text-gray-400 text-lg max-w-xl leading-relaxed">
              منصة دردشة جماعية ورسائل خاصة بتشفير شامل من الطرف للطرف.
              مفاتيحك الخاصة لا تغادر جهازك أبداً. مصممة لمن يأخذ خصوصيته بجدية —
              بديل آمن لـ ديسكورد و تيمز، بدون مراقبة.
            </p>
            <div className="mt-10 flex items-center gap-4 flex-wrap">
              <Link to="/register" data-testid="hero-cta-btn"
                className="group inline-flex items-center gap-2 bg-[#00FF66] text-black px-6 py-3.5 font-medium hover:bg-white transition-all">
                أنشئ حساب آمن
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
              </Link>
              <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
                ← لدي حساب
              </Link>
            </div>

            <div className="mt-16 flex items-center gap-8 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Lock size={12} className="text-[#00FF66]" />
                <span className="font-mono-key tracking-widest">RSA-OAEP 2048</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <KeyRound size={12} className="text-[#00FF66]" />
                <span className="font-mono-key tracking-widest">PBKDF2-200K</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Fingerprint size={12} className="text-[#00FF66]" />
                <span className="font-mono-key tracking-widest">2FA TOTP</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative border border-white/10 bg-[#141414] p-6 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="label-ar">قناة آمنة</span>
                <div className="flex items-center gap-1.5">
                  <Lock size={10} className="text-[#00FF66]" />
                  <span className="font-mono-key text-[10px] text-[#00FF66]">ENCRYPTED</span>
                </div>
              </div>
              <div className="py-2">
                <div className="text-xs text-gray-500 mb-1">@ahmed · ١٤:٢٢</div>
                <div className="inline-block border border-white/10 px-3 py-2 text-sm">الإصدار الجديد جاهز — راجع #الإعلانات</div>
              </div>
              <div className="py-2 text-left">
                <div className="text-xs text-gray-500 mb-1">أنت · ١٤:٢٣</div>
                <div className="inline-block bg-white/10 px-3 py-2 text-sm text-right">تمام، أرسل الإيصالات المشفرة الآن 🔒</div>
              </div>
              <div className="py-2">
                <div className="text-xs text-gray-500 mb-1">@ahmed · ١٤:٢٣</div>
                <div className="inline-block border border-white/10 px-3 py-2">
                  <span className="font-mono-key text-[#00FF66] text-xs">a3f9 c210 88bd ffe1 0102 9933 7721 ab4c</span>
                </div>
                <div className="text-[10px] text-gray-600 mt-1">↑ بصمة مفتاحك — تحقّق منها مع أحمد شخصياً</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="mb-16">
            <div className="font-mono-key text-[10px] tracking-[0.3em] text-[#00FF66] mb-4">/ 01 — PRIVACY FIRST</div>
            <h2 className="font-display text-4xl lg:text-5xl max-w-3xl">
              كل رسالة. كل قناة. <span className="text-gray-500">لا يقرأها أحد سواك.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10">
            {features.map((f, i) => (
              <div key={i} className="bg-[#0A0A0A] p-8 hover:bg-[#141414] transition-colors">
                <f.icon size={22} className="text-[#00FF66] mb-6" />
                <div className="font-mono-key text-[10px] tracking-widest text-gray-500 mb-2">/ {String(i + 1).padStart(2, "0")}</div>
                <h3 className="font-display text-xl mb-3">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="relative z-10 border-t border-white/10 bg-[#080808]">
        <div className="max-w-7xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-16">
          <div>
            <div className="font-mono-key text-[10px] tracking-[0.3em] text-[#00FF66] mb-4">/ 02 — HOW IT WORKS</div>
            <h2 className="font-display text-4xl lg:text-5xl mb-8">
              مفاتيحك. جهازك. <br/>سيرفراتنا لا تستطيع التطفّل.
            </h2>
            <p className="text-gray-400 leading-relaxed text-base">
              عند التسجيل، يولّد Cipher زوج مفاتيح RSA بحجم ٢٠٤٨ بت داخل متصفحك.
              مفتاحك الخاص يُشفَّر بمفتاح AES-256 مشتق من كلمة المرور
              (PBKDF2 بـ ٢٠٠ ألف دورة) قبل أن يغادر جهازك. السيرفر يحتفظ بالشيفرة فقط —
              حتى لو أردنا قراءة رسائلك، لا نستطيع.
            </p>
          </div>

          <div className="border border-white/10 font-mono-key text-xs">
            {specs.map((s, i) => (
              <div key={i} className="flex justify-between items-center p-5 border-b border-white/10 last:border-b-0">
                <span className="text-gray-500 tracking-widest">{s.label}</span>
                <span className="text-[#00FF66]">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-24 text-center">
          <h2 className="font-display text-4xl lg:text-6xl mb-6">
            أنشئ سيرفر. ادعُ فريقك.
          </h2>
          <p className="text-gray-400 mb-10 max-w-xl mx-auto">
            بدون أرقام هواتف. بدون تتبّع. مجرّد محادثات مشفّرة.
          </p>
          <Link to="/register" data-testid="footer-cta-btn"
            className="inline-flex items-center gap-2 bg-[#00FF66] text-black px-8 py-4 font-medium hover:bg-white transition-colors">
            احجز اسمك
            <ArrowLeft size={16} />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-gray-500">
          <span className="font-mono-key">CIPHER © 2026 — ALL MESSAGES ENCRYPTED</span>
          <span>صُمِّم للخصوصية</span>
        </div>
      </footer>
    </div>
  );
}

const features = [
  { icon: Lock, title: "رسائل خاصة مشفّرة", body: "الرسائل الخاصة تُشفَّر بالمفتاح العام للمستلم. هو فقط من يستطيع فكّها — ليس نحن، ولا أي طرف آخر." },
  { icon: KeyRound, title: "توليد المفاتيح في جهازك", body: "أزواج مفاتيح RSA-OAEP بحجم ٢٠٤٨ بت تُولّد في متصفحك عبر Web Crypto API. مفاتيحك الخاصة لا تصل سيرفراتنا أبداً بصيغة قابلة للقراءة." },
  { icon: Fingerprint, title: "مصادقة ثنائية", body: "حماية TOTP عبر أي تطبيق مصادقة. مع كلمة المرور = حصن منيع لحسابك." },
  { icon: Eye, title: "سجل الجلسات والأجهزة", body: "كل تسجيل دخول، كل جهاز، مُسجَّل. اكتشف الاختراق فوراً واحذف الجلسات المريبة." },
  { icon: Users, title: "سيرفرات وقنوات", body: "نظّم فرقك في سيرفرات، مثل ديسكورد. أنشئ قنوات نصية، ادعُ أعضاء، شارك الملفات — كل شيء بسجل كامل." },
  { icon: Shield, title: "تصميم بدون معرفة", body: "نحفظ الشيفرة فقط. لو نسيت كلمة مرورك، يضيع مفتاحك للأبد. هذا ثمن الخصوصية الحقيقية." },
];

const specs = [
  { label: "ENCRYPTION", value: "RSA-OAEP 2048" },
  { label: "KEY DERIVATION", value: "PBKDF2 200K" },
  { label: "HYBRID CIPHER", value: "AES-GCM-256" },
  { label: "AUTH", value: "JWT · HttpOnly" },
  { label: "2FA", value: "TOTP RFC 6238" },
  { label: "TRANSPORT", value: "TLS 1.3" },
];

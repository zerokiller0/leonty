import { Link } from "react-router-dom";
import { Heart, Lock, Users, KeyRound, Fingerprint, Eye, ArrowLeft, Sparkles } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen text-[var(--text)] relative overflow-hidden">
      {/* Floating blobs */}
      <div className="absolute top-[10%] right-[15%] w-96 h-96 rounded-full bg-[var(--accent)]/10 blur-3xl float-blob pointer-events-none" />
      <div className="absolute bottom-[20%] left-[10%] w-80 h-80 rounded-full bg-[var(--secondary)]/10 blur-3xl float-blob pointer-events-none" style={{animationDelay: "3s"}} />

      <nav className="relative z-10 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="brand-link">
            <div className="w-9 h-9 rounded-2xl gradient-rose flex items-center justify-center shadow-lg shadow-[var(--accent)]/20">
              <Heart size={16} className="text-white" fill="white" />
            </div>
            <span className="font-display-en text-xl">Leonty</span>
          </Link>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-[var(--muted)] hover:text-white transition-colors hidden sm:block">المميزات</a>
            <a href="#security" className="text-sm text-[var(--muted)] hover:text-white transition-colors hidden sm:block">الأمان</a>
            <Link to="/login" data-testid="nav-login-btn" className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors">دخول</Link>
            <Link to="/register" data-testid="nav-signup-btn" className="btn-rose text-sm px-5 py-2.5">
              ابدأ الآن
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 px-4 py-1.5 mb-8">
              <Sparkles size={12} className="text-[var(--accent)]" />
              <span className="text-xs text-[var(--accent-soft)]">مشفّر بالكامل · صُمّم بحب</span>
            </div>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.1]">
              مساحتك الخاصة <br />
              <span className="text-gradient-rose">للأشخاص اللي تحبهم.</span>
            </h1>
            <p className="mt-8 text-[var(--muted)] text-lg max-w-xl leading-relaxed">
              منصة دردشة ومكالمات بتشفير شامل من الطرف للطرف. لرسائل خاصة، لحظات صادقة،
              ومحادثات لا يقرأها أحد سواكم. مفاتيحك تبقى معك — في جهازك فقط.
            </p>
            <div className="mt-10 flex items-center gap-4 flex-wrap">
              <Link to="/register" data-testid="hero-cta-btn"
                className="group btn-rose inline-flex items-center gap-2 px-7 py-4 text-base">
                أنشئ حسابك
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
              </Link>
              <Link to="/login" className="text-sm text-[var(--muted)] hover:text-white transition-colors">
                ← لدي حساب
              </Link>
            </div>

            <div className="mt-16 flex items-center gap-8 flex-wrap">
              {[
                { icon: Lock, label: "RSA-OAEP 2048" },
                { icon: KeyRound, label: "PBKDF2-200K" },
                { icon: Fingerprint, label: "2FA TOTP" },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-[var(--muted-soft)]">
                  <s.icon size={12} className="text-[var(--accent)]" />
                  <span className="font-mono-key tracking-widest">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative glass-card p-10 flex items-center justify-center min-h-[420px]">
              <div className="text-center space-y-6">
                <Heart className="mx-auto text-[var(--accent)] heart-pulse" size={56} fill="currentColor" />
                <div className="text-3xl sm:text-4xl font-display leading-relaxed text-gradient-rose">
                  هذا الموقع<br/>سويته بس عشانك<br/>يا ليونتي
                </div>
                <div className="text-3xl">❤️🌹❤️</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="mb-16">
            <div className="text-xs text-[var(--accent)] mb-4 tracking-widest font-mono-key">/ 01 — لكم وحدكم</div>
            <h2 className="font-display text-4xl lg:text-5xl max-w-3xl">
              كل رسالة. كل مكالمة. <span className="text-[var(--muted)]">لا يراها أحد سواكم.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <div key={i} className="glass-card p-7 hover:border-[var(--accent)]/30 transition-all duration-300 hover:-translate-y-1">
                <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mb-5">
                  <f.icon size={18} className="text-[var(--accent)]" />
                </div>
                <h3 className="font-display text-xl mb-2.5">{f.title}</h3>
                <p className="text-sm text-[var(--muted)] leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="relative z-10 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-16">
          <div>
            <div className="text-xs text-[var(--accent)] mb-4 tracking-widest font-mono-key">/ 02 — كيف يعمل</div>
            <h2 className="font-display text-4xl lg:text-5xl mb-8">
              مفاتيحك. جهازك. <br/><span className="text-gradient-rose">سيرّك معك.</span>
            </h2>
            <p className="text-[var(--muted)] leading-relaxed text-base">
              عند التسجيل، يولّد Leonty زوج مفاتيح RSA-2048 داخل متصفحك.
              مفتاحك الخاص يُشفّر بمفتاح AES-256 مشتقّ من كلمة مرورك (PBKDF2 بـ ٢٠٠ ألف دورة)
              قبل أن يغادر جهازك. السيرفر يحتفظ بالشيفرة فقط — لو أردنا قراءة رسائلك،
              لا نستطيع. هذا وعد رياضي، ليس فقط سياسة خصوصية.
            </p>
          </div>

          <div className="glass-card font-mono-key text-xs">
            {specs.map((s, i) => (
              <div key={i} className="flex justify-between items-center px-6 py-5 border-b border-[var(--border)] last:border-b-0">
                <span className="text-[var(--muted)] tracking-widest">{s.label}</span>
                <span className="text-[var(--accent)]">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-24 text-center">
          <Heart className="mx-auto text-[var(--accent)] mb-6 heart-pulse" size={40} fill="currentColor" />
          <h2 className="font-display text-4xl lg:text-6xl mb-6">
            ابدأ مساحتك الآن.
          </h2>
          <p className="text-[var(--muted)] mb-10 max-w-xl mx-auto">
            بدون أرقام هواتف. بدون تتبّع. مجرّد محادثات صادقة.
          </p>
          <Link to="/register" data-testid="footer-cta-btn"
            className="btn-rose inline-flex items-center gap-2 px-8 py-4 text-base">
            انضم إلينا
            <ArrowLeft size={16} />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-[var(--muted-soft)]">
          <span className="font-mono-key">LEONTY © 2026 · مشفّر بالكامل</span>
          <span>صُمِّم بحب 🌹</span>
        </div>
      </footer>
    </div>
  );
}

const features = [
  { icon: Lock, title: "رسائل مشفّرة", body: "كل رسالة خاصة تُشفّر بالمفتاح العام للمستلم. هو فقط من يستطيع قراءتها." },
  { icon: KeyRound, title: "مفاتيحك في جهازك", body: "أزواج RSA 2048-بت تُولّد في متصفحك. مفاتيحك الخاصة لا تصل سيرفراتنا أبداً." },
  { icon: Fingerprint, title: "حماية إضافية", body: "مصادقة ثنائية TOTP، سجل أجهزة، وبصمات تشفير لمنع الانتحال." },
  { icon: Users, title: "سيرفرات وقنوات", body: "مساحات خاصة لمجموعاتك — قنوات نصية، إيموجيات مخصصة، ومكالمات." },
  { icon: Eye, title: "مكالمات مشفّرة", body: "اتصالات صوت وفيديو ومشاركة شاشة P2P — تذهب مباشرة بين أجهزتكم." },
  { icon: Heart, title: "بسيط ولطيف", body: "واجهة دافئة وسلسة، صُمّمت للأشخاص الذين يحبون بعضهم." },
];

const specs = [
  { label: "ENCRYPTION", value: "RSA-OAEP 2048" },
  { label: "KEY DERIVATION", value: "PBKDF2 200K" },
  { label: "HYBRID LEONTY", value: "AES-GCM-256" },
  { label: "AUTH", value: "JWT · HttpOnly" },
  { label: "2FA", value: "TOTP RFC 6238" },
  { label: "TRANSPORT", value: "TLS 1.3" },
];

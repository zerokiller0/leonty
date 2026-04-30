import { Link } from "react-router-dom";
import { Shield, Lock, Users, KeyRound, Fingerprint, Eye, ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 grid-lines opacity-40 pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
            <div className="w-7 h-7 border border-[#00FF66] flex items-center justify-center">
              <Shield size={14} className="text-[#00FF66]" />
            </div>
            <span className="font-display text-lg tracking-tight">CIPHER</span>
            <span className="font-mono-key text-[10px] text-[#00FF66] tracking-widest ml-1">//E2EE</span>
          </Link>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">Features</a>
            <a href="#security" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">Security</a>
            <Link to="/login" data-testid="nav-login-btn" className="text-sm text-gray-300 hover:text-white">Sign in</Link>
            <Link to="/register" data-testid="nav-signup-btn" className="text-sm bg-white text-black px-4 py-2 hover:bg-[#00FF66] transition-colors font-medium">
              Get Access
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 border border-white/10 px-3 py-1.5 mb-8">
              <span className="w-1.5 h-1.5 bg-[#00FF66] rounded-full pulse-dot" />
              <span className="font-mono-key text-[10px] tracking-[0.3em] text-gray-400">ZERO-KNOWLEDGE · END-TO-END</span>
            </div>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-tighter font-medium leading-[0.95]">
              A secure messenger<br />
              <span className="text-[#00FF66]">servers can't read.</span>
            </h1>
            <p className="mt-8 text-gray-400 text-lg max-w-xl leading-relaxed">
              Team chat and private DMs with end-to-end encryption. Your private keys
              never leave your device. Built for people who take privacy seriously —
              replacing Discord and Teams, without the surveillance.
            </p>
            <div className="mt-10 flex items-center gap-4">
              <Link
                to="/register"
                data-testid="hero-cta-btn"
                className="group inline-flex items-center gap-2 bg-[#00FF66] text-black px-6 py-3.5 font-medium hover:bg-white transition-all"
              >
                Create secure account
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
                I have an account →
              </Link>
            </div>

            <div className="mt-16 flex items-center gap-8 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-gray-500 font-mono-key tracking-widest">
                <Lock size={12} className="text-[#00FF66]" /> RSA-OAEP 2048
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 font-mono-key tracking-widest">
                <KeyRound size={12} className="text-[#00FF66]" /> PBKDF2-200K
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 font-mono-key tracking-widest">
                <Fingerprint size={12} className="text-[#00FF66]" /> 2FA TOTP
              </div>
            </div>
          </div>

          {/* Visual */}
          <div className="lg:col-span-5">
            <div className="relative border border-white/10 bg-[#141414] p-6 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="font-mono-key text-[10px] tracking-widest text-gray-500">SECURE CHANNEL</span>
                <div className="flex items-center gap-1.5">
                  <Lock size={10} className="text-[#00FF66]" />
                  <span className="font-mono-key text-[10px] text-[#00FF66]">ENCRYPTED</span>
                </div>
              </div>
              <div className="py-2">
                <div className="text-xs text-gray-500 mb-1 font-mono-key">@alice · 14:22</div>
                <div className="inline-block border border-white/10 px-3 py-2 text-sm">the new drop is live — check #announcements</div>
              </div>
              <div className="py-2 text-right">
                <div className="text-xs text-gray-500 mb-1 font-mono-key">you · 14:23</div>
                <div className="inline-block bg-white/10 px-3 py-2 text-sm text-left">on it. sending encrypted receipts now</div>
              </div>
              <div className="py-2">
                <div className="text-xs text-gray-500 mb-1 font-mono-key">@alice · 14:23</div>
                <div className="inline-block border border-white/10 px-3 py-2 text-sm font-mono-key text-[#00FF66] text-xs">
                  a3f9 c210 88bd ffe1 0102 9933 7721 ab4c
                </div>
                <div className="text-[10px] text-gray-600 mt-1 font-mono-key">↑ your key fingerprint — verify with alice in person</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="mb-16">
            <div className="font-mono-key text-[10px] tracking-[0.3em] text-[#00FF66] mb-4">/ 01 — PRIVACY FIRST</div>
            <h2 className="font-display text-4xl lg:text-5xl tracking-tight max-w-3xl">
              Every message. Every channel. <span className="text-gray-500">Unreadable to everyone but you.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10">
            {features.map((f, i) => (
              <div key={i} className="bg-[#0A0A0A] p-8 hover:bg-[#141414] transition-colors">
                <f.icon size={22} className="text-[#00FF66] mb-6" />
                <div className="font-mono-key text-[10px] tracking-widest text-gray-500 mb-2">/ {String(i + 1).padStart(2, "0")}</div>
                <h3 className="font-display text-xl tracking-tight mb-3">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security spec */}
      <section id="security" className="relative z-10 border-t border-white/10 bg-[#080808]">
        <div className="max-w-7xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-16">
          <div>
            <div className="font-mono-key text-[10px] tracking-[0.3em] text-[#00FF66] mb-4">/ 02 — HOW IT WORKS</div>
            <h2 className="font-display text-4xl lg:text-5xl tracking-tight mb-8">
              Your keys. Your device. <br/>Our servers can't peek.
            </h2>
            <p className="text-gray-400 leading-relaxed text-base">
              When you sign up, Cipher generates a 2048-bit RSA keypair in your browser.
              Your private key is encrypted with a password-derived AES-256 key (PBKDF2,
              200K rounds) before it ever leaves your device. The server stores only
              ciphertext — we couldn't read your DMs if we wanted to.
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

      {/* CTA */}
      <section className="relative z-10 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-24 text-center">
          <h2 className="font-display text-4xl lg:text-6xl tracking-tighter mb-6">
            Start a server. Invite your team.
          </h2>
          <p className="text-gray-400 mb-10 max-w-xl mx-auto">
            No phone numbers. No tracking. Just encrypted conversations.
          </p>
          <Link
            to="/register"
            data-testid="footer-cta-btn"
            className="inline-flex items-center gap-2 bg-[#00FF66] text-black px-8 py-4 font-medium hover:bg-white transition-colors"
          >
            Claim your handle
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-gray-500 font-mono-key">
          <span>CIPHER © 2026 — ALL MESSAGES ENCRYPTED</span>
          <span>BUILT FOR PRIVACY</span>
        </div>
      </footer>
    </div>
  );
}

const features = [
  { icon: Lock, title: "E2EE Direct Messages", body: "Direct messages are encrypted with the recipient's public key. Only the recipient can decrypt them — not us, not anyone." },
  { icon: KeyRound, title: "Client-side Key Generation", body: "RSA-OAEP 2048-bit keypairs generated in your browser via Web Crypto API. Private keys never touch our servers in readable form." },
  { icon: Fingerprint, title: "Two-Factor Authentication", body: "TOTP-based 2FA with any authenticator app. Combine with your password for fortress-grade account protection." },
  { icon: Eye, title: "Session & Device Logs", body: "Every login, every device is logged. Spot anomalies instantly and revoke sessions you don't recognize." },
  { icon: Users, title: "Servers & Channels", body: "Organize teams in servers, like Discord. Create text channels, invite members, share files — all with full audit trail." },
  { icon: Shield, title: "Zero Knowledge Design", body: "We store ciphertext only. Lose your password and your private key is gone forever. That's the price of real privacy." },
];

const specs = [
  { label: "ENCRYPTION", value: "RSA-OAEP 2048" },
  { label: "KEY DERIVATION", value: "PBKDF2 200K" },
  { label: "HYBRID CIPHER", value: "AES-GCM-256" },
  { label: "AUTH", value: "JWT · HttpOnly" },
  { label: "2FA", value: "TOTP RFC 6238" },
  { label: "TRANSPORT", value: "TLS 1.3" },
];

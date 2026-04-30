import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api, { formatApiError } from "../lib/api";
import { fingerprint } from "../lib/crypto";
import { ArrowLeft, Shield, QrCode, KeyRound, MonitorSmartphone, Copy } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState("security");
  const [sessions, setSessions] = useState([]);
  const [fingerp, setFingerp] = useState("");
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (user?.public_key) fingerprint(user.public_key).then(setFingerp);
    api.get("/sessions").then(({ data }) => setSessions(data.sessions));
  }, [user?.public_key]);

  const startSetup = async () => {
    try {
      const { data } = await api.post("/auth/2fa/setup");
      setQr(data.qr_code);
      setSecret(data.secret);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const verify = async () => {
    try {
      await api.post("/auth/2fa/verify", { code });
      toast.success("2FA enabled");
      setQr(null); setSecret(""); setCode("");
      await refreshUser();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const disable = async () => {
    const c = prompt("Enter current 2FA code to disable");
    if (!c) return;
    try {
      await api.post("/auth/2fa/disable", { code: c });
      toast.success("2FA disabled");
      await refreshUser();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <header className="border-b border-white/10 px-6 py-5 flex items-center gap-4">
        <Link to="/app" data-testid="settings-back" className="text-gray-500 hover:text-white flex items-center gap-2 text-xs font-mono-key tracking-widest">
          <ArrowLeft size={14} /> BACK TO APP
        </Link>
        <div className="h-4 w-px bg-white/10" />
        <Shield size={16} className="text-[#00FF66]" />
        <span className="font-display">Security Settings</span>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-[200px,1fr] gap-12">
        <nav className="space-y-1">
          {[
            { k: "security", label: "SECURITY" },
            { k: "identity", label: "IDENTITY" },
            { k: "sessions", label: "SESSIONS" },
          ].map((t) => (
            <button key={t.k} data-testid={`tab-${t.k}`} onClick={() => setTab(t.k)}
              className={`w-full text-left px-3 py-2 font-mono-key text-[10px] tracking-widest transition-colors ${
                tab === t.k ? "bg-white/10 text-[#00FF66]" : "text-gray-500 hover:text-white"
              }`}>
              {t.label}
            </button>
          ))}
        </nav>

        <div>
          {tab === "security" && (
            <section className="space-y-8">
              <div>
                <h2 className="font-display text-2xl tracking-tight mb-1">Two-Factor Authentication</h2>
                <p className="text-sm text-gray-500 mb-6">TOTP with authenticator apps (1Password, Authy, Google Authenticator).</p>

                {user?.two_factor_enabled ? (
                  <div className="border border-[#00FF66]/30 bg-[#00FF66]/5 p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <KeyRound size={18} className="text-[#00FF66]" />
                      <div>
                        <div className="font-medium text-sm">2FA is enabled</div>
                        <div className="font-mono-key text-[10px] text-gray-500">Your account is protected</div>
                      </div>
                    </div>
                    <button data-testid="disable-2fa-btn" onClick={disable} className="text-xs font-mono-key tracking-widest border border-[#FF3333]/30 text-[#FF3333] px-3 py-1.5 hover:bg-[#FF3333]/10">
                      DISABLE
                    </button>
                  </div>
                ) : !qr ? (
                  <button data-testid="enable-2fa-btn" onClick={startSetup} className="bg-[#00FF66] text-black px-5 py-3 text-sm font-medium hover:bg-white inline-flex items-center gap-2">
                    <QrCode size={14} /> ENABLE 2FA
                  </button>
                ) : (
                  <div className="border border-white/10 bg-[#141414] p-6 space-y-4 max-w-md">
                    <div className="flex justify-center p-4 bg-white">
                      <img src={qr} alt="2FA QR" className="w-48 h-48" data-testid="qr-img" />
                    </div>
                    <div>
                      <div className="font-mono-key text-[10px] tracking-widest text-gray-500 mb-1">SECRET (BACKUP)</div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 font-mono-key text-xs bg-black/40 p-2 break-all">{secret}</code>
                        <button onClick={() => { navigator.clipboard.writeText(secret); toast.success("Copied"); }} className="text-gray-500 hover:text-white">
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-mono-key text-[10px] tracking-widest text-gray-500 mb-2">ENTER 6-DIGIT CODE</label>
                      <input data-testid="verify-2fa-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6}
                        className="w-full bg-transparent border border-white/20 px-4 py-3 text-lg font-mono-key tracking-[0.5em] text-center focus:outline-none focus:border-[#00FF66]" />
                    </div>
                    <button data-testid="verify-2fa-btn" onClick={verify} className="w-full bg-white text-black py-2.5 text-sm hover:bg-[#00FF66]">
                      VERIFY & ENABLE
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {tab === "identity" && (
            <section className="space-y-8">
              <div>
                <h2 className="font-display text-2xl tracking-tight mb-1">Cryptographic Identity</h2>
                <p className="text-sm text-gray-500 mb-6">Share your fingerprint with contacts to verify authenticity.</p>

                <div className="border border-white/10 bg-[#141414] p-6 space-y-5 max-w-2xl">
                  <div>
                    <div className="font-mono-key text-[10px] tracking-widest text-gray-500 mb-2">FINGERPRINT (SHA-256)</div>
                    <code className="block font-mono-key text-lg text-[#00FF66] tracking-widest" data-testid="fingerprint-value">{fingerp || "—"}</code>
                  </div>
                  <div>
                    <div className="font-mono-key text-[10px] tracking-widest text-gray-500 mb-2">PUBLIC KEY (RSA 2048)</div>
                    <code className="block font-mono-key text-[10px] text-gray-400 bg-black/40 p-3 break-all max-h-24 overflow-y-auto" data-testid="pubkey-value">
                      {user?.public_key?.slice(0, 400)}...
                    </code>
                  </div>
                  <div>
                    <div className="font-mono-key text-[10px] tracking-widest text-gray-500 mb-2">USERNAME</div>
                    <code className="font-mono-key text-sm text-white">@{user?.username}</code>
                  </div>
                </div>
              </div>
            </section>
          )}

          {tab === "sessions" && (
            <section>
              <h2 className="font-display text-2xl tracking-tight mb-1">Login Activity</h2>
              <p className="text-sm text-gray-500 mb-6">Recent authentication events for your account.</p>

              <div className="border border-white/10">
                {sessions.map((s) => (
                  <div key={s.id} className="grid grid-cols-[auto,1fr,auto,auto] gap-4 items-center p-4 border-b border-white/10 last:border-b-0" data-testid={`session-${s.id}`}>
                    <MonitorSmartphone size={16} className="text-gray-500" />
                    <div className="min-w-0">
                      <div className="text-xs truncate">{s.user_agent}</div>
                      <div className="font-mono-key text-[10px] text-gray-500">{s.ip}</div>
                    </div>
                    <span className={`font-mono-key text-[10px] tracking-widest px-2 py-0.5 border ${
                      s.action === "login" ? "border-[#00FF66]/30 text-[#00FF66]" :
                      s.action === "login_failed" ? "border-[#FF3333]/30 text-[#FF3333]" :
                      "border-white/10 text-gray-500"
                    }`}>{s.action.toUpperCase()}</span>
                    <span className="font-mono-key text-[10px] text-gray-500">{new Date(s.created_at).toLocaleString()}</span>
                  </div>
                ))}
                {sessions.length === 0 && <div className="p-6 text-xs text-gray-500">No sessions recorded</div>}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

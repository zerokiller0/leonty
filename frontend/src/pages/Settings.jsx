import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api, { formatApiError } from "../lib/api";
import { fingerprint } from "../lib/crypto";
import { ArrowRight, Heart, QrCode, KeyRound, MonitorSmartphone, Copy, UserPlus, Camera, Save } from "lucide-react";
import { toast } from "sonner";

const BASE = process.env.REACT_APP_BACKEND_URL;

export default function Settings() {
  const { user, refreshUser, upgradeAccount } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState(user?.is_guest ? "upgrade" : "profile");
  const [sessions, setSessions] = useState([]);
  const [fingerp, setFingerp] = useState("");
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [upgradeForm, setUpgradeForm] = useState({ email: "", password: "", confirm: "", currentRecoveryCode: "" });
  const [upgrading, setUpgrading] = useState(false);

  // Profile state
  const [profile, setProfile] = useState({
    display_name: user?.display_name || "",
    avatar_url: user?.avatar_url || "",
    about_me: user?.about_me || "",
    status: user?.status || "online",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (user) {
      setProfile({
        display_name: user.display_name || "",
        avatar_url: user.avatar_url || "",
        about_me: user.about_me || "",
        status: user.status || "online",
      });
    }
    if (user?.public_key) fingerprint(user.public_key).then(setFingerp);
    api.get("/sessions").then(({ data }) => setSessions(data.sessions));
  }, [user?.id]);

  const onAvatarPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("اختر صورة"); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("حد أقصى ٥ ميجا"); return; }
    setUploadingAvatar(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const { data } = await api.post("/files/upload", fd);
      const url = `${BASE}/api/files/${data.file.id}`;
      setProfile((p) => ({ ...p, avatar_url: url }));
      // auto-save avatar
      await api.patch("/users/me", { avatar_url: url });
      await refreshUser();
      toast.success("تم تحديث الصورة");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploadingAvatar(false); }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.patch("/users/me", {
        display_name: profile.display_name,
        about_me: profile.about_me,
        status: profile.status,
      });
      await refreshUser();
      toast.success("تم حفظ البروفايل");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSavingProfile(false); }
  };

  const startSetup = async () => { try { const { data } = await api.post("/auth/2fa/setup"); setQr(data.qr_code); setSecret(data.secret); } catch (e) { toast.error(formatApiError(e)); } };
  const verify = async () => { try { await api.post("/auth/2fa/verify", { code }); toast.success("تم التفعيل"); setQr(null); setSecret(""); setCode(""); await refreshUser(); } catch (e) { toast.error(formatApiError(e)); } };
  const disable = async () => {
    const c = prompt("أدخل رمز المصادقة الحالي");
    if (!c) return;
    try { await api.post("/auth/2fa/disable", { code: c }); toast.success("تم التعطيل"); await refreshUser(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const submitUpgrade = async (e) => {
    e.preventDefault();
    if (upgradeForm.password !== upgradeForm.confirm) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    if (upgradeForm.password.length < 8) { toast.error("٨ أحرف على الأقل"); return; }
    if (!upgradeForm.currentRecoveryCode) { toast.error("أدخل كود الاسترجاع"); return; }
    setUpgrading(true);
    try {
      await upgradeAccount({ email: upgradeForm.email, password: upgradeForm.password, currentRecoveryCode: upgradeForm.currentRecoveryCode });
      toast.success("تم ترقية حسابك"); nav("/app");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUpgrading(false); }
  };

  const tabs = [
    ...(user?.is_guest ? [{ k: "upgrade", label: "ترقية الحساب" }] : []),
    { k: "profile", label: "الملف الشخصي" },
    { k: "security", label: "الأمان" },
    { k: "identity", label: "الهوية" },
    { k: "sessions", label: "الجلسات" },
  ];

  const statusOptions = [
    { v: "online", l: "متصل" },
    { v: "idle", l: "بعيد" },
    { v: "dnd", l: "مشغول" },
    { v: "invisible", l: "غير مرئي" },
  ];

  return (
    <div className="min-h-screen text-[var(--text)]">
      <header className="border-b border-[var(--border)] px-6 py-5 flex items-center gap-4">
        <Link to="/app" data-testid="settings-back" className="btn-soft px-4 py-2 text-xs flex items-center gap-2">
          <ArrowRight size={14} /> العودة للتطبيق
        </Link>
        <div className="h-4 w-px bg-[var(--border)]" />
        <div className="w-8 h-8 rounded-xl gradient-rose flex items-center justify-center">
          <Heart size={14} className="text-white" fill="white" />
        </div>
        <span className="font-display">إعدادات الحساب</span>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-[200px,1fr] gap-12">
        <nav className="space-y-1">
          {tabs.map((t) => (
            <button key={t.k} data-testid={`tab-${t.k}`} onClick={() => setTab(t.k)}
              className={`w-full text-right px-4 py-2.5 rounded-xl text-sm transition-colors ${
                tab === t.k ? "gradient-rose text-white" : "text-[var(--muted)] hover:text-white hover:bg-white/5"
              }`}>
              {t.label}
            </button>
          ))}
        </nav>

        <div>
          {tab === "profile" && (
            <section>
              <h2 className="font-display text-2xl mb-1">الملف الشخصي</h2>
              <p className="text-sm text-[var(--muted)] mb-6">عدّل صورتك ونبذتك وحالتك.</p>

              <div className="glass-card p-6 space-y-6 max-w-2xl">
                {/* Avatar */}
                <div className="flex items-center gap-5">
                  <div className="relative">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-[var(--accent)]/30" data-testid="avatar-preview" />
                    ) : (
                      <div className="w-24 h-24 rounded-full gradient-rose flex items-center justify-center text-3xl text-white font-display border-4 border-[var(--accent)]/30">
                        {profile.display_name?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <button onClick={() => fileRef.current?.click()} disabled={uploadingAvatar} data-testid="avatar-upload-btn"
                      className="absolute bottom-0 left-0 w-9 h-9 rounded-full gradient-rose text-white flex items-center justify-center shadow-lg hover:scale-110 transition disabled:opacity-50">
                      <Camera size={14} />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarPick} data-testid="avatar-file-input" />
                  </div>
                  <div className="flex-1">
                    <div className="font-display text-lg">{profile.display_name || user?.username}</div>
                    <div className="text-xs text-[var(--muted)] font-mono-key">@{user?.username}</div>
                    {uploadingAvatar && <div className="text-xs text-[var(--accent)] mt-1">جاري الرفع...</div>}
                  </div>
                </div>

                <div>
                  <label className="block label-soft mb-2">الاسم الظاهر</label>
                  <input data-testid="profile-display-name" value={profile.display_name}
                    onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                    maxLength={40} className="w-full input-soft px-4 py-3 text-sm" />
                </div>

                <div>
                  <label className="block label-soft mb-2">الحالة</label>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {statusOptions.map((s) => (
                      <button key={s.v} type="button" data-testid={`status-${s.v}`}
                        onClick={() => setProfile({ ...profile, status: s.v })}
                        className={`px-3 py-1.5 rounded-full text-xs transition ${profile.status === s.v ? "gradient-rose text-white" : "btn-soft"}`}>
                        {s.l}
                      </button>
                    ))}
                  </div>
                  <input data-testid="profile-custom-status" value={!statusOptions.find(s => s.v === profile.status) ? profile.status : ""}
                    onChange={(e) => setProfile({ ...profile, status: e.target.value })}
                    placeholder="أو حالة مخصّصة..."
                    maxLength={80} className="w-full input-soft px-4 py-2.5 text-sm" />
                </div>

                <div>
                  <label className="block label-soft mb-2">نبذة (About me)</label>
                  <textarea data-testid="profile-about" value={profile.about_me}
                    onChange={(e) => setProfile({ ...profile, about_me: e.target.value })}
                    maxLength={500} rows={4}
                    placeholder="حدّث الناس عنك..."
                    className="w-full input-soft px-4 py-3 text-sm resize-none" />
                  <div className="text-[10px] text-[var(--muted-soft)] mt-1 text-left">{profile.about_me.length}/500</div>
                </div>

                <button data-testid="save-profile-btn" onClick={saveProfile} disabled={savingProfile}
                  className="btn-rose px-6 py-3 text-sm flex items-center gap-2 disabled:opacity-50">
                  <Save size={14} />
                  {savingProfile ? "جاري الحفظ..." : "حفظ التعديلات"}
                </button>
              </div>
            </section>
          )}

          {tab === "upgrade" && (
            <section>
              <h2 className="font-display text-2xl mb-1">ترقية حساب الضيف</h2>
              <p className="text-sm text-[var(--muted)] mb-6">أضف بريداً وكلمة مرور لتحويل حسابك المؤقت لحساب دائم.</p>

              <form onSubmit={submitUpgrade} className="glass-card p-6 space-y-4 max-w-xl">
                <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-3 text-xs">
                  💡 ستحتفظ بكل سيرفراتك ورسائلك ومفاتيح التشفير.
                </div>
                <div>
                  <label className="block label-soft mb-2">كود الاسترجاع الحالي</label>
                  <input data-testid="upgrade-recovery-code" required type="text" dir="ltr"
                    value={upgradeForm.currentRecoveryCode}
                    onChange={(e) => setUpgradeForm({ ...upgradeForm, currentRecoveryCode: e.target.value.toUpperCase() })}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    className="w-full input-soft px-4 py-3 text-sm font-mono-key tracking-widest" />
                </div>
                <div>
                  <label className="block label-soft mb-2">البريد الإلكتروني</label>
                  <input data-testid="upgrade-email" required type="email" dir="ltr"
                    value={upgradeForm.email} onChange={(e) => setUpgradeForm({ ...upgradeForm, email: e.target.value })}
                    className="w-full input-soft px-4 py-3 text-sm" />
                </div>
                <div>
                  <label className="block label-soft mb-2">كلمة المرور الجديدة</label>
                  <input data-testid="upgrade-password" required type="password" minLength={8} dir="ltr"
                    value={upgradeForm.password} onChange={(e) => setUpgradeForm({ ...upgradeForm, password: e.target.value })}
                    className="w-full input-soft px-4 py-3 text-sm" />
                </div>
                <div>
                  <label className="block label-soft mb-2">تأكيد</label>
                  <input data-testid="upgrade-confirm" required type="password" dir="ltr"
                    value={upgradeForm.confirm} onChange={(e) => setUpgradeForm({ ...upgradeForm, confirm: e.target.value })}
                    className="w-full input-soft px-4 py-3 text-sm" />
                </div>
                <button data-testid="upgrade-submit" type="submit" disabled={upgrading}
                  className="btn-rose w-full py-3.5 text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                  <UserPlus size={14} />
                  {upgrading ? "جاري الترقية..." : "ترقية"}
                </button>
              </form>
            </section>
          )}

          {tab === "security" && (
            <section>
              <h2 className="font-display text-2xl mb-1">المصادقة الثنائية</h2>
              <p className="text-sm text-[var(--muted)] mb-6">حماية إضافية بـ TOTP.</p>

              {user?.two_factor_enabled ? (
                <div className="glass-card p-5 flex items-center justify-between border-[var(--accent)]/30">
                  <div className="flex items-center gap-3">
                    <KeyRound size={18} className="text-[var(--accent)]" />
                    <div>
                      <div className="font-medium text-sm">المصادقة الثنائية مفعّلة</div>
                      <div className="text-[10px] text-[var(--muted)]">حسابك محمي</div>
                    </div>
                  </div>
                  <button data-testid="disable-2fa-btn" onClick={disable}
                    className="text-xs rounded-full border border-[var(--error)]/30 text-[var(--error)] px-4 py-1.5 hover:bg-[var(--error)]/10">
                    تعطيل
                  </button>
                </div>
              ) : !qr ? (
                <button data-testid="enable-2fa-btn" onClick={startSetup} className="btn-rose px-6 py-3.5 text-sm flex items-center gap-2">
                  <QrCode size={14} /> تفعيل
                </button>
              ) : (
                <div className="glass-card p-6 space-y-4 max-w-md">
                  <div className="flex justify-center p-4 bg-white rounded-2xl">
                    <img src={qr} alt="2FA QR" className="w-48 h-48" data-testid="qr-img" />
                  </div>
                  <div>
                    <div className="label-soft mb-1">السر</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono-key text-xs bg-[var(--surface)] rounded-xl p-3 break-all">{secret}</code>
                      <button onClick={() => { navigator.clipboard.writeText(secret); toast.success("تم النسخ"); }} className="text-[var(--muted)] hover:text-white">
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block label-soft mb-2">الرمز ٦ أرقام</label>
                    <input data-testid="verify-2fa-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} dir="ltr"
                      className="w-full input-soft px-4 py-3 text-lg font-mono-key tracking-[0.5em] text-center" />
                  </div>
                  <button data-testid="verify-2fa-btn" onClick={verify} className="btn-rose w-full py-3 text-sm">تحقّق وفعّل</button>
                </div>
              )}
            </section>
          )}

          {tab === "identity" && (
            <section>
              <h2 className="font-display text-2xl mb-1">الهوية التشفيرية</h2>
              <p className="text-sm text-[var(--muted)] mb-6">شارك بصمتك مع أحبتك للتأكّد من الأصالة.</p>

              <div className="glass-card p-6 space-y-5 max-w-2xl">
                <div>
                  <div className="label-soft mb-2">البصمة (SHA-256)</div>
                  <code className="block font-mono-key text-lg text-[var(--accent)] tracking-widest" data-testid="fingerprint-value">{fingerp || "—"}</code>
                </div>
                <div>
                  <div className="label-soft mb-2">المفتاح العام</div>
                  <code className="block font-mono-key text-[10px] text-[var(--muted)] bg-[var(--surface)] rounded-xl p-3 break-all max-h-24 overflow-y-auto" data-testid="pubkey-value">
                    {user?.public_key?.slice(0, 400)}...
                  </code>
                </div>
                <div>
                  <div className="label-soft mb-2">اسم المستخدم</div>
                  <code className="font-mono-key text-sm">@{user?.username}</code>
                </div>
              </div>
            </section>
          )}

          {tab === "sessions" && (
            <section>
              <h2 className="font-display text-2xl mb-1">سجل الدخول</h2>
              <p className="text-sm text-[var(--muted)] mb-6">أحدث أحداث المصادقة.</p>

              <div className="glass-card overflow-hidden">
                {sessions.map((s) => (
                  <div key={s.id} className="grid grid-cols-[auto,1fr,auto,auto] gap-4 items-center p-4 border-b border-[var(--border)] last:border-b-0" data-testid={`session-${s.id}`}>
                    <MonitorSmartphone size={16} className="text-[var(--muted)]" />
                    <div className="min-w-0">
                      <div className="text-xs truncate">{s.user_agent}</div>
                      <div className="font-mono-key text-[10px] text-[var(--muted-soft)]">{s.ip}</div>
                    </div>
                    <span className={`font-mono-key text-[10px] tracking-widest px-2.5 py-1 rounded-full ${
                      ["login", "register", "guest_register", "guest_login"].includes(s.action)
                        ? "bg-[var(--accent)]/10 text-[var(--accent)]" :
                      s.action === "login_failed" ? "bg-[var(--error)]/10 text-[var(--error)]" :
                      "bg-white/5 text-[var(--muted)]"
                    }`}>{s.action.toUpperCase()}</span>
                    <span className="font-mono-key text-[10px] text-[var(--muted-soft)]">{new Date(s.created_at).toLocaleString("ar")}</span>
                  </div>
                ))}
                {sessions.length === 0 && <div className="p-6 text-xs text-[var(--muted)]">لا توجد جلسات</div>}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

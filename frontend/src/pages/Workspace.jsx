import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api, { formatApiError } from "../lib/api";
import { encryptForPublicKey, decryptWithPrivateKey, fingerprint } from "../lib/crypto";
import { EmojiButton } from "../components/EmojiPicker";
import MessageContent, { refreshEmojiCache } from "../components/MessageContent";
import VoiceRecorder from "../components/VoiceRecorder";
import VoiceCall from "../components/VoiceCall";
import {
  Heart, Plus, Hash, Settings as SettingsIcon, LogOut, Search, Send,
  Lock, MessageCircle, Copy, X, Smile, Trash2, ImagePlus, Phone, Video,
} from "lucide-react";
import { toast } from "sonner";

const BASE = process.env.REACT_APP_BACKEND_URL;

export default function Workspace() {
  const { serverId, channelId, userId } = useParams();
  const nav = useNavigate();
  const { user, logout, privateKeyB64 } = useAuth();
  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [dmConversations, setDmConversations] = useState([]);
  const [dmPartner, setDmPartner] = useState(null);
  const [input, setInput] = useState("");
  const [showServerModal, setShowServerModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showDmSearch, setShowDmSearch] = useState(false);
  const [showEmojiManager, setShowEmojiManager] = useState(false);
  const [callPartner, setCallPartner] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [fingerp, setFingerp] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const loadSidebar = async () => {
    const [s, d] = await Promise.all([api.get("/servers"), api.get("/dms")]);
    setServers(s.data.servers);
    setDmConversations(d.data.conversations);
  };

  useEffect(() => {
    loadSidebar();
    if (user?.public_key) fingerprint(user.public_key).then(setFingerp);
  }, [user?.public_key]);

  useEffect(() => {
    if (!serverId) { setActiveServer(null); setChannels([]); setMembers([]); return; }
    (async () => {
      try {
        const { data } = await api.get(`/servers/${serverId}`);
        setActiveServer(data.server);
        setMembers(data.members);
        const ch = await api.get(`/servers/${serverId}/channels`);
        setChannels(ch.data.channels);
        if (!channelId && ch.data.channels[0]) {
          nav(`/app/${serverId}/${ch.data.channels[0].id}`, { replace: true });
        }
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, [serverId]);

  useEffect(() => {
    if (!userId) { setDmPartner(null); return; }
    (async () => {
      const { data } = await api.get(`/users/${userId}`);
      setDmPartner(data.user);
    })();
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (channelId) {
          const { data } = await api.get(`/channels/${channelId}/messages`);
          if (!cancelled) setMessages(data.messages);
        } else if (userId) {
          const { data } = await api.get(`/dms/${userId}`);
          if (!cancelled) {
            const decrypted = await Promise.all(
              data.messages.map(async (m) => {
                try {
                  const ct = m.sender_id === user.id ? m.sender_ciphertext : m.recipient_ciphertext;
                  const pt = privateKeyB64 ? await decryptWithPrivateKey(ct, privateKeyB64) : "[مقفل]";
                  return { ...m, plaintext: pt };
                } catch { return { ...m, plaintext: "[فشل فكّ التشفير]" }; }
              }),
            );
            setMessages(decrypted);
          }
        } else { setMessages([]); }
      } catch {}
    };
    load();
    const t = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(t); };
  }, [channelId, userId, privateKeyB64, user?.id]);

  // Poll for incoming calls
  useEffect(() => {
    if (callPartner) return;  // already in call view; that handles signals
    const poll = async () => {
      try {
        const { data } = await api.get("/calls/signals");
        const offer = data.signals.find(s => s.type === "offer");
        if (offer) {
          setIncomingCall({
            partner: offer.from_user,
            callId: offer.call_id,
            offer: offer.payload,
          });
        }
      } catch {}
    };
    const t = setInterval(poll, 2500);
    poll();
    return () => clearInterval(t);
  }, [callPartner]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    try {
      if (channelId) {
        await api.post(`/channels/${channelId}/messages`, { content: input });
      } else if (userId && dmPartner) {
        if (!privateKeyB64) { toast.error("لا يوجد مفتاح خاص — أعد تسجيل الدخول"); return; }
        const recipient_ciphertext = await encryptForPublicKey(input, dmPartner.public_key);
        const sender_ciphertext = await encryptForPublicKey(input, user.public_key);
        await api.post("/dms", { recipient_id: dmPartner.id, sender_ciphertext, recipient_ciphertext });
      }
      setInput("");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const sendVoiceMsg = async (placeholder, fileId) => {
    try {
      if (channelId) {
        await api.post(`/channels/${channelId}/messages`, { content: placeholder, attachment_id: fileId });
      } else if (userId && dmPartner) {
        const ct = `${placeholder}|attachment:${fileId}`;
        const recipient_ciphertext = await encryptForPublicKey(ct, dmPartner.public_key);
        const sender_ciphertext = await encryptForPublicKey(ct, user.public_key);
        await api.post("/dms", { recipient_id: dmPartner.id, sender_ciphertext, recipient_ciphertext, attachment_id: fileId });
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const insertAtCursor = (text) => {
    const el = inputRef.current;
    if (!el) { setInput(input + text); return; }
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    setInput(input.slice(0, start) + text + input.slice(end));
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = start + text.length; }, 0);
  };

  const createServer = async (name) => {
    try {
      const { data } = await api.post("/servers", { name });
      await loadSidebar();
      nav(`/app/${data.server.id}`);
      setShowServerModal(false);
      toast.success("تم إنشاء السيرفر");
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const joinServer = async (code) => {
    try {
      const { data } = await api.post("/servers/join", { invite_code: code });
      await loadSidebar();
      nav(`/app/${data.server.id}`);
      setShowServerModal(false);
      toast.success("تم الانضمام");
      refreshEmojiCache();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const createChannel = async (name) => {
    try {
      const { data } = await api.post(`/servers/${serverId}/channels`, { name });
      setChannels([...channels, data.channel]);
      nav(`/app/${serverId}/${data.channel.id}`);
      setShowChannelModal(false);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const activeChannel = channels.find((c) => c.id === channelId);

  return (
    <div dir="ltr" className="h-screen w-screen flex overflow-hidden text-[var(--text)]">
      {/* Servers sidebar (LEFT in any direction) */}
      <aside dir="rtl" className="w-[80px] bg-[var(--bg-soft)] border-r border-[var(--border)] flex flex-col items-center py-4 gap-3 shrink-0">
        <Link to="/app" data-testid="home-btn" className="w-12 h-12 rounded-2xl gradient-rose flex items-center justify-center hover:rounded-3xl transition-all duration-200 shadow-lg shadow-[var(--accent)]/20">
          <Heart size={18} className="text-white" fill="white" />
        </Link>
        <div className="w-8 h-px bg-[var(--border)]" />
        <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 w-full items-center">
          {servers.map((s) => (
            <button key={s.id} data-testid={`server-${s.id}`} onClick={() => nav(`/app/${s.id}`)}
              className={`w-12 h-12 flex items-center justify-center font-display text-sm transition-all duration-200 ${
                s.id === serverId
                  ? "rounded-2xl bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30"
                  : "rounded-3xl bg-[var(--surface)] hover:rounded-2xl hover:bg-[var(--accent)]/20 text-[var(--text)]"
              }`} title={s.name}>
              {s.name.slice(0, 2).toUpperCase()}
            </button>
          ))}
          <button data-testid="add-server-btn" onClick={() => setShowServerModal(true)}
            title="إنشاء أو الانضمام لسيرفر"
            className="w-12 h-12 rounded-full bg-[var(--surface)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)] text-[var(--accent)] flex items-center justify-center transition-all duration-200 border border-dashed border-[var(--accent)]/40 hover:border-solid">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-2 items-center">
          <Link to="/settings" data-testid="settings-btn" className="w-11 h-11 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)] flex items-center justify-center transition-colors">
            <SettingsIcon size={15} />
          </Link>
          <button data-testid="logout-btn" onClick={logout}
            className="w-11 h-11 rounded-full bg-[var(--surface)] hover:bg-[var(--error)]/20 hover:text-[var(--error)] flex items-center justify-center transition-colors">
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* Channels/DMs */}
      <aside dir="rtl" className="w-[260px] bg-[var(--bg-soft)] border-r border-[var(--border)] flex flex-col shrink-0">
        <div className="p-4 border-b border-[var(--border)] flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="label-soft mb-1">{activeServer ? "السيرفر" : "الرسائل المباشرة"}</div>
            <div className="font-display text-base truncate">{activeServer?.name || "محادثاتك"}</div>
            {activeServer && (
              <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--muted)]">
                <Copy size={10} className="cursor-pointer hover:text-[var(--accent)]"
                  onClick={() => { navigator.clipboard.writeText(activeServer.invite_code); toast.success("تم نسخ الدعوة"); }} />
                <span className="font-mono-key">دعوة: {activeServer.invite_code}</span>
              </div>
            )}
          </div>
          {activeServer && (
            <button data-testid="manage-emojis-btn" onClick={() => setShowEmojiManager(true)} title="إدارة الإيموجي"
              className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors p-1.5 rounded-full hover:bg-white/5">
              <Smile size={16} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {activeServer ? (
            <>
              <div className="flex items-center justify-between px-2 py-2">
                <span className="label-soft">القنوات</span>
                <button data-testid="add-channel-btn" onClick={() => setShowChannelModal(true)}
                  className="text-[var(--muted)] hover:text-[var(--accent)] w-6 h-6 rounded-full hover:bg-white/5 flex items-center justify-center">
                  <Plus size={12} />
                </button>
              </div>
              {channels.map((c) => (
                <button key={c.id} data-testid={`channel-${c.id}`} onClick={() => nav(`/app/${serverId}/${c.id}`)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors ${
                    c.id === channelId ? "bg-[var(--accent)]/15 text-white" : "text-[var(--muted)] hover:text-white hover:bg-white/5"
                  }`}>
                  <Hash size={14} /> <span className="truncate">{c.name}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-2 py-2">
                <span className="label-soft">مباشر · مشفّر</span>
                <button data-testid="new-dm-btn" onClick={() => setShowDmSearch(true)}
                  className="text-[var(--muted)] hover:text-[var(--accent)] w-6 h-6 rounded-full hover:bg-white/5 flex items-center justify-center">
                  <Plus size={12} />
                </button>
              </div>
              {dmConversations.map((c) => (
                <button key={c.partner.id} data-testid={`dm-${c.partner.id}`} onClick={() => nav(`/app/dm/${c.partner.id}`)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-2xl transition-colors ${
                    c.partner.id === userId ? "bg-[var(--accent)]/15 text-white" : "text-[var(--muted)] hover:text-white hover:bg-white/5"
                  }`}>
                  <div className="w-8 h-8 rounded-full gradient-rose flex items-center justify-center text-[11px] text-white font-display">
                    {c.partner.display_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <span className="truncate">{c.partner.display_name}</span>
                  <Lock size={10} className="ms-auto text-[var(--accent)]" />
                </button>
              ))}
              {dmConversations.length === 0 && (
                <div className="text-xs text-[var(--muted)] px-3 py-6 text-center">لا توجد محادثات بعد.<br/>اضغط + لتبدأ واحدة.</div>
              )}
            </>
          )}
        </div>

        <div className="p-3 border-t border-[var(--border)] flex items-center gap-3">
          <div className="w-9 h-9 rounded-full gradient-rose flex items-center justify-center text-xs font-display text-white">
            {user?.display_name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs truncate flex items-center gap-1.5">
              {user?.display_name}
              {user?.is_guest && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)]">ضيف</span>}
            </div>
            <div className="font-mono-key text-[9px] text-[var(--muted-soft)] truncate">{fingerp}</div>
          </div>
        </div>
      </aside>

      {/* Chat */}
      <main dir="rtl" className="flex-1 flex flex-col min-w-0 bg-[var(--bg)]">
        <header className="h-16 border-b border-[var(--border)] px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {activeChannel ? (
              <>
                <Hash size={18} className="text-[var(--muted)]" />
                <span className="font-display">{activeChannel.name}</span>
                <span className="font-mono-key text-[10px] text-[var(--muted-soft)] ms-2">SERVER-VISIBLE</span>
              </>
            ) : dmPartner ? (
              <>
                <div className="w-9 h-9 rounded-full gradient-rose flex items-center justify-center text-xs text-white font-display">
                  {dmPartner.display_name?.[0]?.toUpperCase()}
                </div>
                <span className="font-display">{dmPartner.display_name}</span>
                <div className="flex items-center gap-1 ms-2 px-2.5 py-1 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                  <Lock size={10} className="text-[var(--accent)]" />
                  <span className="font-mono-key text-[10px] text-[var(--accent)]">E2EE</span>
                </div>
              </>
            ) : (
              <span className="text-sm text-[var(--muted)]">اختر قناة أو محادثة خاصة</span>
            )}
          </div>
          {dmPartner && (
            <div className="flex items-center gap-2">
              <button data-testid="call-audio-btn" onClick={() => setCallPartner(dmPartner)}
                title="اتصال صوتي" className="w-10 h-10 rounded-full bg-[var(--surface)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)] flex items-center justify-center transition">
                <Phone size={15} />
              </button>
              <button data-testid="call-video-btn" onClick={() => setCallPartner(dmPartner)}
                title="اتصال فيديو" className="w-10 h-10 rounded-full bg-[var(--surface)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)] flex items-center justify-center transition">
                <Video size={15} />
              </button>
            </div>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map((m) => {
            const isMe = m.sender_id === user.id;
            const senderName = m.sender?.display_name || (isMe ? user.display_name : dmPartner?.display_name || "غير معروف");
            const text = m.plaintext !== undefined ? m.plaintext : m.content;
            const cleanText = text?.split("|attachment:")[0] || "";
            const attachId = m.attachment_id;
            const isAudio = attachId && (cleanText.includes("🎤") || cleanText.includes("صوتية"));
            return (
              <div key={m.id} data-testid={`message-${m.id}`} className="animate-chat-in">
                <div className="flex items-baseline gap-2 mb-1">
                  <div className={`w-7 h-7 rounded-full gradient-rose flex items-center justify-center text-[10px] text-white font-display`}>
                    {senderName?.[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{senderName}</span>
                  <span className="font-mono-key text-[10px] text-[var(--muted-soft)]">
                    {new Date(m.created_at).toLocaleString("ar")}
                  </span>
                </div>
                <div className={`inline-block px-4 py-2.5 text-sm leading-relaxed max-w-2xl rounded-2xl ms-9 ${
                  isMe ? "gradient-rose text-white" : "bg-[var(--surface)] text-[var(--text)]"
                }`}>
                  {isAudio ? (
                    <div className="flex items-center gap-2">
                      <span>🎤</span>
                      <audio controls src={`${BASE}/api/files/${attachId}`} className="h-8 max-w-xs" />
                    </div>
                  ) : (
                    <MessageContent text={cleanText} />
                  )}
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (channelId || userId) && (
            <div className="text-center text-[var(--muted)] text-sm mt-20">
              <Heart className="mx-auto text-[var(--accent)]/40 mb-3" size={32} />
              لا توجد رسائل بعد · ابدأ محادثة جميلة
            </div>
          )}
        </div>

        {(channelId || userId) && (
          <form onSubmit={send} className="p-4 border-t border-[var(--border)] flex items-center gap-2 shrink-0 relative">
            <EmojiButton onPick={(p) => insertAtCursor(p.value)} />
            <VoiceRecorder onSent={sendVoiceMsg} isDM={!!userId} />
            <input ref={inputRef} data-testid="message-input" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={userId ? "رسالة مشفّرة..." : `أرسل في #${activeChannel?.name || ""}`}
              className="flex-1 input-soft px-5 py-3 text-sm" />
            <button data-testid="send-btn" type="submit"
              className="btn-rose px-5 py-3 flex items-center justify-center disabled:opacity-50">
              <Send size={14} className="rotate-180" />
            </button>
          </form>
        )}
      </main>

      {/* Members */}
      {activeServer && (
        <aside dir="rtl" className="w-[240px] bg-[var(--bg-soft)] border-l border-[var(--border)] p-4 shrink-0 hidden lg:block">
          <div className="label-soft mb-4">الأعضاء · {members.length}</div>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition group">
                <div className="w-8 h-8 rounded-full gradient-rose flex items-center justify-center text-[10px] text-white font-display">
                  {m.display_name?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs truncate">{m.display_name}</div>
                  <div className="font-mono-key text-[9px] text-[var(--muted-soft)] truncate">@{m.username}</div>
                </div>
                {m.id !== user.id && (
                  <button onClick={() => nav(`/app/dm/${m.id}`)} data-testid={`dm-member-${m.id}`}
                    className="text-[var(--muted)] hover:text-[var(--accent)] opacity-0 group-hover:opacity-100 transition">
                    <MessageCircle size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}

      {showServerModal && <ServerModal onClose={() => setShowServerModal(false)} onCreate={createServer} onJoin={joinServer} />}
      {showChannelModal && <ChannelModal onClose={() => setShowChannelModal(false)} onCreate={createChannel} />}
      {showDmSearch && <DmSearchModal onClose={() => setShowDmSearch(false)} onPick={(u) => { nav(`/app/dm/${u.id}`); setShowDmSearch(false); }} />}
      {showEmojiManager && activeServer && (
        <EmojiManagerModal serverId={activeServer.id} serverName={activeServer.name}
          onClose={() => { setShowEmojiManager(false); refreshEmojiCache(); }} />
      )}
      {callPartner && (
        <VoiceCall partner={callPartner} me={user}
          incomingCallId={incomingCall && callPartner.id === incomingCall.partner.id ? incomingCall.callId : null}
          incomingOffer={incomingCall && callPartner.id === incomingCall.partner.id ? incomingCall.offer : null}
          onClose={() => { setCallPartner(null); setIncomingCall(null); }} />
      )}
      {incomingCall && !callPartner && (
        <IncomingCallToast call={incomingCall}
          onAccept={() => { setCallPartner(incomingCall.partner); }}
          onReject={() => setIncomingCall(null)} />
      )}
    </div>
  );
}

function ModalShell({ title, children, onClose, wide = false }) {
  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xl flex items-center justify-center p-6">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} glass-card overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <span className="font-display">{title}</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center text-[var(--muted)] hover:text-white" data-testid="modal-close">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ServerModal({ onClose, onCreate, onJoin }) {
  const [mode, setMode] = useState("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  return (
    <ModalShell title="السيرفر" onClose={onClose}>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setMode("create")} data-testid="tab-create"
          className={`px-4 py-2 rounded-full text-xs transition ${mode === "create" ? "gradient-rose text-white" : "btn-soft"}`}>إنشاء</button>
        <button onClick={() => setMode("join")} data-testid="tab-join"
          className={`px-4 py-2 rounded-full text-xs transition ${mode === "join" ? "gradient-rose text-white" : "btn-soft"}`}>انضمام</button>
      </div>
      {mode === "create" ? (
        <form onSubmit={(e) => { e.preventDefault(); onCreate(name); }} className="space-y-4">
          <input data-testid="server-name-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="اسم السيرفر"
            className="w-full input-soft px-4 py-3 text-sm" />
          <button data-testid="server-create-submit" className="btn-rose w-full py-3 text-sm">إنشاء</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onJoin(code); }} className="space-y-4">
          <input data-testid="server-invite-input" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="كود الدعوة"
            dir="ltr" className="w-full input-soft px-4 py-3 text-sm font-mono-key" />
          <button data-testid="server-join-submit" className="btn-rose w-full py-3 text-sm">انضمام</button>
        </form>
      )}
    </ModalShell>
  );
}

function ChannelModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  return (
    <ModalShell title="قناة جديدة" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onCreate(name); }} className="space-y-4">
        <input data-testid="channel-name-input" value={name}
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
          required placeholder="channel-name" dir="ltr"
          className="w-full input-soft px-4 py-3 text-sm font-mono-key" />
        <button data-testid="channel-create-submit" className="btn-rose w-full py-3 text-sm">إنشاء قناة</button>
      </form>
    </ModalShell>
  );
}

function DmSearchModal({ onClose, onPick }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (!q) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`); setResults(data.users); } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <ModalShell title="رسالة خاصة جديدة" onClose={onClose}>
      <div className="flex items-center input-soft px-4 py-3">
        <Search size={14} className="text-[var(--muted)] me-2" />
        <input data-testid="dm-search-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم المستخدم..."
          className="flex-1 bg-transparent text-sm focus:outline-none" />
      </div>
      <div className="mt-4 space-y-1 max-h-80 overflow-y-auto">
        {results.map((u) => (
          <button key={u.id} data-testid={`dm-pick-${u.id}`} onClick={() => onPick(u)}
            className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-colors text-right">
            <div className="w-9 h-9 rounded-full gradient-rose flex items-center justify-center text-xs text-white font-display">
              {u.display_name?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm truncate">{u.display_name}</div>
              <div className="font-mono-key text-[10px] text-[var(--muted-soft)] truncate">@{u.username}</div>
            </div>
          </button>
        ))}
        {q && results.length === 0 && <div className="text-xs text-[var(--muted)] p-3">لا يوجد مستخدمون</div>}
      </div>
    </ModalShell>
  );
}

function EmojiManagerModal({ serverId, serverName, onClose }) {
  const [emojis, setEmojis] = useState([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await api.get(`/servers/${serverId}/emojis`);
    setEmojis(data.emojis);
  };
  useEffect(() => { load(); }, [serverId]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file || !name) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/servers/${serverId}/emojis?name=${encodeURIComponent(name)}`, fd);
      toast.success("تمت الإضافة");
      setName(""); setFile(null);
      await load();
      refreshEmojiCache();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };
  const del = async (id) => {
    if (!window.confirm("حذف هذا الإيموجي؟")) return;
    try {
      await api.delete(`/servers/${serverId}/emojis/${id}`);
      await load(); refreshEmojiCache();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <ModalShell wide title={`إيموجيات: ${serverName}`} onClose={onClose}>
      <form onSubmit={upload} className="bg-[var(--surface)] rounded-2xl p-4 mb-5 space-y-3">
        <div className="label-soft">إضافة إيموجي جديد</div>
        <div className="grid grid-cols-[1fr,auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] text-[var(--muted)] mb-1">الاسم (للاستدعاء :name:)</label>
            <input data-testid="emoji-name-input" value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              required maxLength={32} dir="ltr" placeholder="party_blob"
              className="w-full input-soft px-3 py-2 text-sm font-mono-key" />
          </div>
          <div>
            <label className="block text-[10px] text-[var(--muted)] mb-1">الصورة (≤ ٥١٢KB)</label>
            <label className="btn-soft px-4 py-2 text-xs cursor-pointer flex items-center gap-2">
              <ImagePlus size={14} />
              {file ? file.name.slice(0, 20) : "اختر..."}
              <input type="file" accept="image/png,image/gif,image/webp,image/jpeg" hidden
                data-testid="emoji-file-input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
        <button data-testid="emoji-upload-submit" type="submit" disabled={uploading || !file || !name}
          className="btn-rose px-5 py-2 text-sm disabled:opacity-50">
          {uploading ? "جاري الرفع..." : "إضافة"}
        </button>
      </form>
      <div>
        <div className="label-soft mb-3">الإيموجيات الحالية ({emojis.length})</div>
        {emojis.length === 0 ? (
          <div className="text-xs text-[var(--muted)] p-4 text-center">لا توجد إيموجيات بعد</div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-80 overflow-y-auto">
            {emojis.map((e) => (
              <div key={e.id} className="bg-[var(--surface)] rounded-2xl p-3 group flex flex-col items-center gap-1 relative">
                <img src={`${BASE}/api/emojis/${e.id}/image`} alt={e.name} className="w-10 h-10 object-contain" />
                <span className="text-[10px] font-mono-key text-[var(--muted)] truncate w-full text-center">:{e.name}:</span>
                <button onClick={() => del(e.id)} data-testid={`del-emoji-${e.id}`}
                  className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 text-[var(--error)] hover:text-white w-5 h-5 rounded-full bg-black/40 flex items-center justify-center">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function IncomingCallToast({ call, onAccept, onReject }) {
  return (
    <div dir="rtl" className="fixed bottom-6 right-6 z-50 glass-card p-4 max-w-sm flex items-center gap-4 animate-chat-in">
      <div className="w-12 h-12 rounded-full gradient-rose flex items-center justify-center text-white font-display heart-pulse">
        {call.partner.display_name?.[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{call.partner.display_name}</div>
        <div className="text-xs label-soft">مكالمة واردة</div>
      </div>
      <button data-testid="incoming-reject" onClick={onReject}
        className="w-10 h-10 rounded-full bg-[var(--error)]/20 text-[var(--error)] flex items-center justify-center hover:bg-[var(--error)]/40">
        <X size={14} />
      </button>
      <button data-testid="incoming-accept" onClick={onAccept}
        className="w-10 h-10 rounded-full gradient-rose text-white flex items-center justify-center heart-pulse">
        <Phone size={14} />
      </button>
    </div>
  );
}

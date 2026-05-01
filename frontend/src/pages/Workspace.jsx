import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api, { formatApiError } from "../lib/api";
import { encryptForPublicKey, decryptWithPrivateKey, fingerprint } from "../lib/crypto";
import { EmojiButton } from "../components/EmojiPicker";
import MessageContent, { refreshEmojiCache } from "../components/MessageContent";
import {
  Shield, Plus, Hash, Settings as SettingsIcon, LogOut, Search, Send,
  Lock, MessageCircle, Copy, X, Smile, Trash2, ImagePlus, ArrowRight,
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
        await api.post("/dms", {
          recipient_id: dmPartner.id,
          sender_ciphertext,
          recipient_ciphertext,
        });
      }
      setInput("");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const insertAtCursor = (text) => {
    const el = inputRef.current;
    if (!el) { setInput(input + text); return; }
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    const next = input.slice(0, start) + text + input.slice(end);
    setInput(next);
    setTimeout(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    }, 0);
  };

  const onPickEmoji = (p) => insertAtCursor(p.value);

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
    <div className="h-screen w-screen bg-[#0A0A0A] text-white flex overflow-hidden">
      {/* Servers (RTL: visually on right) */}
      <aside className="w-[72px] border-l border-white/10 flex flex-col items-center py-4 gap-3 shrink-0">
        <Link to="/app" data-testid="home-btn" className="w-10 h-10 border border-[#00FF66] flex items-center justify-center hover:bg-[#00FF66]/10 transition-colors">
          <Shield size={16} className="text-[#00FF66]" />
        </Link>
        <div className="w-8 h-px bg-white/10" />
        {servers.map((s) => (
          <button key={s.id} data-testid={`server-${s.id}`} onClick={() => nav(`/app/${s.id}`)}
            className={`w-10 h-10 flex items-center justify-center border font-display text-sm transition-all ${
              s.id === serverId ? "border-[#00FF66] bg-[#00FF66]/10 text-[#00FF66]" : "border-white/10 hover:border-white/40"
            }`} title={s.name}>
            {s.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <button data-testid="add-server-btn" onClick={() => setShowServerModal(true)}
          className="w-10 h-10 border border-dashed border-white/20 hover:border-[#00FF66] hover:text-[#00FF66] flex items-center justify-center transition-colors">
          <Plus size={16} />
        </button>
        <div className="mt-auto flex flex-col gap-2">
          <Link to="/settings" data-testid="settings-btn" className="w-10 h-10 border border-white/10 hover:border-white/40 flex items-center justify-center transition-colors">
            <SettingsIcon size={14} />
          </Link>
          <button data-testid="logout-btn" onClick={logout}
            className="w-10 h-10 border border-white/10 hover:border-[#FF3333] hover:text-[#FF3333] flex items-center justify-center transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* Channels/DMs */}
      <aside className="w-[260px] border-l border-white/10 flex flex-col shrink-0">
        <div className="p-4 border-b border-white/10 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="label-ar mb-1">{activeServer ? "السيرفر" : "الرسائل المباشرة"}</div>
            <div className="font-display text-sm truncate">{activeServer?.name || "DMs"}</div>
            {activeServer && (
              <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-500">
                <Copy size={10} className="cursor-pointer hover:text-[#00FF66]"
                  onClick={() => { navigator.clipboard.writeText(activeServer.invite_code); toast.success("تم نسخ الدعوة"); }} />
                <span className="font-mono-key">دعوة: {activeServer.invite_code}</span>
              </div>
            )}
          </div>
          {activeServer && (
            <button data-testid="manage-emojis-btn" onClick={() => setShowEmojiManager(true)}
              title="إدارة الإيموجي"
              className="text-gray-500 hover:text-[#00FF66] transition-colors p-1">
              <Smile size={16} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {activeServer ? (
            <>
              <div className="flex items-center justify-between px-2 py-2">
                <span className="label-ar">القنوات</span>
                <button data-testid="add-channel-btn" onClick={() => setShowChannelModal(true)} className="text-gray-500 hover:text-[#00FF66]">
                  <Plus size={12} />
                </button>
              </div>
              {channels.map((c) => (
                <button key={c.id} data-testid={`channel-${c.id}`} onClick={() => nav(`/app/${serverId}/${c.id}`)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm transition-colors ${
                    c.id === channelId ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}>
                  <Hash size={14} /> <span className="truncate">{c.name}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-2 py-2">
                <span className="label-ar">مباشر · مشفّر</span>
                <button data-testid="new-dm-btn" onClick={() => setShowDmSearch(true)} className="text-gray-500 hover:text-[#00FF66]">
                  <Plus size={12} />
                </button>
              </div>
              {dmConversations.map((c) => (
                <button key={c.partner.id} data-testid={`dm-${c.partner.id}`} onClick={() => nav(`/app/dm/${c.partner.id}`)}
                  className={`w-full flex items-center gap-2 px-2 py-2 text-sm transition-colors ${
                    c.partner.id === userId ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}>
                  <div className="w-7 h-7 border border-white/10 flex items-center justify-center text-[10px] font-display">
                    {c.partner.display_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <span className="truncate">{c.partner.display_name}</span>
                  <Lock size={10} className="ms-auto text-[#00FF66]" />
                </button>
              ))}
              {dmConversations.length === 0 && (
                <div className="text-xs text-gray-600 px-2 py-4">لا توجد محادثات. اضغط + لتبدأ واحدة.</div>
              )}
            </>
          )}
        </div>

        <div className="p-3 border-t border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 border border-[#00FF66]/50 flex items-center justify-center text-[10px] font-display">
            {user?.display_name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs truncate flex items-center gap-1">
              {user?.display_name}
              {user?.is_guest && <span className="text-[9px] px-1 border border-[#00FF66]/30 text-[#00FF66]">ضيف</span>}
            </div>
            <div className="font-mono-key text-[9px] text-gray-500 truncate">{fingerp}</div>
          </div>
        </div>
      </aside>

      {/* Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-white/10 px-6 flex items-center gap-3 shrink-0">
          {activeChannel ? (
            <>
              <Hash size={16} className="text-gray-500" />
              <span className="font-display">{activeChannel.name}</span>
              <span className="font-mono-key text-[10px] text-gray-600 ms-2">SERVER-VISIBLE</span>
            </>
          ) : dmPartner ? (
            <>
              <MessageCircle size={16} className="text-gray-500" />
              <span className="font-display">{dmPartner.display_name}</span>
              <div className="flex items-center gap-1 ms-2 px-2 py-0.5 border border-[#00FF66]/30 bg-[#00FF66]/5">
                <Lock size={10} className="text-[#00FF66]" />
                <span className="font-mono-key text-[10px] text-[#00FF66]">E2EE</span>
              </div>
            </>
          ) : (
            <span className="text-sm text-gray-500">اختر قناة أو محادثة خاصة</span>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map((m) => {
            const isMe = m.sender_id === user.id;
            const senderName = m.sender?.display_name || (isMe ? user.display_name : dmPartner?.display_name || "غير معروف");
            const text = m.plaintext !== undefined ? m.plaintext : m.content;
            return (
              <div key={m.id} data-testid={`message-${m.id}`} className="animate-chat-in">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-sm font-medium">{senderName}</span>
                  <span className="font-mono-key text-[10px] text-gray-600">
                    {new Date(m.created_at).toLocaleString("ar")}
                  </span>
                </div>
                <div className={`inline-block px-3 py-2 text-sm leading-relaxed max-w-2xl ${
                  isMe ? "bg-white/10 text-white" : "border border-white/10 text-gray-200"
                }`}>
                  <MessageContent text={text} />
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (channelId || userId) && (
            <div className="text-center text-gray-600 text-xs mt-20">
              لا توجد رسائل · ابدأ المحادثة
            </div>
          )}
        </div>

        {(channelId || userId) && (
          <form onSubmit={send} className="p-4 border-t border-white/10 flex items-center gap-3 shrink-0 relative">
            <EmojiButton onPick={onPickEmoji} />
            <input ref={inputRef} data-testid="message-input" value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={userId ? "رسالة مشفّرة..." : `أرسل في #${activeChannel?.name || ""}`}
              className="flex-1 bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]" />
            <button data-testid="send-btn" type="submit" className="bg-[#00FF66] text-black px-5 py-3 hover:bg-white transition-colors">
              <Send size={14} className="rotate-180" />
            </button>
          </form>
        )}
      </main>

      {/* Members */}
      {activeServer && (
        <aside className="w-[240px] border-r border-white/10 p-4 shrink-0 hidden lg:block">
          <div className="label-ar mb-4">الأعضاء · {members.length}</div>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <div className="w-8 h-8 border border-white/10 flex items-center justify-center text-[10px] font-display">
                  {m.display_name?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs truncate">{m.display_name}</div>
                  <div className="font-mono-key text-[9px] text-gray-500 truncate">@{m.username}</div>
                </div>
                {m.id !== user.id && (
                  <button onClick={() => nav(`/app/dm/${m.id}`)} data-testid={`dm-member-${m.id}`} className="text-gray-500 hover:text-[#00FF66]">
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
    </div>
  );
}

function ModalShell({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl flex items-center justify-center p-6">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} border border-white/10 bg-[#0A0A0A]`}>
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <span className="font-display text-sm">{title}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white" data-testid="modal-close"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
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
        <button onClick={() => setMode("create")}
          className={`px-3 py-1.5 border text-xs ${mode === "create" ? "border-[#00FF66] text-[#00FF66]" : "border-white/10 text-gray-500"}`}
          data-testid="tab-create">إنشاء</button>
        <button onClick={() => setMode("join")}
          className={`px-3 py-1.5 border text-xs ${mode === "join" ? "border-[#00FF66] text-[#00FF66]" : "border-white/10 text-gray-500"}`}
          data-testid="tab-join">انضمام</button>
      </div>
      {mode === "create" ? (
        <form onSubmit={(e) => { e.preventDefault(); onCreate(name); }} className="space-y-4">
          <input data-testid="server-name-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="اسم السيرفر"
            className="w-full bg-transparent border border-white/20 px-3 py-2.5 text-sm focus:outline-none focus:border-[#00FF66]" />
          <button data-testid="server-create-submit" className="w-full bg-white text-black py-2.5 text-sm hover:bg-[#00FF66]">إنشاء</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onJoin(code); }} className="space-y-4">
          <input data-testid="server-invite-input" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="كود الدعوة"
            dir="ltr" className="w-full bg-transparent border border-white/20 px-3 py-2.5 text-sm font-mono-key focus:outline-none focus:border-[#00FF66]" />
          <button data-testid="server-join-submit" className="w-full bg-white text-black py-2.5 text-sm hover:bg-[#00FF66]">انضمام</button>
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
          className="w-full bg-transparent border border-white/20 px-3 py-2.5 text-sm font-mono-key focus:outline-none focus:border-[#00FF66]" />
        <button data-testid="channel-create-submit" className="w-full bg-white text-black py-2.5 text-sm hover:bg-[#00FF66]">إنشاء قناة</button>
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
      <div className="flex items-center border border-white/20 px-3 py-2.5 focus-within:border-[#00FF66]">
        <Search size={14} className="text-gray-500 me-2" />
        <input data-testid="dm-search-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم المستخدم أو البريد..."
          className="flex-1 bg-transparent text-sm focus:outline-none" />
      </div>
      <div className="mt-4 space-y-1 max-h-80 overflow-y-auto">
        {results.map((u) => (
          <button key={u.id} data-testid={`dm-pick-${u.id}`} onClick={() => onPick(u)}
            className="w-full flex items-center gap-3 p-2 text-right hover:bg-white/5 transition-colors">
            <div className="w-8 h-8 border border-white/10 flex items-center justify-center text-[10px] font-display">
              {u.display_name?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm truncate">{u.display_name}</div>
              <div className="font-mono-key text-[10px] text-gray-500 truncate">@{u.username}</div>
            </div>
          </button>
        ))}
        {q && results.length === 0 && <div className="text-xs text-gray-600 p-2">لا يوجد مستخدمون</div>}
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
      await load();
      refreshEmojiCache();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <ModalShell wide title={`إيموجيات: ${serverName}`} onClose={onClose}>
      <form onSubmit={upload} className="border border-white/10 p-4 mb-5 space-y-3">
        <div className="label-ar">إضافة إيموجي جديد</div>
        <div className="grid grid-cols-[1fr,auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">الاسم (للاستدعاء بصيغة :name:)</label>
            <input data-testid="emoji-name-input" value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              required maxLength={32} dir="ltr"
              placeholder="party_blob"
              className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm font-mono-key focus:outline-none focus:border-[#00FF66]" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">الصورة (≤ ٥١٢KB)</label>
            <label className="border border-white/20 px-3 py-2 text-xs cursor-pointer hover:border-[#00FF66] flex items-center gap-2">
              <ImagePlus size={14} />
              {file ? file.name.slice(0, 20) : "اختر..."}
              <input type="file" accept="image/png,image/gif,image/webp,image/jpeg" hidden
                data-testid="emoji-file-input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
        <button data-testid="emoji-upload-submit" type="submit" disabled={uploading || !file || !name}
          className="bg-[#00FF66] text-black px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-50">
          {uploading ? "جاري الرفع..." : "إضافة"}
        </button>
      </form>

      <div>
        <div className="label-ar mb-3">الإيموجيات الحالية ({emojis.length})</div>
        {emojis.length === 0 ? (
          <div className="text-xs text-gray-600 p-4 text-center">لا توجد إيموجيات بعد</div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-80 overflow-y-auto">
            {emojis.map((e) => (
              <div key={e.id} className="border border-white/10 p-2 group flex flex-col items-center gap-1 relative">
                <img src={`${BASE}/api/emojis/${e.id}/image`} alt={e.name} className="w-10 h-10 object-contain" />
                <span className="text-[10px] font-mono-key text-gray-400 truncate w-full text-center">:{e.name}:</span>
                <button onClick={() => del(e.id)} data-testid={`del-emoji-${e.id}`}
                  className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 text-[#FF3333] hover:text-white">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

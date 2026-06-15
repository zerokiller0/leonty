import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api, { formatApiError } from "../lib/api";
import { fingerprint } from "../lib/crypto";
import { EmojiButton } from "../components/EmojiPicker";
import MessageContent, { refreshEmojiCache, classifyMessage, useEmojiMap } from "../components/MessageContent";
import VoiceRecorder from "../components/VoiceRecorder";
import VoiceCall from "../components/VoiceCall";
import WatchTogether from "../components/WatchTogether";
import {
  Heart, Plus, Hash, Settings as SettingsIcon, LogOut, Search, Send,
  Lock, MessageCircle, Copy, X, Smile, Trash2, ImagePlus, Phone, Video,
  Film, Sticker as StickerIcon, Calendar, Paperclip, Download, FileIcon, Image as ImageIcon,
  UserPlus, Check, UserX, Pencil,
} from "lucide-react";
import { toast } from "sonner";

const BASE = process.env.REACT_APP_BACKEND_URL;

export default function Workspace() {
  const { serverId, channelId, userId } = useParams();
  const nav = useNavigate();
  const { user, logout } = useAuth();
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
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [reactionPickerId, setReactionPickerId] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [callPartner, setCallPartner] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [watchPartner, setWatchPartner] = useState(null);
  const [incomingWatch, setIncomingWatch] = useState(null);
  const [fingerp, setFingerp] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const emojiMap = useEmojiMap();

  const loadSidebar = async () => {
    const [s, d, fr] = await Promise.all([
      api.get("/servers"), api.get("/dms"), api.get("/friends/requests").catch(() => ({ data: { incoming: [] } })),
    ]);
    setServers(s.data.servers);
    setDmConversations(d.data.conversations);
    setFriendRequestCount(fr.data.incoming?.length || 0);
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
        setActiveServer(data.server); setMembers(data.members);
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
    (async () => { const { data } = await api.get(`/users/${userId}`); setDmPartner(data.user); })();
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
          if (!cancelled) setMessages(data.messages);
        } else { setMessages([]); }
      } catch {}
    };
    load();
    const t = setInterval(load, 3000);
    // also refresh sidebar to update unread counts
    const t2 = setInterval(loadSidebar, 4000);
    return () => { cancelled = true; clearInterval(t); clearInterval(t2); };
  }, [channelId, userId, user?.id]);

  // Poll for incoming calls + watch invites
  useEffect(() => {
    if (callPartner || watchPartner) return;
    const poll = async () => {
      try {
        const { data } = await api.get("/calls/signals");
        const offer = data.signals.find(s => s.type === "offer");
        if (offer) setIncomingCall({ partner: offer.from_user, callId: offer.call_id, offer: offer.payload });
        const watchInvite = data.signals.find(s => s.type === "watch_invite");
        if (watchInvite) setIncomingWatch({ partner: watchInvite.from_user, ...watchInvite.payload });
      } catch {}
    };
    const t = setInterval(poll, 2500); poll();
    return () => clearInterval(t);
  }, [callPartner, watchPartner]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    try {
      if (channelId) {
        await api.post(`/channels/${channelId}/messages`, { content: input });
      } else if (userId && dmPartner) {
        await api.post("/dms", { recipient_id: dmPartner.id, content: input });
      }
      setInput("");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const sendVoiceMsg = async (placeholder, fileId) => {
    try {
      if (channelId) {
        await api.post(`/channels/${channelId}/messages`, { content: placeholder, attachment_id: fileId });
      } else if (userId && dmPartner) {
        await api.post("/dms", { recipient_id: dmPartner.id, content: placeholder, attachment_id: fileId });
      }
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const sendAttachment = async (file) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast.error("الحد الأقصى ١٠٠ ميجا"); return; }
    const toastId = toast.loading(`جاري رفع ${file.name}...`);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/files/upload", fd);
      const fid = data.file.id;
      let prefix;
      if (file.type.startsWith("image/")) prefix = "🖼️ صورة";
      else if (file.type.startsWith("video/")) prefix = "🎬 فيديو";
      else if (file.type.startsWith("audio/")) prefix = "🎵 صوت";
      else prefix = `📎 ${file.name}`;
      const content = `${prefix}|attachment:${fid}|type:${file.type || "application/octet-stream"}|name:${file.name}`;
      if (channelId) {
        await api.post(`/channels/${channelId}/messages`, { content, attachment_id: fid });
      } else if (userId && dmPartner) {
        await api.post("/dms", { recipient_id: dmPartner.id, content, attachment_id: fid });
      }
      toast.success("تم الإرسال", { id: toastId });
    } catch (e) { toast.error(formatApiError(e), { id: toastId }); }
  };

  const sendSticker = async (sticker) => {
    const text = `:${sticker.name}:`;
    try {
      if (channelId) {
        await api.post(`/channels/${channelId}/messages`, { content: text });
      } else if (userId && dmPartner) {
        await api.post("/dms", { recipient_id: dmPartner.id, content: text });
      }
      setShowStickerPicker(false);
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

  // ---- DM message actions: edit, delete, react ----
  const startEditMsg = (m) => {
    setEditingMsgId(m.id);
    setEditingText(m.content || "");
    setReactionPickerId(null);
  };
  const cancelEditMsg = () => { setEditingMsgId(null); setEditingText(""); };
  const saveEditMsg = async () => {
    const text = editingText.trim();
    if (!text) { toast.error("لا يمكن أن تكون فارغة"); return; }
    try {
      const { data } = await api.patch(`/dms/${editingMsgId}`, { content: text });
      setMessages((prev) => prev.map((x) => x.id === editingMsgId ? { ...x, ...data.message } : x));
      cancelEditMsg();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const deleteMsg = async (mid) => {
    if (!window.confirm("حذف الرسالة؟")) return;
    try {
      await api.delete(`/dms/${mid}`);
      setMessages((prev) => prev.map((x) => x.id === mid
        ? { ...x, deleted_at: new Date().toISOString(), content: "", attachment_id: null, reactions: [] }
        : x));
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const toggleReaction = async (mid, emoji) => {
    setReactionPickerId(null);
    try {
      const { data } = await api.post(`/dms/${mid}/reactions`, { emoji });
      setMessages((prev) => prev.map((x) => x.id === mid ? { ...x, reactions: data.reactions } : x));
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const createServer = async (name) => {
    try {
      const { data } = await api.post("/servers", { name });
      await loadSidebar(); nav(`/app/${data.server.id}`); setShowServerModal(false);
      toast.success("تم إنشاء السيرفر");
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const joinServer = async (code) => {
    try {
      const { data } = await api.post("/servers/join", { invite_code: code });
      await loadSidebar(); nav(`/app/${data.server.id}`); setShowServerModal(false);
      toast.success("تم الانضمام"); refreshEmojiCache();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const createChannel = async (name) => {
    try {
      const { data } = await api.post(`/servers/${serverId}/channels`, { name });
      setChannels([...channels, data.channel]);
      nav(`/app/${serverId}/${data.channel.id}`); setShowChannelModal(false);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const activeChannel = channels.find((c) => c.id === channelId);

  return (
    <div dir="ltr" className="h-screen w-screen flex overflow-hidden text-[var(--text)]">
      {/* Servers sidebar (LEFT) */}
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
          <button data-testid="add-server-btn" onClick={() => setShowServerModal(true)} title="إنشاء أو انضمام"
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
            <button data-testid="manage-emojis-btn" onClick={() => setShowEmojiManager(true)} title="إدارة الإيموجي والستيكر"
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
                <span className="label-soft">الأصدقاء والرسائل</span>
                <div className="flex items-center gap-1">
                  <button data-testid="open-friends-btn" onClick={() => setShowFriendsModal(true)}
                    title="الأصدقاء" className="relative text-[var(--muted)] hover:text-[var(--accent)] w-6 h-6 rounded-full hover:bg-white/5 flex items-center justify-center">
                    <UserPlus size={12} />
                    {friendRequestCount > 0 && (
                      <span className="absolute -top-1 -left-1 min-w-[14px] h-3.5 rounded-full bg-[var(--error)] text-white text-[9px] font-bold flex items-center justify-center px-1">
                        {friendRequestCount > 9 ? "9+" : friendRequestCount}
                      </span>
                    )}
                  </button>
                  <button data-testid="new-dm-btn" onClick={() => setShowDmSearch(true)}
                    className="text-[var(--muted)] hover:text-[var(--accent)] w-6 h-6 rounded-full hover:bg-white/5 flex items-center justify-center">
                    <Plus size={12} />
                  </button>
                </div>
              </div>
              {dmConversations.map((c) => (
                <button key={c.partner.id} data-testid={`dm-${c.partner.id}`} onClick={() => nav(`/app/dm/${c.partner.id}`)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-2xl transition-colors ${
                    c.partner.id === userId
                      ? "bg-[var(--accent)]/15 text-white"
                      : c.unread_count > 0
                        ? "text-white font-medium hover:bg-white/5"
                        : "text-[var(--muted)] hover:text-white hover:bg-white/5"
                  }`}>
                  <Avatar user={c.partner} size={32} />
                  <span className="truncate">{c.partner.display_name}</span>
                  {c.unread_count > 0 ? (
                    <span data-testid={`unread-${c.partner.id}`} className="ms-auto px-1.5 min-w-[20px] h-5 rounded-full bg-[var(--error)] text-white text-[10px] font-bold flex items-center justify-center">
                      {c.unread_count > 9 ? "9+" : c.unread_count}
                    </span>
                  ) : null}
                </button>
              ))}
              {dmConversations.length === 0 && (
                <div className="text-xs text-[var(--muted)] px-3 py-6 text-center">لا توجد محادثات بعد.<br/>اضغط + لتبدأ واحدة.</div>
              )}
            </>
          )}
        </div>

        <div className="p-3 border-t border-[var(--border)] flex items-center gap-3">
          <Avatar user={user} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-xs truncate flex items-center gap-1.5">
              {user?.display_name}
              {user?.is_guest && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)]">ضيف</span>}
            </div>
            <div className="text-[10px] text-[var(--muted-soft)] truncate">{user?.status || "online"}</div>
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
                <Avatar user={dmPartner} size={36} />
                <span className="font-display">{dmPartner.display_name}</span>
              </>
            ) : (
              <span className="text-sm text-[var(--muted)]">اختر قناة أو محادثة خاصة</span>
            )}
          </div>
          {dmPartner && (
            <div className="flex items-center gap-2">
              <button data-testid="watch-together-btn" onClick={() => setWatchPartner(dmPartner)}
                title="مشاهدة معاً" className="w-10 h-10 rounded-full bg-[var(--surface)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)] flex items-center justify-center transition">
                <Film size={15} />
              </button>
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
            const senderUser = m.sender || (isMe ? user : dmPartner);
            const text = m.plaintext !== undefined ? m.plaintext : m.content;
            const cleanText = text?.split("|attachment:")[0] || "";
            const attachId = m.attachment_id;
            const meta = {};
            (text || "").split("|").forEach(part => {
              const idx = part.indexOf(":");
              if (idx > 0 && ["type", "name", "attachment"].includes(part.slice(0, idx))) {
                meta[part.slice(0, idx)] = part.slice(idx + 1);
              }
            });
            const fileType = meta.type || "";
            const fileName = meta.name || "";
            const isAudio = attachId && (cleanText.includes("🎤") || fileType.startsWith("audio/"));
            const isImage = attachId && (cleanText.startsWith("🖼️") || fileType.startsWith("image/"));
            const isVideo = attachId && (cleanText.startsWith("🎬") || fileType.startsWith("video/"));
            const isFile = attachId && !isAudio && !isImage && !isVideo;
            const cls = !attachId ? classifyMessage(cleanText, emojiMap) : { kind: "text" };
            const isBig = cls.kind === "big-emoji" || cls.kind === "big-emoji-unicode" || cls.kind === "sticker";
            const fileUrl = attachId ? `${BASE}/api/files/${attachId}` : null;
            const isDeleted = !!m.deleted_at;
            const isDM = !!userId;
            const canEdit = isDM && isMe && !isDeleted && !attachId;
            const canDelete = isDM && isMe && !isDeleted;
            const canReact = isDM && !isDeleted;
            const isEditing = editingMsgId === m.id;
            // Group reactions by emoji
            const reactionGroups = {};
            (m.reactions || []).forEach((r) => {
              if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = [];
              reactionGroups[r.emoji].push(r.user_id);
            });
            return (
              <div key={m.id} data-testid={`message-${m.id}`}
                onMouseEnter={() => setHoveredMsgId(m.id)}
                onMouseLeave={() => { setHoveredMsgId((h) => h === m.id ? null : h); }}
                className="animate-chat-in flex gap-3 group relative">
                <Avatar user={senderUser} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-medium">{senderName}</span>
                    <span className="font-mono-key text-[10px] text-[var(--muted-soft)]">
                      {new Date(m.created_at).toLocaleString("ar")}
                    </span>
                    {m.edited_at && !isDeleted && (
                      <span className="text-[10px] text-[var(--muted-soft)] italic">(معدّلة)</span>
                    )}
                  </div>
                  {isDeleted ? (
                    <div className="inline-block px-4 py-2 text-xs italic rounded-2xl bg-[var(--surface)]/60 text-[var(--muted)]" data-testid={`msg-deleted-${m.id}`}>
                      تم حذف هذه الرسالة
                    </div>
                  ) : isEditing ? (
                    <div className="space-y-2 max-w-2xl">
                      <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)}
                        data-testid={`msg-edit-input-${m.id}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEditMsg(); }
                          if (e.key === "Escape") { cancelEditMsg(); }
                        }}
                        autoFocus rows={2}
                        className="w-full px-4 py-2 text-sm rounded-2xl bg-[var(--surface)] border border-[var(--accent)]/40 outline-none focus:border-[var(--accent)] resize-y" />
                      <div className="flex gap-2 text-xs">
                        <button onClick={saveEditMsg} data-testid={`msg-edit-save-${m.id}`}
                          className="btn-rose px-3 py-1.5 rounded-full">حفظ</button>
                        <button onClick={cancelEditMsg} data-testid={`msg-edit-cancel-${m.id}`}
                          className="px-3 py-1.5 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)]">إلغاء</button>
                        <span className="self-center text-[10px] text-[var(--muted-soft)]">Enter للحفظ · Esc للإلغاء</span>
                      </div>
                    </div>
                  ) : isAudio ? (
                    <div className={`inline-block px-4 py-2.5 text-sm rounded-2xl ${isMe ? "gradient-rose text-white" : "bg-[var(--surface)] text-[var(--text)]"}`}>
                      <div className="flex items-center gap-2"><span>🎤</span><audio controls src={fileUrl} className="h-8 max-w-xs" /></div>
                    </div>
                  ) : isImage ? (
                    <a href={fileUrl} target="_blank" rel="noreferrer" className="block max-w-md">
                      <img src={fileUrl} alt={fileName || "image"} className="max-h-80 rounded-2xl object-contain bg-black/20" />
                    </a>
                  ) : isVideo ? (
                    <video src={fileUrl} controls className="max-w-md max-h-96 rounded-2xl bg-black" />
                  ) : isFile ? (
                    <a href={fileUrl} download={fileName} target="_blank" rel="noreferrer"
                      className={`inline-flex items-center gap-3 px-4 py-3 rounded-2xl max-w-md ${isMe ? "gradient-rose text-white" : "bg-[var(--surface)]"} hover:opacity-90`}>
                      <FileIcon size={18} />
                      <div className="min-w-0">
                        <div className="text-sm truncate">{fileName || "ملف"}</div>
                        <div className="text-[10px] opacity-70">اضغط للتحميل</div>
                      </div>
                      <Download size={14} className="ms-auto" />
                    </a>
                  ) : isBig ? (
                    <div className="py-1">
                      {cls.kind === "big-emoji-unicode" && (<span className="text-6xl leading-none">{cls.text}</span>)}
                      {(cls.kind === "big-emoji" || cls.kind === "sticker") && cls.emoji && (
                        <img src={`${BASE}/api/emojis/${cls.emoji.id}/image`} alt={`:${cls.emoji.name}:`}
                          className={cls.kind === "sticker" ? "h-40 w-40 object-contain" : "h-20 w-20 object-contain"} />
                      )}
                    </div>
                  ) : (
                    <div className={`inline-block px-4 py-2.5 text-sm leading-relaxed max-w-2xl rounded-2xl break-words ${
                      isMe ? "gradient-rose text-white" : "bg-[var(--surface)] text-[var(--text)]"
                    }`}>
                      <MessageContent text={cleanText} />
                    </div>
                  )}

                  {/* Reactions row */}
                  {!isDeleted && Object.keys(reactionGroups).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid={`reactions-${m.id}`}>
                      {Object.entries(reactionGroups).map(([emoji, users]) => {
                        const youReacted = users.includes(user.id);
                        return (
                          <button key={emoji}
                            onClick={() => canReact && toggleReaction(m.id, emoji)}
                            data-testid={`reaction-${m.id}-${emoji}`}
                            disabled={!canReact}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors border ${
                              youReacted
                                ? "bg-[var(--accent)]/20 border-[var(--accent)]/60 text-[var(--accent)]"
                                : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)]"
                            }`}>
                            <span>{emoji}</span>
                            <span className="font-mono-key">{users.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Hover actions (DM only) */}
                {!isEditing && (canEdit || canDelete || canReact) && hoveredMsgId === m.id && (
                  <div dir="rtl" data-testid={`msg-actions-${m.id}`}
                    className="absolute -top-3 left-3 z-10 flex items-center gap-1 px-1.5 py-1 rounded-full bg-[var(--bg)] border border-[var(--border)] shadow-lg">
                    {canReact && (
                      <button onClick={(e) => { e.stopPropagation(); setReactionPickerId(reactionPickerId === m.id ? null : m.id); }}
                        data-testid={`msg-react-btn-${m.id}`}
                        title="إضافة تفاعل"
                        className="w-7 h-7 rounded-full hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] flex items-center justify-center text-[var(--muted)]">
                        <Smile size={14} />
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => startEditMsg(m)} data-testid={`msg-edit-btn-${m.id}`}
                        title="تعديل"
                        className="w-7 h-7 rounded-full hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] flex items-center justify-center text-[var(--muted)]">
                        <Pencil size={13} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => deleteMsg(m.id)} data-testid={`msg-delete-btn-${m.id}`}
                        title="حذف"
                        className="w-7 h-7 rounded-full hover:bg-[var(--error)]/15 hover:text-[var(--error)] flex items-center justify-center text-[var(--muted)]">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}

                {/* Reaction quick-picker */}
                {reactionPickerId === m.id && canReact && (
                  <div dir="rtl" data-testid={`msg-react-picker-${m.id}`}
                    className="absolute -top-12 left-3 z-20 flex items-center gap-1 px-2 py-1.5 rounded-full bg-[var(--bg)] border border-[var(--accent)]/40 shadow-xl">
                    {["❤️", "😍", "😂", "👍", "😢", "🔥"].map((emo) => (
                      <button key={emo} onClick={() => toggleReaction(m.id, emo)}
                        data-testid={`msg-react-pick-${m.id}-${emo}`}
                        className="w-8 h-8 rounded-full hover:bg-[var(--accent)]/10 hover:scale-125 transition-transform text-lg flex items-center justify-center">
                        {emo}
                      </button>
                    ))}
                    <button onClick={() => setReactionPickerId(null)}
                      className="w-7 h-7 rounded-full hover:bg-[var(--surface-hover)] text-[var(--muted)] flex items-center justify-center">
                      <X size={12} />
                    </button>
                  </div>
                )}
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
            {/* Plus menu */}
            <div className="relative">
              <button type="button" data-testid="plus-menu-btn" onClick={() => setShowPlusMenu(!showPlusMenu)}
                className="text-[var(--muted)] hover:text-[var(--accent)] p-2 transition-colors" title="ميزات">
                <Plus size={18} />
              </button>
              {showPlusMenu && (
                <div className="absolute bottom-full mb-3 right-0 w-56 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl py-2 z-50">
                  {userId && dmPartner ? (
                    <button data-testid="menu-watch" onClick={() => { setWatchPartner(dmPartner); setShowPlusMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-right">
                      <Film size={15} className="text-[var(--accent)]" />
                      <div className="min-w-0">
                        <div className="text-sm">المشاهدة معاً</div>
                        <div className="text-[10px] text-[var(--muted-soft)]">شاهدوا فيديو متزامن</div>
                      </div>
                    </button>
                  ) : (
                    <div className="px-4 py-2.5 text-xs text-[var(--muted-soft)]">المشاهدة معاً متاحة في المحادثات الخاصة فقط</div>
                  )}
                </div>
              )}
            </div>

            <EmojiButton onPick={(p) => insertAtCursor(p.value)} />
            <button type="button" data-testid="sticker-btn" onClick={() => setShowStickerPicker(true)}
              className="text-[var(--muted)] hover:text-[var(--accent)] p-2 transition-colors" title="ستيكر">
              <StickerIcon size={18} />
            </button>
            <label className="text-[var(--muted)] hover:text-[var(--accent)] p-2 transition-colors cursor-pointer" title="مرفق">
              <Paperclip size={18} />
              <input type="file" hidden data-testid="attach-file-input"
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                onChange={(e) => { sendAttachment(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
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

      {/* Right panel: Members (server) OR Profile (DM) */}
      {activeServer ? (
        <aside dir="rtl" className="w-[280px] bg-[var(--bg-soft)] border-l border-[var(--border)] p-4 shrink-0 hidden lg:block overflow-y-auto">
          <div className="label-soft mb-4">الأعضاء · {members.length}</div>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition group">
                <Avatar user={m} size={32} />
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
      ) : dmPartner ? (
        <aside dir="rtl" className="w-[320px] bg-[var(--bg-soft)] border-l border-[var(--border)] shrink-0 hidden lg:block overflow-y-auto">
          <ProfileCard user={dmPartner} />
        </aside>
      ) : null}

      {showServerModal && <ServerModal onClose={() => setShowServerModal(false)} onCreate={createServer} onJoin={joinServer} />}
      {showChannelModal && <ChannelModal onClose={() => setShowChannelModal(false)} onCreate={createChannel} />}
      {showDmSearch && <DmSearchModal onClose={() => setShowDmSearch(false)} onPick={(u) => { nav(`/app/dm/${u.id}`); setShowDmSearch(false); }} />}
      {showEmojiManager && activeServer && (
        <EmojiManagerModal serverId={activeServer.id} serverName={activeServer.name}
          onClose={() => { setShowEmojiManager(false); refreshEmojiCache(); }} />
      )}
      {showStickerPicker && (
        <StickerPickerModal onClose={() => setShowStickerPicker(false)} onPick={sendSticker} />
      )}
      {showFriendsModal && (
        <FriendsModal me={user} onClose={() => { setShowFriendsModal(false); loadSidebar(); }}
          onDM={(u) => { nav(`/app/dm/${u.id}`); setShowFriendsModal(false); }} />
      )}
      {callPartner && (
        <VoiceCall partner={callPartner} me={user}
          incomingCallId={incomingCall && callPartner.id === incomingCall.partner.id ? incomingCall.callId : null}
          incomingOffer={incomingCall && callPartner.id === incomingCall.partner.id ? incomingCall.offer : null}
          onClose={() => { setCallPartner(null); setIncomingCall(null); }} />
      )}
      {incomingCall && !callPartner && (
        <IncomingToast call={incomingCall} onAccept={() => setCallPartner(incomingCall.partner)}
          onReject={() => setIncomingCall(null)} icon={<Phone size={14} />} label="مكالمة واردة" />
      )}
      {watchPartner && (
        <WatchTogether partner={watchPartner} me={user}
          incomingInvite={incomingWatch && watchPartner.id === incomingWatch.partner.id ? incomingWatch : null}
          onClose={() => { setWatchPartner(null); setIncomingWatch(null); }} />
      )}
      {incomingWatch && !watchPartner && (
        <IncomingToast call={{ partner: incomingWatch.partner }}
          onAccept={() => setWatchPartner(incomingWatch.partner)}
          onReject={() => setIncomingWatch(null)} icon={<Film size={14} />} label="دعوة مشاهدة" />
      )}
    </div>
  );
}

function Avatar({ user, size = 36 }) {
  const cls = `rounded-full overflow-hidden flex items-center justify-center text-white font-display shrink-0`;
  const style = { width: size, height: size, fontSize: Math.max(10, Math.floor(size / 2.6)) };
  if (user?.avatar_url) {
    return <div className={cls} style={style}><img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" /></div>;
  }
  return <div className={`${cls} gradient-rose`} style={style}>{user?.display_name?.[0]?.toUpperCase() || "?"}</div>;
}

function ProfileCard({ user }) {
  return (
    <div className="flex flex-col">
      <div className="h-24 gradient-rose" />
      <div className="px-5 -mt-12">
        <div className="rounded-full border-4 border-[var(--bg-soft)] inline-block">
          <Avatar user={user} size={88} />
        </div>
        <div className="mt-3">
          <div className="font-display text-lg flex items-center gap-2">
            {user.display_name}
            {user.is_guest && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)]">ضيف</span>}
          </div>
          <div className="text-xs text-[var(--muted)] font-mono-key">@{user.username}</div>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {user.status && (
          <div>
            <div className="label-soft mb-1.5">الحالة</div>
            <div className="text-sm">{user.status}</div>
          </div>
        )}
        {user.about_me && (
          <div>
            <div className="label-soft mb-1.5">نبذة</div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{user.about_me}</div>
          </div>
        )}
        {user.public_key && (
          <div>
            <div className="label-soft mb-1.5">بصمة المفتاح</div>
            <code className="block font-mono-key text-[10px] text-[var(--accent)] break-all">{user.public_key.slice(40, 80)}</code>
          </div>
        )}
        <div className="text-[10px] text-[var(--muted-soft)]">
          عضو منذ {user.created_at ? new Date(user.created_at).toLocaleDateString("ar") : ""}
        </div>
      </div>
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
  const [name, setName] = useState(""); const [code, setCode] = useState("");
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
  const [q, setQ] = useState(""); const [results, setResults] = useState([]);
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
            <Avatar user={u} size={36} />
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
  const [tab, setTab] = useState("emoji");
  const [items, setItems] = useState([]);
  const [name, setName] = useState(""); const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await api.get(`/servers/${serverId}/emojis`);
    setItems(data.emojis);
  };
  useEffect(() => { load(); }, [serverId]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file || !name) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      await api.post(`/servers/${serverId}/emojis?name=${encodeURIComponent(name)}&kind=${tab}`, fd);
      toast.success("تمت الإضافة");
      setName(""); setFile(null);
      await load(); refreshEmojiCache();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };
  const del = async (id) => {
    if (!window.confirm("حذف؟")) return;
    try { await api.delete(`/servers/${serverId}/emojis/${id}`); await load(); refreshEmojiCache(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const filtered = items.filter(i => (i.kind || "emoji") === tab);

  return (
    <ModalShell wide title={`${tab === "emoji" ? "إيموجيات" : "ستيكرات"}: ${serverName}`} onClose={onClose}>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab("emoji")} data-testid="tab-emoji-kind"
          className={`px-4 py-2 rounded-full text-xs transition ${tab === "emoji" ? "gradient-rose text-white" : "btn-soft"}`}>إيموجي</button>
        <button onClick={() => setTab("sticker")} data-testid="tab-sticker-kind"
          className={`px-4 py-2 rounded-full text-xs transition ${tab === "sticker" ? "gradient-rose text-white" : "btn-soft"}`}>ستيكر</button>
      </div>

      <form onSubmit={upload} className="bg-[var(--surface)] rounded-2xl p-4 mb-5 space-y-3">
        <div className="label-soft">إضافة {tab === "emoji" ? "إيموجي" : "ستيكر"} جديد</div>
        <div className="grid grid-cols-[1fr,auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] text-[var(--muted)] mb-1">الاسم (للاستدعاء :name:)</label>
            <input data-testid="emoji-name-input" value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              required maxLength={32} dir="ltr" placeholder={tab === "emoji" ? "happy" : "love_kiss"}
              className="w-full input-soft px-3 py-2 text-sm font-mono-key" />
          </div>
          <div>
            <label className="block text-[10px] text-[var(--muted)] mb-1">الصورة (≤ {tab === "emoji" ? "٥١٢KB" : "١MB"})</label>
            <label className="btn-soft px-4 py-2 text-xs cursor-pointer flex items-center gap-2">
              <ImagePlus size={14} />
              {file ? file.name.slice(0, 18) : "اختر..."}
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
        <div className="label-soft mb-3">القائمة الحالية ({filtered.length})</div>
        {filtered.length === 0 ? (
          <div className="text-xs text-[var(--muted)] p-4 text-center">لا توجد {tab === "emoji" ? "إيموجيات" : "ستيكرات"} بعد</div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-80 overflow-y-auto">
            {filtered.map((e) => (
              <div key={e.id} className="bg-[var(--surface)] rounded-2xl p-3 group flex flex-col items-center gap-1 relative">
                <img src={`${BASE}/api/emojis/${e.id}/image`} alt={e.name}
                  className={tab === "sticker" ? "w-16 h-16 object-contain" : "w-10 h-10 object-contain"} />
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

function StickerPickerModal({ onClose, onPick }) {
  const [stickers, setStickers] = useState([]);
  useEffect(() => {
    api.get("/emojis").then(({ data }) => {
      setStickers(data.emojis.filter(e => e.kind === "sticker"));
    }).catch(() => {});
  }, []);
  return (
    <ModalShell title="الستيكرات" onClose={onClose}>
      {stickers.length === 0 ? (
        <div className="text-center text-xs text-[var(--muted)] py-10">
          لا توجد ستيكرات بعد. ارفع ستيكرات من إعدادات السيرفر (زر الإيموجي في رأس قائمة القنوات).
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
          {stickers.map((s) => (
            <button key={s.id} data-testid={`pick-sticker-${s.id}`} onClick={() => onPick(s)}
              className="bg-[var(--surface)] rounded-2xl p-3 hover:bg-[var(--accent)]/10 transition group flex flex-col items-center gap-1.5">
              <img src={`${BASE}/api/emojis/${s.id}/image`} alt={s.name}
                className="w-20 h-20 object-contain group-hover:scale-110 transition" />
              <span className="text-[10px] font-mono-key text-[var(--muted)] truncate w-full text-center">:{s.name}:</span>
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

function IncomingToast({ call, onAccept, onReject, icon, label }) {
  return (
    <div dir="rtl" className="fixed bottom-6 right-6 z-50 glass-card p-4 max-w-sm flex items-center gap-4 animate-chat-in">
      <div className="w-12 h-12 rounded-full gradient-rose flex items-center justify-center text-white font-display heart-pulse">
        {call.partner.display_name?.[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{call.partner.display_name}</div>
        <div className="text-xs label-soft">{label}</div>
      </div>
      <button data-testid="incoming-reject" onClick={onReject}
        className="w-10 h-10 rounded-full bg-[var(--error)]/20 text-[var(--error)] flex items-center justify-center hover:bg-[var(--error)]/40">
        <X size={14} />
      </button>
      <button data-testid="incoming-accept" onClick={onAccept}
        className="w-10 h-10 rounded-full gradient-rose text-white flex items-center justify-center heart-pulse">
        {icon}
      </button>
    </div>
  );
}

function FriendsModal({ me, onDM, onClose }) {
  const [tab, setTab] = useState("all");
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState({ incoming: [], outgoing: [] });
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const [f, p] = await Promise.all([api.get("/friends"), api.get("/friends/requests")]);
    setFriends(f.data.friends);
    setPending({ incoming: p.data.incoming, outgoing: p.data.outgoing });
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!q || tab !== "add") { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`); setResults(data.users); } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [q, tab]);

  const sendReq = async (uid) => {
    setLoading(true);
    try { await api.post("/friends/requests", { to_user_id: uid }); toast.success("تم إرسال طلب الصداقة"); await load(); }
    catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };
  const accept = async (id) => { try { await api.post(`/friends/requests/${id}/accept`); toast.success("تم القبول"); await load(); } catch (e) { toast.error(formatApiError(e)); } };
  const decline = async (id) => { try { await api.post(`/friends/requests/${id}/decline`); await load(); } catch (e) { toast.error(formatApiError(e)); } };
  const cancel = async (id) => { try { await api.delete(`/friends/requests/${id}`); await load(); } catch (e) { toast.error(formatApiError(e)); } };
  const removeFriend = async (uid) => { if (!window.confirm("إزالة الصديق؟")) return; try { await api.delete(`/friends/${uid}`); await load(); } catch (e) { toast.error(formatApiError(e)); } };

  const tabs = [
    { k: "all", label: `الأصدقاء (${friends.length})` },
    { k: "pending", label: `الطلبات (${pending.incoming.length + pending.outgoing.length})`, badge: pending.incoming.length },
    { k: "add", label: "إضافة" },
  ];

  return (
    <ModalShell wide title="الأصدقاء" onClose={onClose}>
      <div className="flex gap-2 mb-5 flex-wrap">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} data-testid={`friends-tab-${t.k}`}
            className={`relative px-4 py-2 rounded-full text-xs transition ${tab === t.k ? "gradient-rose text-white" : "btn-soft"}`}>
            {t.label}
            {t.badge > 0 && tab !== t.k && (
              <span className="absolute -top-1 -left-1 min-w-[16px] h-4 rounded-full bg-[var(--error)] text-white text-[9px] font-bold flex items-center justify-center px-1">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "all" && (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {friends.length === 0 ? (
            <div className="text-center text-xs text-[var(--muted)] py-8">لا أصدقاء بعد. اضغط "إضافة" لتبدأ.</div>
          ) : friends.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5">
              <Avatar user={u} size={40} />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{u.display_name}</div>
                <div className="font-mono-key text-[10px] text-[var(--muted-soft)] truncate">@{u.username}</div>
              </div>
              <button onClick={() => onDM(u)} data-testid={`friend-dm-${u.id}`} title="رسالة"
                className="w-9 h-9 rounded-full bg-[var(--surface)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)] flex items-center justify-center">
                <MessageCircle size={14} />
              </button>
              <button onClick={() => removeFriend(u.id)} data-testid={`friend-remove-${u.id}`} title="إزالة"
                className="w-9 h-9 rounded-full bg-[var(--surface)] hover:bg-[var(--error)]/20 hover:text-[var(--error)] flex items-center justify-center">
                <UserX size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "pending" && (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {pending.incoming.length > 0 && (
            <div>
              <div className="label-soft mb-2">واردة ({pending.incoming.length})</div>
              <div className="space-y-1">
                {pending.incoming.map((r) => (
                  <div key={r.id} data-testid={`pending-in-${r.id}`} className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--surface)]">
                    <Avatar user={r.from_user} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{r.from_user?.display_name}</div>
                      <div className="font-mono-key text-[10px] text-[var(--muted-soft)] truncate">@{r.from_user?.username}</div>
                    </div>
                    <button onClick={() => accept(r.id)} data-testid={`accept-${r.id}`} title="قبول"
                      className="w-9 h-9 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white flex items-center justify-center">
                      <Check size={14} />
                    </button>
                    <button onClick={() => decline(r.id)} data-testid={`decline-${r.id}`} title="رفض"
                      className="w-9 h-9 rounded-full bg-[var(--error)]/20 text-[var(--error)] hover:bg-[var(--error)] hover:text-white flex items-center justify-center">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pending.outgoing.length > 0 && (
            <div>
              <div className="label-soft mb-2">مُرسَلة ({pending.outgoing.length})</div>
              <div className="space-y-1">
                {pending.outgoing.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--surface)] opacity-70">
                    <Avatar user={r.to_user} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{r.to_user?.display_name}</div>
                      <div className="text-[10px] text-[var(--muted-soft)]">بانتظار الموافقة</div>
                    </div>
                    <button onClick={() => cancel(r.id)} data-testid={`cancel-${r.id}`}
                      className="text-xs text-[var(--muted)] hover:text-[var(--error)]">إلغاء</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pending.incoming.length === 0 && pending.outgoing.length === 0 && (
            <div className="text-center text-xs text-[var(--muted)] py-8">لا طلبات معلّقة</div>
          )}
        </div>
      )}

      {tab === "add" && (
        <div>
          <div className="flex items-center input-soft px-4 py-3 mb-4">
            <Search size={14} className="text-[var(--muted)] me-2" />
            <input data-testid="friend-search-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم المستخدم أو البريد..."
              className="flex-1 bg-transparent text-sm focus:outline-none" />
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {results.filter(u => u.id !== me?.id).map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5">
                <Avatar user={u} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{u.display_name}</div>
                  <div className="font-mono-key text-[10px] text-[var(--muted-soft)] truncate">@{u.username}</div>
                </div>
                <button onClick={() => sendReq(u.id)} disabled={loading} data-testid={`send-req-${u.id}`}
                  className="btn-rose px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50">
                  <UserPlus size={12} /> إضافة
                </button>
              </div>
            ))}
            {q && results.length === 0 && <div className="text-xs text-[var(--muted)] p-3 text-center">لا نتائج</div>}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api, { formatApiError } from "../lib/api";
import { encryptForPublicKey, decryptWithPrivateKey, fingerprint } from "../lib/crypto";
import {
  Shield, Plus, Hash, Settings as SettingsIcon, LogOut, Search, Send,
  Lock, Users, MessageCircle, Paperclip, Copy, X,
} from "lucide-react";
import { toast } from "sonner";

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
  const [fingerp, setFingerp] = useState("");
  const scrollRef = useRef(null);

  // Load servers + DMs
  const loadSidebar = async () => {
    const [s, d] = await Promise.all([api.get("/servers"), api.get("/dms")]);
    setServers(s.data.servers);
    setDmConversations(d.data.conversations);
  };

  useEffect(() => {
    loadSidebar();
    if (user?.public_key) fingerprint(user.public_key).then(setFingerp);
  }, [user?.public_key]);

  // Load active server
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

  // Load DM partner
  useEffect(() => {
    if (!userId) { setDmPartner(null); return; }
    (async () => {
      const { data } = await api.get(`/users/${userId}`);
      setDmPartner(data.user);
    })();
  }, [userId]);

  // Poll messages
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
            // decrypt
            const decrypted = await Promise.all(
              data.messages.map(async (m) => {
                try {
                  const ct = m.sender_id === user.id ? m.sender_ciphertext : m.recipient_ciphertext;
                  const pt = privateKeyB64 ? await decryptWithPrivateKey(ct, privateKeyB64) : "[LOCKED]";
                  return { ...m, plaintext: pt };
                } catch { return { ...m, plaintext: "[DECRYPT FAILED]" }; }
              }),
            );
            setMessages(decrypted);
          }
        } else {
          setMessages([]);
        }
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
        if (!privateKeyB64) { toast.error("No private key — sign in again"); return; }
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

  const createServer = async (name) => {
    try {
      const { data } = await api.post("/servers", { name });
      await loadSidebar();
      nav(`/app/${data.server.id}`);
      setShowServerModal(false);
      toast.success("Server created");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const joinServer = async (code) => {
    try {
      const { data } = await api.post("/servers/join", { invite_code: code });
      await loadSidebar();
      nav(`/app/${data.server.id}`);
      setShowServerModal(false);
      toast.success("Joined");
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
      {/* Servers sidebar */}
      <aside className="w-[72px] border-r border-white/10 flex flex-col items-center py-4 gap-3 shrink-0">
        <Link to="/app" data-testid="home-btn" className="w-10 h-10 border border-[#00FF66] flex items-center justify-center hover:bg-[#00FF66]/10 transition-colors">
          <Shield size={16} className="text-[#00FF66]" />
        </Link>
        <div className="w-8 h-px bg-white/10" />
        {servers.map((s) => (
          <button
            key={s.id}
            data-testid={`server-${s.id}`}
            onClick={() => nav(`/app/${s.id}`)}
            className={`w-10 h-10 flex items-center justify-center border font-display text-sm tracking-tight transition-all ${
              s.id === serverId ? "border-[#00FF66] bg-[#00FF66]/10 text-[#00FF66]" : "border-white/10 hover:border-white/40"
            }`}
            title={s.name}
          >
            {s.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <button data-testid="add-server-btn" onClick={() => setShowServerModal(true)} className="w-10 h-10 border border-dashed border-white/20 hover:border-[#00FF66] hover:text-[#00FF66] flex items-center justify-center transition-colors">
          <Plus size={16} />
        </button>
        <div className="mt-auto flex flex-col gap-2">
          <Link to="/settings" data-testid="settings-btn" className="w-10 h-10 border border-white/10 hover:border-white/40 flex items-center justify-center transition-colors">
            <SettingsIcon size={14} />
          </Link>
          <button data-testid="logout-btn" onClick={logout} className="w-10 h-10 border border-white/10 hover:border-[#FF3333] hover:text-[#FF3333] flex items-center justify-center transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* Channels/DMs column */}
      <aside className="w-[240px] border-r border-white/10 flex flex-col shrink-0">
        <div className="p-4 border-b border-white/10">
          <div className="font-mono-key text-[10px] tracking-[0.25em] text-gray-500 mb-1">WORKSPACE</div>
          <div className="font-display text-sm truncate">{activeServer?.name || "Direct Messages"}</div>
          {activeServer && (
            <div className="mt-2 flex items-center gap-2 text-[10px] font-mono-key text-gray-500">
              <Copy size={10} className="cursor-pointer hover:text-[#00FF66]"
                onClick={() => { navigator.clipboard.writeText(activeServer.invite_code); toast.success("Invite copied"); }} />
              <span>INVITE: {activeServer.invite_code}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {activeServer ? (
            <>
              <div className="flex items-center justify-between px-2 py-2">
                <span className="font-mono-key text-[10px] tracking-widest text-gray-500">CHANNELS</span>
                <button data-testid="add-channel-btn" onClick={() => setShowChannelModal(true)} className="text-gray-500 hover:text-[#00FF66]">
                  <Plus size={12} />
                </button>
              </div>
              {channels.map((c) => (
                <button
                  key={c.id}
                  data-testid={`channel-${c.id}`}
                  onClick={() => nav(`/app/${serverId}/${c.id}`)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm transition-colors ${
                    c.id === channelId ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Hash size={14} /> <span className="truncate">{c.name}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-2 py-2">
                <span className="font-mono-key text-[10px] tracking-widest text-gray-500">DIRECT · E2EE</span>
                <button data-testid="new-dm-btn" onClick={() => setShowDmSearch(true)} className="text-gray-500 hover:text-[#00FF66]">
                  <Plus size={12} />
                </button>
              </div>
              {dmConversations.map((c) => (
                <button
                  key={c.partner.id}
                  data-testid={`dm-${c.partner.id}`}
                  onClick={() => nav(`/app/dm/${c.partner.id}`)}
                  className={`w-full flex items-center gap-2 px-2 py-2 text-sm transition-colors ${
                    c.partner.id === userId ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <div className="w-7 h-7 border border-white/10 flex items-center justify-center text-[10px] font-display">
                    {c.partner.display_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <span className="truncate">{c.partner.display_name}</span>
                  <Lock size={10} className="ml-auto text-[#00FF66]" />
                </button>
              ))}
              {dmConversations.length === 0 && (
                <div className="text-xs text-gray-600 px-2 py-4">No conversations yet. Click + to start one.</div>
              )}
            </>
          )}
        </div>

        {/* Self badge */}
        <div className="p-3 border-t border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 border border-[#00FF66]/50 flex items-center justify-center text-[10px] font-display">
            {user?.display_name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs truncate">{user?.display_name}</div>
            <div className="font-mono-key text-[9px] text-gray-500 truncate">{fingerp}</div>
          </div>
        </div>
      </aside>

      {/* Chat area */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-white/10 px-6 flex items-center gap-3 shrink-0">
          {activeChannel ? (
            <>
              <Hash size={16} className="text-gray-500" />
              <span className="font-display">{activeChannel.name}</span>
              <span className="font-mono-key text-[10px] text-gray-600 ml-2">SERVER-VISIBLE</span>
            </>
          ) : dmPartner ? (
            <>
              <MessageCircle size={16} className="text-gray-500" />
              <span className="font-display">{dmPartner.display_name}</span>
              <div className="flex items-center gap-1 ml-2 px-2 py-0.5 border border-[#00FF66]/30 bg-[#00FF66]/5">
                <Lock size={10} className="text-[#00FF66]" />
                <span className="font-mono-key text-[10px] text-[#00FF66]">E2EE</span>
              </div>
            </>
          ) : (
            <span className="text-sm text-gray-500">Select a channel or DM</span>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map((m) => {
            const isMe = m.sender_id === user.id;
            const senderName = m.sender?.display_name || (isMe ? user.display_name : dmPartner?.display_name || "Unknown");
            const text = m.plaintext !== undefined ? m.plaintext : m.content;
            return (
              <div key={m.id} data-testid={`message-${m.id}`} className="animate-chat-in">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-sm font-medium">{senderName}</span>
                  <span className="font-mono-key text-[10px] text-gray-600">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
                <div className={`inline-block px-3 py-2 text-sm leading-relaxed max-w-2xl ${
                  isMe ? "bg-white/10 text-white" : "border border-white/10 text-gray-200"
                }`}>
                  {text}
                </div>
              </div>
            );
          })}
          {messages.length === 0 && (channelId || userId) && (
            <div className="text-center text-gray-600 font-mono-key text-xs tracking-widest mt-20">
              NO MESSAGES YET · START THE CONVERSATION
            </div>
          )}
        </div>

        {(channelId || userId) && (
          <form onSubmit={send} className="p-4 border-t border-white/10 flex items-center gap-3 shrink-0">
            <input
              data-testid="message-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={userId ? "Encrypted message..." : "Message #" + (activeChannel?.name || "")}
              className="flex-1 bg-transparent border border-white/20 px-4 py-3 text-sm focus:outline-none focus:border-[#00FF66]"
            />
            <button data-testid="send-btn" type="submit" className="bg-[#00FF66] text-black px-5 py-3 hover:bg-white transition-colors">
              <Send size={14} />
            </button>
          </form>
        )}
      </main>

      {/* Members panel */}
      {activeServer && (
        <aside className="w-[240px] border-l border-white/10 p-4 shrink-0 hidden lg:block">
          <div className="font-mono-key text-[10px] tracking-widest text-gray-500 mb-4">
            MEMBERS · {members.length}
          </div>
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
    </div>
  );
}

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl flex items-center justify-center p-6">
      <div className="w-full max-w-md border border-white/10 bg-[#0A0A0A]">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <span className="font-display text-sm tracking-tight">{title}</span>
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
    <ModalShell title="SERVER" onClose={onClose}>
      <div className="flex gap-2 mb-5 font-mono-key text-[10px] tracking-widest">
        <button onClick={() => setMode("create")} className={`px-3 py-1.5 border ${mode === "create" ? "border-[#00FF66] text-[#00FF66]" : "border-white/10 text-gray-500"}`} data-testid="tab-create">CREATE</button>
        <button onClick={() => setMode("join")} className={`px-3 py-1.5 border ${mode === "join" ? "border-[#00FF66] text-[#00FF66]" : "border-white/10 text-gray-500"}`} data-testid="tab-join">JOIN</button>
      </div>
      {mode === "create" ? (
        <form onSubmit={(e) => { e.preventDefault(); onCreate(name); }} className="space-y-4">
          <input data-testid="server-name-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Server name"
            className="w-full bg-transparent border border-white/20 px-3 py-2.5 text-sm focus:outline-none focus:border-[#00FF66]" />
          <button data-testid="server-create-submit" className="w-full bg-white text-black py-2.5 text-sm hover:bg-[#00FF66]">CREATE SERVER</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onJoin(code); }} className="space-y-4">
          <input data-testid="server-invite-input" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="Invite code"
            className="w-full bg-transparent border border-white/20 px-3 py-2.5 text-sm font-mono-key focus:outline-none focus:border-[#00FF66]" />
          <button data-testid="server-join-submit" className="w-full bg-white text-black py-2.5 text-sm hover:bg-[#00FF66]">JOIN SERVER</button>
        </form>
      )}
    </ModalShell>
  );
}

function ChannelModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  return (
    <ModalShell title="NEW CHANNEL" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onCreate(name); }} className="space-y-4">
        <input data-testid="channel-name-input" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))} required placeholder="channel-name"
          className="w-full bg-transparent border border-white/20 px-3 py-2.5 text-sm focus:outline-none focus:border-[#00FF66]" />
        <button data-testid="channel-create-submit" className="w-full bg-white text-black py-2.5 text-sm hover:bg-[#00FF66]">CREATE CHANNEL</button>
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
    <ModalShell title="NEW DIRECT MESSAGE" onClose={onClose}>
      <div className="flex items-center border border-white/20 px-3 py-2.5 focus-within:border-[#00FF66]">
        <Search size={14} className="text-gray-500 mr-2" />
        <input data-testid="dm-search-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by username or email..."
          className="flex-1 bg-transparent text-sm focus:outline-none" />
      </div>
      <div className="mt-4 space-y-1 max-h-80 overflow-y-auto">
        {results.map((u) => (
          <button key={u.id} data-testid={`dm-pick-${u.id}`} onClick={() => onPick(u)}
            className="w-full flex items-center gap-3 p-2 text-left hover:bg-white/5 transition-colors">
            <div className="w-8 h-8 border border-white/10 flex items-center justify-center text-[10px] font-display">
              {u.display_name?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm truncate">{u.display_name}</div>
              <div className="font-mono-key text-[10px] text-gray-500 truncate">@{u.username}</div>
            </div>
          </button>
        ))}
        {q && results.length === 0 && <div className="text-xs text-gray-600 p-2">No users found</div>}
      </div>
    </ModalShell>
  );
}

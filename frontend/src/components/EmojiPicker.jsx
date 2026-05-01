import { useState, useEffect, useRef } from "react";
import { Smile, Search, X } from "lucide-react";
import { EMOJI_GROUPS } from "../lib/emojis";
import api from "../lib/api";

const BASE = process.env.REACT_APP_BACKEND_URL;

export default function EmojiPicker({ onPick, onClose }) {
  const [tab, setTab] = useState("common");
  const [customEmojis, setCustomEmojis] = useState([]);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    api.get("/emojis").then(({ data }) => setCustomEmojis(data.emojis)).catch(() => {});
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  const filteredCustom = q
    ? customEmojis.filter(e => e.name.toLowerCase().includes(q.toLowerCase()))
    : customEmojis;

  return (
    <div ref={ref} data-testid="emoji-picker"
      className="absolute bottom-full mb-3 right-0 w-80 max-h-96 bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-2xl flex flex-col z-50 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
        <span className="label-soft">الإيموجي</span>
        <button onClick={onClose} data-testid="emoji-picker-close" className="text-[var(--muted)] hover:text-white">
          <X size={14} />
        </button>
      </div>

      <div className="flex p-2 gap-1">
        <button data-testid="emoji-tab-common" onClick={() => setTab("common")}
          className={`flex-1 px-3 py-1.5 text-xs rounded-full transition ${tab === "common" ? "gradient-rose text-white" : "text-[var(--muted)] hover:text-white"}`}>
          الشائعة
        </button>
        <button data-testid="emoji-tab-custom" onClick={() => setTab("custom")}
          className={`flex-1 px-3 py-1.5 text-xs rounded-full transition ${tab === "custom" ? "gradient-rose text-white" : "text-[var(--muted)] hover:text-white"}`}>
          المخصصة ({customEmojis.length})
        </button>
      </div>

      {tab === "custom" && (
        <div className="px-3 pb-2">
          <div className="flex items-center input-soft px-3 py-2">
            <Search size={12} className="text-[var(--muted)] me-2" />
            <input data-testid="emoji-search" value={q} onChange={e => setQ(e.target.value)}
              placeholder="ابحث..." className="flex-1 bg-transparent text-xs focus:outline-none" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "common" ? (
          EMOJI_GROUPS.map((g, i) => (
            <div key={i} className="mb-3">
              <div className="label-soft mb-2 px-1">{g.name}</div>
              <div className="grid grid-cols-8 gap-1">
                {g.emojis.map((e, j) => (
                  <button key={j} data-testid={`emoji-${e}`} onClick={() => onPick({ type: "unicode", value: e })}
                    className="text-xl hover:bg-white/5 p-1.5 rounded-lg transition-colors">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div>
            {filteredCustom.length === 0 ? (
              <div className="text-xs text-[var(--muted)] p-4 text-center">
                {customEmojis.length === 0
                  ? "لا توجد إيموجيات مخصصة. ارفع واحدة من إعدادات السيرفر."
                  : "لا نتائج"}
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {filteredCustom.map((e) => (
                  <button key={e.id} data-testid={`custom-emoji-${e.id}`} title={`:${e.name}: من ${e.server_name}`}
                    onClick={() => onPick({ type: "custom", value: `:${e.name}:`, emoji: e })}
                    className="hover:bg-white/5 p-1.5 rounded-xl transition-colors flex flex-col items-center gap-0.5">
                    <img src={`${BASE}/api/emojis/${e.id}/image`} alt={e.name} className="w-7 h-7 object-contain" />
                    <span className="text-[9px] text-[var(--muted)] truncate w-full text-center font-mono-key">:{e.name}:</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmojiButton({ onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" data-testid="emoji-button" onClick={() => setOpen(!open)}
        className="text-[var(--muted)] hover:text-[var(--accent)] p-2 transition-colors" title="إيموجي">
        <Smile size={18} />
      </button>
      {open && <EmojiPicker onPick={(p) => { onPick(p); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

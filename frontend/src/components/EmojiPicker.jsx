import { useState, useEffect, useRef } from "react";
import { Smile, Search, X } from "lucide-react";
import { EMOJI_GROUPS } from "../lib/emojis";
import api from "../lib/api";

const BASE = process.env.REACT_APP_BACKEND_URL;

export default function EmojiPicker({ onPick, onClose }) {
  const [tab, setTab] = useState("common"); // common | custom
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
      className="absolute bottom-full mb-2 right-0 w-80 max-h-96 bg-[#0A0A0A] border border-white/10 shadow-2xl flex flex-col z-50">
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <span className="text-xs label-ar">الإيموجي</span>
        <button onClick={onClose} data-testid="emoji-picker-close" className="text-gray-500 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <div className="flex border-b border-white/10">
        <button data-testid="emoji-tab-common" onClick={() => setTab("common")}
          className={`flex-1 px-3 py-2 text-xs ${tab === "common" ? "bg-white/10 text-[#00FF66]" : "text-gray-500 hover:text-white"}`}>
          الشائعة
        </button>
        <button data-testid="emoji-tab-custom" onClick={() => setTab("custom")}
          className={`flex-1 px-3 py-2 text-xs ${tab === "custom" ? "bg-white/10 text-[#00FF66]" : "text-gray-500 hover:text-white"}`}>
          المخصصة ({customEmojis.length})
        </button>
      </div>

      {tab === "custom" && (
        <div className="p-2 border-b border-white/10">
          <div className="flex items-center border border-white/10 px-2 py-1.5">
            <Search size={12} className="text-gray-500 ms-1 me-2" />
            <input data-testid="emoji-search" value={q} onChange={e => setQ(e.target.value)}
              placeholder="ابحث..." className="flex-1 bg-transparent text-xs focus:outline-none" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {tab === "common" ? (
          EMOJI_GROUPS.map((g, i) => (
            <div key={i} className="mb-3">
              <div className="text-[10px] label-ar mb-1 px-1">{g.name}</div>
              <div className="grid grid-cols-8 gap-1">
                {g.emojis.map((e, j) => (
                  <button key={j} data-testid={`emoji-${e}`} onClick={() => onPick({ type: "unicode", value: e })}
                    className="text-xl hover:bg-white/10 p-1 transition-colors">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div>
            {filteredCustom.length === 0 ? (
              <div className="text-xs text-gray-600 p-4 text-center">
                {customEmojis.length === 0
                  ? "لا توجد إيموجيات مخصصة. ارفع واحدة من إعدادات السيرفر."
                  : "لا نتائج"}
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {filteredCustom.map((e) => (
                  <button key={e.id} data-testid={`custom-emoji-${e.id}`} title={`:${e.name}: من ${e.server_name}`}
                    onClick={() => onPick({ type: "custom", value: `:${e.name}:`, emoji: e })}
                    className="hover:bg-white/10 p-1.5 transition-colors flex flex-col items-center gap-0.5">
                    <img src={`${BASE}/api/emojis/${e.id}/image`} alt={e.name} className="w-7 h-7 object-contain" />
                    <span className="text-[9px] text-gray-500 truncate w-full text-center font-mono-key">:{e.name}:</span>
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
        className="text-gray-500 hover:text-[#00FF66] p-2 transition-colors">
        <Smile size={18} />
      </button>
      {open && <EmojiPicker onPick={(p) => { onPick(p); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

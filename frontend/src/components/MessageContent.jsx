import { useEffect, useState } from "react";
import api from "../lib/api";

const BASE = process.env.REACT_APP_BACKEND_URL;

// Cache for emoji lookup by name across the user's accessible servers
let emojiCachePromise = null;
function loadEmojiMap() {
  if (!emojiCachePromise) {
    emojiCachePromise = api.get("/emojis").then(({ data }) => {
      const map = {};
      for (const e of data.emojis) map[e.name] = e;
      return map;
    }).catch(() => ({}));
  }
  return emojiCachePromise;
}

export function refreshEmojiCache() {
  emojiCachePromise = null;
}

const SHORTCODE_RE = /:([a-z0-9_]{1,32}):/gi;

export default function MessageContent({ text }) {
  const [emojiMap, setEmojiMap] = useState({});
  useEffect(() => { loadEmojiMap().then(setEmojiMap); }, []);

  if (!text) return null;
  const parts = [];
  let last = 0;
  let m;
  SHORTCODE_RE.lastIndex = 0;
  while ((m = SHORTCODE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const emoji = emojiMap[m[1].toLowerCase()];
    if (emoji) {
      parts.push(<img key={m.index} src={`${BASE}/api/emojis/${emoji.id}/image`}
        alt={`:${emoji.name}:`} title={`:${emoji.name}:`} className="inline-emoji" />);
    } else {
      parts.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => typeof p === "string" ? <span key={i}>{p}</span> : p)}</>;
}

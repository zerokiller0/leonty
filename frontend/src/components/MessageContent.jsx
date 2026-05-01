import { useEffect, useState } from "react";
import api from "../lib/api";

const BASE = process.env.REACT_APP_BACKEND_URL;

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

export function refreshEmojiCache() { emojiCachePromise = null; }

const SHORTCODE_RE = /:([a-z0-9_]{1,32}):/gi;

// Detect if string consists only of emoji characters (and whitespace).
function isEmojiOnly(s) {
  if (!s) return false;
  const trimmed = s.trim();
  if (!trimmed) return false;
  // Use regex: extended pictographic, modifiers, and ZWJ + spaces
  return /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\uFE0F|\s)+$/u.test(trimmed);
}

// Detect if string is a single sticker shortcode like ":name:"
function singleShortcode(s) {
  if (!s) return null;
  const t = s.trim();
  const m = /^:([a-z0-9_]{1,32}):$/i.exec(t);
  return m ? m[1].toLowerCase() : null;
}

export function classifyMessage(text, emojiMap) {
  const single = singleShortcode(text);
  if (single && emojiMap[single]) {
    const e = emojiMap[single];
    return { kind: e.kind === "sticker" ? "sticker" : "big-emoji", emoji: e };
  }
  if (isEmojiOnly(text) && [...text.trim()].length <= 3) {
    return { kind: "big-emoji-unicode", text: text.trim() };
  }
  return { kind: "text" };
}

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
      const cls = emoji.kind === "sticker" ? "h-32 w-32 object-contain" : "inline-emoji";
      parts.push(<img key={m.index} src={`${BASE}/api/emojis/${emoji.id}/image`}
        alt={`:${emoji.name}:`} title={`:${emoji.name}:`} className={cls} />);
    } else { parts.push(m[0]); }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => typeof p === "string" ? <span key={i}>{p}</span> : p)}</>;
}

// Hook to use cached map
export function useEmojiMap() {
  const [map, setMap] = useState({});
  useEffect(() => { loadEmojiMap().then(setMap); }, []);
  return map;
}

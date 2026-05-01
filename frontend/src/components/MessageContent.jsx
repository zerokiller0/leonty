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
const URL_RE = /(https?:\/\/[^\s<>]+)/gi;

function isEmojiOnly(s) {
  if (!s) return false;
  const trimmed = s.trim();
  if (!trimmed) return false;
  return /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\uFE0F|\s)+$/u.test(trimmed);
}
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

// Render text with emoji shortcodes AND clickable links
export default function MessageContent({ text }) {
  const [emojiMap, setEmojiMap] = useState({});
  useEffect(() => { loadEmojiMap().then(setEmojiMap); }, []);
  if (!text) return null;

  // First split by emoji shortcodes
  const tokens = [];
  let last = 0;
  let m;
  SHORTCODE_RE.lastIndex = 0;
  while ((m = SHORTCODE_RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ t: "text", v: text.slice(last, m.index) });
    const emoji = emojiMap[m[1].toLowerCase()];
    if (emoji) {
      tokens.push({ t: "emoji", v: emoji });
    } else {
      tokens.push({ t: "text", v: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ t: "text", v: text.slice(last) });

  // Then within text tokens, linkify URLs
  const out = [];
  tokens.forEach((tok, i) => {
    if (tok.t === "emoji") {
      const cls = tok.v.kind === "sticker" ? "h-32 w-32 object-contain" : "inline-emoji";
      out.push(<img key={`e-${i}`} src={`${BASE}/api/emojis/${tok.v.id}/image`}
        alt={`:${tok.v.name}:`} title={`:${tok.v.name}:`} className={cls} />);
      return;
    }
    // text — split by URL
    let j = 0; let mm;
    URL_RE.lastIndex = 0;
    while ((mm = URL_RE.exec(tok.v)) !== null) {
      if (mm.index > j) out.push(<span key={`t-${i}-${j}`}>{tok.v.slice(j, mm.index)}</span>);
      const url = mm[0].replace(/[.,;!?)]+$/, "");
      const trail = mm[0].slice(url.length);
      out.push(
        <a key={`l-${i}-${mm.index}`} href={url} target="_blank" rel="noopener noreferrer nofollow"
          className="text-[var(--accent-soft)] underline decoration-dotted underline-offset-2 hover:text-white break-words" dir="ltr">
          {url}
        </a>
      );
      if (trail) out.push(<span key={`tr-${i}-${mm.index}`}>{trail}</span>);
      j = mm.index + mm[0].length;
    }
    if (j < tok.v.length) out.push(<span key={`tt-${i}-${j}`}>{tok.v.slice(j)}</span>);
  });

  return <>{out}</>;
}

export function useEmojiMap() {
  const [map, setMap] = useState({});
  useEffect(() => { loadEmojiMap().then(setMap); }, []);
  return map;
}

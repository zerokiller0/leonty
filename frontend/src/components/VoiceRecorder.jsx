import { useState, useRef } from "react";
import { Mic, Square, Send, Trash2 } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

export default function VoiceRecorder({ onSent, isDM, encryptForRecipient }) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState(null);
  const [duration, setDuration] = useState(0);
  const [sending, setSending] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startedAt = useRef(0);
  const tickRef = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mimeType });
        setBlob(b);
        streamRef.current?.getTracks().forEach(t => t.stop());
        clearInterval(tickRef.current);
      };
      rec.start();
      recorderRef.current = rec;
      startedAt.current = Date.now();
      setDuration(0);
      tickRef.current = setInterval(() => setDuration(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
      setRecording(true);
    } catch {
      toast.error("لا يمكن الوصول للميكروفون");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const cancel = () => {
    if (recording) stop();
    setBlob(null);
    setDuration(0);
  };

  const sendVoice = async () => {
    if (!blob) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, `voice-${Date.now()}.webm`);
      const { data } = await api.post("/files/upload", fd);
      const fileId = data.file.id;
      // Send message with attachment
      const placeholder = `🎤 رسالة صوتية (${duration}s)`;
      await onSent(placeholder, fileId, blob);
      setBlob(null);
      setDuration(0);
    } catch {
      toast.error("فشل إرسال الرسالة الصوتية");
    } finally { setSending(false); }
  };

  if (blob) {
    const url = URL.createObjectURL(blob);
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--surface)] border border-[var(--border)]">
        <button onClick={cancel} data-testid="voice-cancel" className="text-[var(--muted)] hover:text-[var(--error)]">
          <Trash2 size={14} />
        </button>
        <audio src={url} controls className="h-8" />
        <span className="text-xs label-soft">{duration}s</span>
        <button onClick={sendVoice} disabled={sending} data-testid="voice-send"
          className="btn-rose px-3 py-1.5 text-xs flex items-center gap-1 disabled:opacity-50">
          <Send size={12} className="rotate-180" />
          {sending ? "جارٍ..." : "إرسال"}
        </button>
      </div>
    );
  }

  return recording ? (
    <button onClick={stop} data-testid="voice-stop"
      className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)] text-[var(--accent)] heart-pulse">
      <Square size={14} fill="currentColor" />
      <span className="text-xs font-mono-key">{duration}s</span>
    </button>
  ) : (
    <button type="button" onClick={start} data-testid="voice-record"
      className="text-[var(--muted)] hover:text-[var(--accent)] p-2 transition-colors" title="رسالة صوتية">
      <Mic size={18} />
    </button>
  );
}

import { useState, useEffect, useRef } from "react";
import { Film, Upload, X, Download, Play, Rewind, FastForward, Gauge } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

const BASE = process.env.REACT_APP_BACKEND_URL;
const SYNC_THRESHOLD = 1.5;

export default function WatchTogether({ partner, me, onClose, incomingInvite }) {
  // States: idle | uploading | hostReady | invited | downloading | guestReady | watching
  const [stage, setStage] = useState(incomingInvite ? "invited" : "idle");
  const [partyId] = useState(() => incomingInvite?.party_id || `wp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [fileId, setFileId] = useState(incomingInvite?.file_id || null);
  const [filename, setFilename] = useState(incomingInvite?.filename || "");
  const [fileSize, setFileSize] = useState(incomingInvite?.size || 0);
  const [progress, setProgress] = useState(0);
  const [localUrl, setLocalUrl] = useState(null);
  const [partnerReady, setPartnerReady] = useState(false);
  const [rate, setRate] = useState(1);

  const videoRef = useRef(null);
  const lastEmit = useRef(0);
  const ignoreEvents = useRef(false);
  const blobUrlRef = useRef(null);

  const sendSignal = async (type, payload) => {
    try {
      await api.post("/calls/signal", { to_user_id: partner.id, type: `watch_${type}`, payload, call_id: partyId });
    } catch (e) { console.error(e); }
  };

  // ----- HOST: upload -----
  const onUploadPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) { toast.error("اختر ملف فيديو"); return; }
    if (f.size > 2 * 1024 * 1024 * 1024) { toast.error("الحد الأقصى ٢ جيجا"); return; }
    setStage("uploading");
    setProgress(0);
    setFilename(f.name);
    setFileSize(f.size);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/files/upload", fd, {
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
        },
        timeout: 0,
      });
      setFileId(data.file.id);
      // Use the host's local file directly as their playback source
      const url = URL.createObjectURL(f);
      blobUrlRef.current = url;
      setLocalUrl(url);
      await sendSignal("invite", { file_id: data.file.id, filename: f.name, size: f.size, party_id: partyId });
      setStage("hostReady");
      toast.success("تم الرفع — أرسلت رابط التحميل لـ " + partner.display_name);
    } catch (err) {
      toast.error("فشل الرفع"); setStage("idle");
    }
  };

  // ----- GUEST: download -----
  const startDownload = async () => {
    if (!fileId) return;
    setStage("downloading");
    setProgress(0);
    try {
      const token = localStorage.getItem("access_token");
      const resp = await fetch(`${BASE}/api/files/${fileId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!resp.ok) throw new Error("download failed");
      const total = parseInt(resp.headers.get("Content-Length") || fileSize || "0", 10);
      const reader = resp.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) setProgress(Math.round((received / total) * 100));
      }
      const blob = new Blob(chunks, { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setLocalUrl(url);
      setStage("guestReady");
      await sendSignal("ready", { party_id: partyId });
      toast.success("اكتمل التحميل — جاهز للمشاهدة");
    } catch {
      toast.error("فشل التحميل"); setStage("invited");
    }
  };

  // Listen for signals from partner
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get("/calls/signals");
        for (const s of data.signals) {
          if (cancelled) return;
          if (s.from_user_id !== partner.id) continue;
          if (s.type === "watch_ready") {
            setPartnerReady(true);
          } else if (s.type === "watch_state" && videoRef.current) {
            ignoreEvents.current = true;
            const v = videoRef.current;
            const { action, time, rate: r } = s.payload;
            if (typeof time === "number" && Math.abs((v.currentTime || 0) - time) > SYNC_THRESHOLD) {
              v.currentTime = time;
            }
            if (typeof r === "number" && r > 0) {
              v.playbackRate = r; setRate(r);
            }
            if (action === "play" && v.paused) await v.play().catch(() => {});
            if (action === "pause" && !v.paused) v.pause();
            setTimeout(() => { ignoreEvents.current = false; }, 250);
          } else if (s.type === "watch_close") {
            handleClose();
          } else if (s.type === "watch_start") {
            setStage("watching");
          }
        }
      } catch {}
    };
    poll();
    const t = setInterval(poll, 1100);
    return () => { cancelled = true; clearInterval(t); };
  }, [partner.id]);

  const emitState = (action, opts = {}) => {
    if (ignoreEvents.current) return;
    const now = Date.now();
    if (now - lastEmit.current < 200) return;
    lastEmit.current = now;
    const v = videoRef.current;
    if (!v) return;
    sendSignal("state", { action, time: v.currentTime || 0, rate: v.playbackRate, ...opts });
  };

  const handleClose = () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    onClose();
  };
  const closeAll = async () => {
    await sendSignal("close", {}).catch(() => {});
    handleClose();
  };

  // Both ready → can start watching
  const canWatch = localUrl && partnerReady;
  const startWatch = async () => {
    setStage("watching");
    await sendSignal("start", {});
  };

  const skip = (delta) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, (v.currentTime || 0) + delta);
    emitState("seek");
  };
  const toggleRate = () => {
    const v = videoRef.current; if (!v) return;
    const next = rate >= 2 ? 1 : 2;
    v.playbackRate = next; setRate(next);
    emitState("rate");
  };

  const fmtMB = (b) => b ? (b / (1024 * 1024)).toFixed(1) + " MB" : "—";

  return (
    <div dir="rtl" className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-2xl flex items-center justify-center p-4">
      <div className="w-full max-w-5xl glass-card overflow-hidden flex flex-col max-h-[94vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl gradient-rose flex items-center justify-center">
              <Film size={18} className="text-white" />
            </div>
            <div>
              <div className="font-display">المشاهدة معاً</div>
              <div className="text-xs label-soft">مع {partner.display_name}</div>
            </div>
          </div>
          <button onClick={closeAll} data-testid="watch-close" className="w-9 h-9 rounded-full hover:bg-white/5 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {stage === "idle" && (
            <div className="text-center py-12 space-y-5">
              <div className="text-sm text-[var(--muted)]">
                ارفع فيديو من جهازك (حتى ٢ جيجا)، وسيتم إرسال رابط التحميل لـ <strong>{partner.display_name}</strong>
              </div>
              <label className="btn-rose inline-flex items-center gap-2 px-7 py-3.5 cursor-pointer">
                <Upload size={16} /> رفع فيديو
                <input type="file" accept="video/*" hidden onChange={onUploadPick} data-testid="watch-upload-input" />
              </label>
            </div>
          )}

          {stage === "uploading" && (
            <ProgressBlock label="جاري رفع الفيديو" filename={filename} fileSize={fileSize} progress={progress} />
          )}

          {stage === "hostReady" && (
            <div className="text-center py-12 space-y-5">
              <Download size={48} className="mx-auto text-[var(--accent)] heart-pulse" />
              <div className="text-sm">
                ✓ تم رفع <strong>{filename}</strong> ({fmtMB(fileSize)})
              </div>
              <div className="text-sm text-[var(--muted)]">
                {partnerReady
                  ? `${partner.display_name} انتهى من التحميل! يمكنكم بدء المشاهدة معاً 🎬`
                  : `بانتظار ${partner.display_name} ينهي التحميل...`}
              </div>
              {canWatch && (
                <button data-testid="watch-start-btn" onClick={startWatch}
                  className="btn-rose px-7 py-3.5 inline-flex items-center gap-2">
                  <Play size={16} /> ابدأ المشاهدة
                </button>
              )}
            </div>
          )}

          {stage === "invited" && (
            <div className="text-center py-12 space-y-5">
              <Download size={48} className="mx-auto text-[var(--accent)]" />
              <div className="text-sm">
                {partner.display_name} دعاك لمشاهدة <strong>{filename}</strong>
                {fileSize ? <span className="text-[var(--muted)]"> ({fmtMB(fileSize)})</span> : null}
              </div>
              <div className="text-sm text-[var(--muted)]">حمّل الفيديو على جهازك أولاً للمشاهدة بالتزامن</div>
              <button data-testid="watch-download-btn" onClick={startDownload}
                className="btn-rose px-7 py-3.5 inline-flex items-center gap-2">
                <Download size={16} /> تحميل الفيديو
              </button>
            </div>
          )}

          {stage === "downloading" && (
            <ProgressBlock label="جاري التحميل" filename={filename} fileSize={fileSize} progress={progress} />
          )}

          {stage === "guestReady" && (
            <div className="text-center py-12 space-y-5">
              <Play size={48} className="mx-auto text-[var(--accent)] heart-pulse" />
              <div className="text-sm">✓ تم التحميل بنجاح</div>
              <div className="text-sm text-[var(--muted)]">بانتظار {partner.display_name} ليبدأ المشاهدة...</div>
              <button data-testid="watch-start-btn" onClick={startWatch}
                className="btn-rose px-7 py-3.5 inline-flex items-center gap-2">
                <Play size={16} /> ابدأ المشاهدة
              </button>
            </div>
          )}

          {stage === "watching" && localUrl && (
            <div className="space-y-3">
              <div className="text-xs label-soft text-center truncate">
                🎬 {filename} · مزامنة تلقائية
              </div>
              <video ref={videoRef} src={localUrl} controls className="w-full rounded-2xl bg-black max-h-[60vh]"
                onPlay={() => emitState("play")}
                onPause={() => emitState("pause")}
                onSeeked={() => emitState("seek")}
                onRateChange={() => { setRate(videoRef.current?.playbackRate || 1); emitState("rate"); }}
                data-testid="watch-video" />
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button data-testid="skip-back-10" onClick={() => skip(-10)} className="btn-soft px-4 py-2 text-xs flex items-center gap-1.5">
                  <Rewind size={14} /> ١٠ ثوانٍ ←
                </button>
                <button data-testid="toggle-rate" onClick={toggleRate}
                  className={`px-4 py-2 text-xs rounded-full flex items-center gap-1.5 transition ${rate === 2 ? "gradient-rose text-white" : "btn-soft"}`}>
                  <Gauge size={14} /> {rate === 2 ? "السرعة 2x" : "السرعة 1x"}
                </button>
                <button data-testid="skip-fwd-10" onClick={() => skip(10)} className="btn-soft px-4 py-2 text-xs flex items-center gap-1.5">
                  → ١٠ ثوانٍ <FastForward size={14} />
                </button>
              </div>
              <div className="text-[11px] text-[var(--muted-soft)] text-center">
                💡 أي تشغيل/إيقاف/تنقّل/سرعة يطبّق على الطرفين
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBlock({ label, filename, fileSize, progress }) {
  const fmtMB = (b) => b ? (b / (1024 * 1024)).toFixed(1) + " MB" : "";
  return (
    <div className="text-center py-12 space-y-5">
      <div className="text-sm font-display">{label}...</div>
      <div className="text-xs text-[var(--muted)] truncate">{filename} {fileSize ? `· ${fmtMB(fileSize)}` : ""}</div>
      <div className="w-full max-w-md mx-auto bg-[var(--surface)] rounded-full h-3 overflow-hidden">
        <div className="gradient-rose h-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="text-2xl font-display text-[var(--accent)]">{progress}%</div>
    </div>
  );
}

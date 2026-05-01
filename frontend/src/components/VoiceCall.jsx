import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, X } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

const ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export default function VoiceCall({ partner, me, onClose, incomingCallId, incomingOffer }) {
  const [state, setState] = useState(incomingOffer ? "ringing-in" : "idle"); // idle | calling | ringing-in | connected | ended
  const [callId, setCallId] = useState(incomingCallId || null);
  const [withVideo, setWithVideo] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [duration, setDuration] = useState(0);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const pendingCandidates = useRef([]);
  const tickRef = useRef(null);
  const connectedAt = useRef(0);

  const sendSignal = async (type, payload) => {
    try {
      await api.post("/calls/signal", { to_user_id: partner.id, type, payload, call_id: callId });
    } catch (e) { console.error("signal error", e); }
  };

  const setupPeer = () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal("candidate", { candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (e.track.kind === "audio" && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
      }
      if (e.track.kind === "video" && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setState("connected");
        connectedAt.current = Date.now();
        tickRef.current = setInterval(() => setDuration(Math.floor((Date.now() - connectedAt.current) / 1000)), 1000);
      }
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        teardown();
      }
    };
    pcRef.current = pc;
    return pc;
  };

  const startCall = async (video = false) => {
    setWithVideo(video);
    setCamOn(video);
    const cid = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setCallId(cid);
    const pc = setupPeer();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      localStreamRef.current = stream;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      if (video && localVideoRef.current) localVideoRef.current.srcObject = stream;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Need to update callId in sendSignal closure — call directly
      await api.post("/calls/signal", { to_user_id: partner.id, type: "offer", payload: { sdp: offer, video }, call_id: cid });
      setState("calling");
      toast.info("جارٍ الاتصال...");
    } catch {
      toast.error("لا يمكن الوصول للميكروفون/الكاميرا");
      teardown();
    }
  };

  const acceptCall = async () => {
    const pc = setupPeer();
    setWithVideo(!!incomingOffer.video);
    setCamOn(!!incomingOffer.video);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!incomingOffer.video });
      localStreamRef.current = stream;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      if (incomingOffer.video && localVideoRef.current) localVideoRef.current.srcObject = stream;
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer.sdp));
      // flush queued ICE
      for (const c of pendingCandidates.current) {
        try { await pc.addIceCandidate(c); } catch {}
      }
      pendingCandidates.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal("answer", { sdp: answer });
    } catch {
      toast.error("لا يمكن الوصول للميكروفون");
      hangup();
    }
  };

  const hangup = async () => {
    await sendSignal("hangup", {});
    teardown();
  };

  const teardown = () => {
    clearInterval(tickRef.current);
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    setState("ended");
    setTimeout(onClose, 600);
  };

  // Poll signals
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get("/calls/signals");
        for (const s of data.signals) {
          if (s.from_user_id !== partner.id) continue;
          if (cancelled) return;
          if (s.type === "answer" && pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(s.payload.sdp));
            for (const c of pendingCandidates.current) {
              try { await pcRef.current.addIceCandidate(c); } catch {}
            }
            pendingCandidates.current = [];
          } else if (s.type === "candidate") {
            const cand = new RTCIceCandidate(s.payload.candidate);
            if (pcRef.current?.remoteDescription) {
              try { await pcRef.current.addIceCandidate(cand); } catch {}
            } else {
              pendingCandidates.current.push(cand);
            }
          } else if (s.type === "hangup") {
            teardown();
          }
        }
      } catch {}
    };
    const t = setInterval(poll, 1500);
    poll();
    return () => { cancelled = true; clearInterval(t); };
  }, [partner.id]);

  const toggleMic = () => {
    const next = !micOn;
    localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = next);
    setMicOn(next);
  };

  const toggleCam = async () => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    if (videoTracks.length === 0) {
      // Add video
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = newStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(track);
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find(s => s.track?.kind === "video");
        if (videoSender) videoSender.replaceTrack(track);
        else pcRef.current.addTrack(track, localStreamRef.current);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        setCamOn(true);
        setWithVideo(true);
      } catch { toast.error("لا يمكن فتح الكاميرا"); }
    } else {
      const next = !camOn;
      videoTracks.forEach(t => t.enabled = next);
      setCamOn(next);
    }
  };

  const toggleScreenShare = async () => {
    if (sharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      // restore camera or empty
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(camTrack || null);
      setSharing(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screen;
        const track = screen.getVideoTracks()[0];
        track.onended = () => toggleScreenShare();
        let sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(track);
        } else {
          pcRef.current.addTrack(track, screen);
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = screen;
        setSharing(true);
        setWithVideo(true);
      } catch { toast.error("تم إلغاء مشاركة الشاشة"); }
    }
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-2xl flex items-center justify-center p-6">
      <div className="w-full max-w-3xl glass-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-rose flex items-center justify-center text-white font-display">
              {partner.display_name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="font-display text-base">{partner.display_name}</div>
              <div className="text-xs label-soft">
                {state === "calling" && "جارٍ الاتصال..."}
                {state === "ringing-in" && "مكالمة واردة..."}
                {state === "connected" && fmt(duration)}
                {state === "ended" && "انتهت المكالمة"}
                {state === "idle" && "جاهز"}
              </div>
            </div>
          </div>
          <button onClick={state === "idle" || state === "ended" ? onClose : hangup} className="text-[var(--muted)] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="relative aspect-video bg-black/40 flex items-center justify-center">
          {withVideo ? (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <video ref={localVideoRef} autoPlay playsInline muted
                className="absolute bottom-4 left-4 w-32 h-24 object-cover rounded-2xl border border-[var(--accent)]/30" />
            </>
          ) : (
            <div className="text-center">
              <div className="w-32 h-32 rounded-full gradient-rose mx-auto flex items-center justify-center text-white text-4xl font-display heart-pulse">
                {partner.display_name?.[0]?.toUpperCase()}
              </div>
              <div className="mt-6 text-lg font-display">{partner.display_name}</div>
              {state === "connected" && (
                <div className="mt-1 text-sm label-soft font-mono-key">{fmt(duration)}</div>
              )}
            </div>
          )}
          <audio ref={remoteAudioRef} autoPlay />
        </div>

        <div className="p-6 flex items-center justify-center gap-3 flex-wrap">
          {state === "idle" && (
            <>
              <button data-testid="start-call-audio" onClick={() => startCall(false)}
                className="btn-rose px-6 py-3 flex items-center gap-2">
                <Phone size={16} /> اتصال صوتي
              </button>
              <button data-testid="start-call-video" onClick={() => startCall(true)}
                className="btn-soft px-6 py-3 flex items-center gap-2">
                <Video size={16} /> اتصال فيديو
              </button>
            </>
          )}
          {state === "ringing-in" && (
            <>
              <button data-testid="accept-call" onClick={acceptCall}
                className="btn-rose px-6 py-3 flex items-center gap-2">
                <Phone size={16} /> قبول
              </button>
              <button data-testid="reject-call" onClick={hangup}
                className="px-6 py-3 rounded-full bg-[var(--error)]/20 text-[var(--error)] hover:bg-[var(--error)]/30 flex items-center gap-2">
                <PhoneOff size={16} /> رفض
              </button>
            </>
          )}
          {(state === "calling" || state === "connected") && (
            <>
              <button data-testid="toggle-mic" onClick={toggleMic}
                className={`p-4 rounded-full transition ${micOn ? "btn-soft" : "bg-[var(--error)]/20 text-[var(--error)]"}`}>
                {micOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
              <button data-testid="toggle-cam" onClick={toggleCam}
                className={`p-4 rounded-full transition ${camOn ? "btn-soft" : "bg-white/5 text-[var(--muted)]"}`}>
                {camOn ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
              <button data-testid="toggle-screen" onClick={toggleScreenShare}
                className={`p-4 rounded-full transition ${sharing ? "bg-[var(--accent)]/30 text-[var(--accent)]" : "btn-soft"}`}>
                {sharing ? <MonitorOff size={18} /> : <MonitorUp size={18} />}
              </button>
              <button data-testid="hangup-btn" onClick={hangup}
                className="p-4 rounded-full bg-[var(--error)] text-white hover:opacity-90 transition">
                <PhoneOff size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

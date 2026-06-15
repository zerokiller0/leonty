import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api from "../lib/api";
import { Heart } from "lucide-react";
import { toast } from "sonner";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const run = async () => {
      const hash = window.location.hash || "";
      const match = hash.match(/session_id=([^&]+)/);
      if (!match) {
        nav("/login", { replace: true });
        return;
      }
      const session_id = decodeURIComponent(match[1]);
      try {
        const { data } = await api.post("/auth/google/session", { session_id });
        if (data.access_token) localStorage.setItem("access_token", data.access_token);
        setUser(data.user);
        // Strip the hash from URL
        window.history.replaceState(null, "", window.location.pathname);
        toast.success("تم الدخول عبر Google");
        nav("/app", { replace: true });
      } catch (e) {
        toast.error("فشل تسجيل الدخول عبر Google");
        nav("/login", { replace: true });
      }
    };
    run();
  }, [nav, setUser]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl gradient-rose flex items-center justify-center heart-pulse mb-4">
          <Heart size={20} className="text-white" fill="white" />
        </div>
        <p className="text-sm text-[var(--muted)]">جاري تسجيل الدخول عبر Google...</p>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import splashVideo from "@/assets/splash.mp4";

interface SplashScreenProps {
  onFinish: () => void;
  /** Hard cap in ms in case the video fails to fire `ended` */
  maxDurationMs?: number;
}

export const SplashScreen = ({ onFinish, maxDurationMs = 8000 }: SplashScreenProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.play().catch(() => finish());
    }
    const timeout = window.setTimeout(finish, maxDurationMs);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    setFadeOut(true);
    window.setTimeout(onFinish, 400);
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-background flex items-center justify-center transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <video
        ref={videoRef}
        src={splashVideo}
        autoPlay
        muted
        playsInline
        onEnded={finish}
        onError={finish}
        className="w-full h-full object-cover"
      />
    </div>
  );
};

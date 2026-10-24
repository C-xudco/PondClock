import { useEffect, useRef, useState } from "react";
// A single bounded visual loop. It never owns catch, travel or save deadlines.
export function useVisualClock(active, identity) {
  const [frame, setFrame] = useState({
    timeMs: 0,
    reducedMotion: false
  });
  const time = useRef(0);
  useEffect(() => {
    time.current = 0;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0,
      previous = 0,
      lastPublish = 0;
    const publish = () => setFrame({
      timeMs: time.current,
      reducedMotion: media.matches
    });
    const tick = now => {
      if (previous) time.current += Math.min(80, now - previous);
      previous = now;
      if (now - lastPublish >= 40) {
        publish();
        lastPublish = now;
      }
      raf = requestAnimationFrame(tick);
    };
    const synchronize = () => {
      cancelAnimationFrame(raf);
      previous = 0;
      publish();
      if (active && !media.matches && !document.hidden) raf = requestAnimationFrame(tick);
    };
    media.addEventListener("change", synchronize);
    document.addEventListener("visibilitychange", synchronize);
    synchronize();
    return () => {
      cancelAnimationFrame(raf);
      media.removeEventListener("change", synchronize);
      document.removeEventListener("visibilitychange", synchronize);
    };
  }, [active, identity]);
  return frame;
}

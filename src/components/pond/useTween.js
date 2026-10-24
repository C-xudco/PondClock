import { useEffect, useRef, useState } from "react";

// 0/1 目标值的缓动过渡（rAF 驱动，卸载自动清理）
// 用于鱼竿下压 / 人物前倾 / 浮漂下沉的联动，保证竿梢与钓线始终相接
export function useTween(target, duration = 360) {
  const to = typeof target === "number" ? Math.min(1, Math.max(0, target)) : target ? 1 : 0;
  const [value, setValue] = useState(to);
  const currentRef = useRef(to);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = currentRef.current;
    if (from === to) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      currentRef.current = to;
      setValue(to);
      return;
    }
    let start = 0;
    const ease = (p) => 1 - Math.pow(1 - p, 3);
    const step = (now) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * ease(p);
      currentRef.current = v;
      setValue(v);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, duration]);

  return value;
}

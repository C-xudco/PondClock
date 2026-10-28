import { useEffect, useRef, useState } from 'react';
import { coverScene } from './sceneViewport';

export function useSceneViewport(safeBottom) {
  const ref = useRef(null);
  const [frame, setFrame] = useState(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = coverScene(element.clientWidth, element.clientHeight, safeBottom);
      setFrame(previous => previous?.viewportWidth === next?.viewportWidth && previous?.viewportHeight === next?.viewportHeight
        && previous?.top === next?.top ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [safeBottom]);
  return { ref, frame, style: frame ? { width: frame.width, height: frame.height, left: frame.left, top: frame.top }
    : { width: '100%', height: '100%', left: 0, top: 0 } };
}

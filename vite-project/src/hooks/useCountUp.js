import { useEffect, useRef, useState } from 'react';

/**
 * Counts a number up to `target` (about half a second, eased) so a figure
 * draws the eye when it arrives. From the previous value on later changes;
 * no motion when the user prefers reduced motion.
 */
export function useCountUp(target, duration = 600) {
  const end = Number(target) || 0;
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = from.current;
    if (reduce || start === end) { from.current = end; setValue(end); return undefined; }
    let frame;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      setValue(start + (end - start) * eased);
      if (p < 1) frame = requestAnimationFrame(step);
      else from.current = end;
    };
    frame = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame); from.current = end; };
  }, [end, duration]);
  return value;
}

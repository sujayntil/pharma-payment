import { useRef } from 'react';

/**
 * Press and hold (about half a second, without scrolling) calls onLongPress;
 * a normal tap still calls onClick. The tap after a long press is swallowed.
 */
export function useLongPress(onLongPress, onClick, { delay = 450, enabled = true } = {}) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const cancel = () => { clearTimeout(timer.current); timer.current = null; };
  // Always wrapped: the tap that ends a long press must not also act.
  const click = (event) => {
    if (fired.current) { fired.current = false; event?.preventDefault?.(); return; }
    onClick?.(event);
  };
  if (!enabled) return { onClick: click };
  return {
    onPointerDown: (event) => {
      if (event.button > 0) return;
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      cancel();
      timer.current = setTimeout(() => {
        fired.current = true;
        try { navigator.vibrate?.(25); } catch { /* not supported */ }
        onLongPress?.();
      }, delay);
    },
    onPointerMove: (event) => {
      if (!start.current || !timer.current) return;
      if (Math.abs(event.clientX - start.current.x) > 10 || Math.abs(event.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event) => event.preventDefault(),
    onClick: click,
  };
}

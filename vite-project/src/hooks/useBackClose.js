import { useEffect, useId, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Makes the phone/browser Back button close an open sheet, drawer or dialog
 * instead of leaving the screen (or the app).
 *
 * While `opened` is true one history entry is added for this overlay. Pressing
 * Back removes that entry and calls `onClose`. Closing it from the UI (X,
 * Cancel, Save) removes the same entry, so history never piles up. Overlays
 * can be stacked (ledger > invoice sheet > record form): each has its own
 * entry and Back closes the top one first.
 */
export function useBackClose(opened, onClose) {
  const key = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const pushed = useRef(false);   // we added a history entry for this overlay
  const armed = useRef(false);    // ...and the router has shown it to us
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  const stack = location.state?.overlays;
  const inStack = Array.isArray(stack) && stack.includes(key);
  const isTop = Array.isArray(stack) && stack[stack.length - 1] === key;

  useEffect(() => {
    if (opened && !pushed.current) {
      pushed.current = true;
      navigate(`${location.pathname}${location.search}`, {
        state: { ...(location.state || {}), overlays: [...(location.state?.overlays || []), key] },
      });
    } else if (!opened && pushed.current) {
      // Closed from the UI: drop our entry if it is still the current one.
      const wasArmed = armed.current;
      pushed.current = false;
      armed.current = false;
      if (wasArmed && isTop) navigate(-1);
    }
    // Only react to open/close; location is read at that moment on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  useEffect(() => {
    if (!pushed.current) return;
    if (inStack) { armed.current = true; return; }
    if (armed.current) {
      // Our entry is gone while we are still open: Back was pressed.
      pushed.current = false;
      armed.current = false;
      closeRef.current?.();
    }
  }, [inStack]);
}

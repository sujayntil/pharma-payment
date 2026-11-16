import { useEffect, useRef } from 'react';

export const SWIPE_SHEET_CLASS = 'swipe-sheet';
const CLOSE_DISTANCE = 90; // px pulled down to close
const FAST_SPEED = 0.6;    // px per ms: a quick flick closes from less

/**
 * Lets a phone bottom sheet be pulled down to close (like Maps or Photos).
 * Give the Drawer content the SWIPE_SHEET_CLASS class. A pull starts from the
 * sheet's header, or from its body while the body is scrolled to the top, so
 * scrolling the list inside the sheet still works normally.
 */
export function useSwipeDownToClose(opened, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!opened) return undefined;
    let sheet = null; let startY = 0; let startT = 0; let dy = 0; let active = false;

    const onStart = (event) => {
      const target = event.target;
      const found = target.closest?.(`.${SWIPE_SHEET_CLASS}`);
      if (!found || event.touches.length !== 1) return;
      // Ignore pulls that begin on inputs or inside a scrolled body.
      if (target.closest('input, textarea, select, [role="slider"]')) return;
      // A pull from the header always works. Anywhere else, only when nothing
      // between the finger and the sheet (the sheet included) is scrolled down,
      // so dragging down to scroll back up never closes the sheet.
      if (!target.closest('.mantine-Drawer-header')) {
        for (let el = target; el; el = el.parentElement) {
          if (el.scrollTop > 0) return;
          if (el === found) break;
        }
      }
      sheet = found; startY = event.touches[0].clientY; startT = Date.now(); dy = 0; active = true;
      sheet.style.transition = 'none';
    };
    const onMove = (event) => {
      if (!active || !sheet) return;
      dy = Math.max(0, event.touches[0].clientY - startY);
      if (dy > 0) {
        sheet.style.transform = `translateY(${dy}px)`;
        if (event.cancelable) event.preventDefault();
      }
    };
    const onEnd = () => {
      if (!active || !sheet) return;
      const speed = dy / Math.max(1, Date.now() - startT);
      const el = sheet;
      active = false; sheet = null;
      if (dy > CLOSE_DISTANCE || (dy > 30 && speed > FAST_SPEED)) {
        el.style.transition = 'transform 160ms ease-in';
        el.style.transform = 'translateY(100%)';
        setTimeout(() => { el.style.transition = ''; el.style.transform = ''; closeRef.current?.(); }, 150);
      } else {
        el.style.transition = 'transform 160ms ease-out';
        el.style.transform = '';
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [opened]);
}

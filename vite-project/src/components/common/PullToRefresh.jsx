import { useEffect, useRef, useState } from 'react';
import { Paper } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useAppRefreshControl } from '../../hooks/useAppRefresh';

const TRIGGER = 70; // px of pull (after resistance) that starts a refresh
const MAX = 110;
// Sheets, popups and menus handle their own touches (swipe-down-to-close).
const OVERLAY = '.mantine-Modal-root, .mantine-Drawer-root, .mantine-Popover-dropdown, .mantine-Menu-dropdown, .mantine-Combobox-dropdown, [data-no-pull]';

/**
 * MR phone: pull the page down from the very top to refresh, like WhatsApp
 * or Gmail. A round ⟳ follows the finger under the header, turns as it
 * goes, and keeps turning until the new data is in.
 * top: header height, so the circle appears just under it.
 */
export default function PullToRefresh({ top = 52 }) {
  const { refresh, refreshing } = useAppRefreshControl();
  const [pull, setPull] = useState(0);
  const start = useRef(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const onStart = (event) => {
      if (window.scrollY > 0 || event.touches.length !== 1 || event.target.closest?.(OVERLAY) || document.querySelector('.mantine-Modal-content, .mantine-Drawer-content')) {
        start.current = null; return;
      }
      start.current = event.touches[0].clientY;
    };
    const onMove = (event) => {
      if (start.current == null) return;
      const dy = event.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) { pullRef.current = 0; setPull(0); return; }
      const next = Math.min(MAX, dy * 0.5); // resistance: the circle moves half as far as the finger
      pullRef.current = next; setPull(next);
    };
    const onEnd = () => {
      if (start.current == null) return;
      start.current = null;
      if (pullRef.current >= TRIGGER) refresh();
      pullRef.current = 0; setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [refresh]);

  const shown = refreshing ? TRIGGER * 0.7 : pull;
  if (shown <= 2) return null;
  const ready = pull >= TRIGGER;
  return (
    <Paper
      shadow="sm"
      radius="xl"
      withBorder
      aria-hidden={!refreshing}
      role={refreshing ? 'status' : undefined}
      aria-label={refreshing ? 'Refreshing' : undefined}
      style={{
        position: 'fixed', left: '50%', top: top + shown - 34, zIndex: 150,
        width: 38, height: 38, marginLeft: -19, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: refreshing ? 'top 200ms ease' : undefined,
        opacity: refreshing ? 1 : Math.min(1, pull / TRIGGER + 0.2),
      }}
    >
      <IconRefresh
        size={20}
        color={ready || refreshing ? 'var(--mantine-color-green-7)' : 'var(--app-muted)'}
        className={refreshing ? 'app-spin' : undefined}
        style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
      />
    </Paper>
  );
}

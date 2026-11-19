import { useEffect, useRef, useState } from 'react';
import { ActionIcon } from '@mantine/core';
import { IconArrowUp } from '@tabler/icons-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import classes from './SectionNav.module.css';

/**
 * Shows the ↑ only while you scroll back up (that is when people want the
 * top): hidden while scrolling down or reading, gone 2 s after scrolling
 * stops, and never near the top. So it doesn't sit on cards and amounts.
 * getY: the current scroll position. Returns [shown, attach(target)].
 */
function useShowOnScrollUp(threshold) {
  const [shown, setShown] = useState(false);
  const last = useRef(0);
  const idle = useRef(null);
  const attach = (target, getY) => {
    last.current = getY();
    const onScroll = () => {
      const y = getY();
      const delta = y - last.current;
      if (Math.abs(delta) < 4) return; // ignore tiny jitters (address bar, bounce)
      last.current = y;
      setShown(delta < 0 && y > threshold);
      clearTimeout(idle.current);
      idle.current = setTimeout(() => setShown(false), 2000);
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => { target.removeEventListener('scroll', onScroll); clearTimeout(idle.current); };
  };
  return [shown, setShown, attach];
}

/**
 * Round ↑ "Back to top" for every page (see useShowOnScrollUp).
 * aboveBottomNav: MR phone — sits above the bottom tab bar.
 */
export default function BackToTop({ aboveBottomNav = false }) {
  const isMobile = useIsMobile();
  const [shown, setShown, attach] = useShowOnScrollUp(600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => attach(window, () => window.scrollY), []);
  return (
    <ActionIcon className={classes.top} data-shown={shown || undefined} data-above-nav={aboveBottomNav || undefined}
      radius="xl" size={isMobile ? 38 : 34} variant="default" tabIndex={shown ? 0 : -1} aria-label="Back to top"
      onClick={() => { setShown(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
      <IconArrowUp size={isMobile ? 18 : 17} />
    </ActionIcon>
  );
}

/**
 * The same ↑ inside a long side panel (customer ledger, Insights lists):
 * back to the panel's top (totals, filters) without closing it. Put it as
 * the last child of the panel. hidden: e.g. while the selection bar is up.
 */
export function PanelTop({ hidden = false }) {
  const anchor = useRef(null);
  const [shown, setShown, attach] = useShowOnScrollUp(500);
  const [box, setBox] = useState(null);
  useEffect(() => {
    // The panel's scrolling box is the nearest parent that scrolls.
    let el = anchor.current?.parentElement;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    if (!el) return undefined;
    setBox(el);
    return attach(el, () => el.scrollTop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={anchor} className={classes.panelTop}>
      <ActionIcon className={classes.panelTopButton} data-shown={(shown && !hidden) || undefined} radius="xl" size={40} variant="default"
        tabIndex={shown ? 0 : -1} aria-label="Back to top of panel" onClick={() => { setShown(false); box?.scrollTo({ top: 0, behavior: 'smooth' }); }}>
        <IconArrowUp size={18} />
      </ActionIcon>
    </div>
  );
}

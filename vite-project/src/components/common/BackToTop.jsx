import { useEffect, useRef, useState } from 'react';
import { ActionIcon } from '@mantine/core';
import { IconArrowUp } from '@tabler/icons-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import classes from './SectionNav.module.css';

/**
 * Round ↑ "Back to top" for every page: shows once you've scrolled down a
 * bit, hidden near the top (so short pages never show it).
 * aboveBottomNav: MR phone — sits above the bottom tab bar.
 */
export default function BackToTop({ aboveBottomNav = false }) {
  const isMobile = useIsMobile();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <ActionIcon className={classes.top} data-shown={shown || undefined} data-above-nav={aboveBottomNav || undefined}
      radius="xl" size={isMobile ? 44 : 34} variant="default" tabIndex={shown ? 0 : -1} aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      <IconArrowUp size={isMobile ? 20 : 17} />
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
  const [shown, setShown] = useState(false);
  const [box, setBox] = useState(null);
  useEffect(() => {
    // The panel's scrolling box is the nearest parent that scrolls.
    let el = anchor.current?.parentElement;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    if (!el) return undefined;
    setBox(el);
    const onScroll = () => setShown(el.scrollTop > 500);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div ref={anchor} className={classes.panelTop}>
      <ActionIcon className={classes.panelTopButton} data-shown={(shown && !hidden) || undefined} radius="xl" size={40} variant="default"
        tabIndex={shown ? 0 : -1} aria-label="Back to top of panel" onClick={() => box?.scrollTo({ top: 0, behavior: 'smooth' })}>
        <IconArrowUp size={18} />
      </ActionIcon>
    </div>
  );
}

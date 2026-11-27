import { useEffect, useRef, useState } from 'react';
import classes from './StickyFilters.module.css';

/**
 * Admin list pages on laptop: the search and filters stay pinned under the
 * top bar (or under a panel's own header) while you scroll, and the table's
 * column names pin right below them. The title and summary scroll away, so
 * the rows still get the whole screen. enabled=false → plain wrapper.
 */
/**
 * atTop: the block is the first thing on the page (Customers, Invoices,
 * Collections). It then sits in its pinned spot from the start, so it never
 * slides up 16px and back while scrolling, and gets its own band colour.
 */
export default function StickyFilters({ enabled = true, atTop = false, children }) {
  const ref = useRef(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return undefined;
    // The page (or panel) this bar belongs to: column names pin below the bar.
    const root = el.parentElement;
    const setOffset = () => root.style.setProperty('--sticky-top', `calc(var(--sticky-base) + ${el.offsetHeight}px)`);
    setOffset();
    const resize = new ResizeObserver(setOffset);
    resize.observe(el);
    // A soft line under the bar only once it's pinned and rows pass beneath.
    const onScroll = () => {
      const base = parseFloat(getComputedStyle(el).top) || 0;
      setStuck(el.getBoundingClientRect().top <= base + 0.5 && el.getBoundingClientRect().top > -1 && (window.scrollY > 0 || el.closest('.mantine-Drawer-content')?.scrollTop > 0));
    };
    const scroller = el.closest('.mantine-Drawer-content') || window;
    scroller.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { resize.disconnect(); scroller.removeEventListener('scroll', onScroll); root.style.removeProperty('--sticky-top'); };
  }, [enabled]);
  if (!enabled) return children;
  return <div ref={ref} className={classes.bar} data-stuck={stuck || undefined} data-top={atTop || undefined}>{children}</div>;
}

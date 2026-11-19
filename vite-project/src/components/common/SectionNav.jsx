import { useEffect, useRef, useState } from 'react';
import { Tooltip, UnstyledButton } from '@mantine/core';
import { useIsMobile } from '../../hooks/useIsMobile';
import classes from './SectionNav.module.css';

/**
 * "Jump to section" for long pages (Dashboard, Insights).
 *   Laptop: a slim rail of dots on the right edge; hover for the name,
 *           click to glide there; the section in view is filled green.
 *   Phone:  a chip row that slides in under the top bar once you scroll.
 *
 * sections: [{ id, label }] — each id is an element on the page. Sections
 *           not on the page right now (no data, filtered out) are skipped.
 * watch:    anything that changes which sections exist (re-checks them).
 */
export default function SectionNav({ sections, watch }) {
  const isMobile = useIsMobile();
  const [present, setPresent] = useState([]);
  const [active, setActive] = useState(null);
  const [scrolled, setScrolled] = useState(0);
  const chipRow = useRef(null);
  const pinned = useRef(false); // after a click, keep that section lit while the page glides

  // Which sections are on the page (they appear once data has loaded).
  const key = sections.map((s) => s.id).join('|');
  useEffect(() => {
    const check = () => setPresent(sections.filter((s) => document.getElementById(s.id)));
    check();
    const timer = setTimeout(check, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, watch]);

  // The section in the middle of the screen is "here".
  useEffect(() => {
    if (!present.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (seen.length && !pinned.current) setActive(seen[0].target.id);
    }, { rootMargin: '-35% 0px -55% 0px' });
    present.forEach((s) => { const el = document.getElementById(s.id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [present]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Phone: keep the current chip in view in the chip row.
  useEffect(() => {
    const chip = chipRow.current?.querySelector('[data-on]');
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [active]);

  // Laptop: keep page content clear of the rail on the right.
  const railShown = !isMobile && present.length >= 2;
  useEffect(() => {
    if (!railShown) return undefined;
    document.body.classList.add('has-section-rail');
    return () => document.body.classList.remove('has-section-rail');
  }, [railShown]);

  if (present.length < 2) return null;
  const go = (id) => {
    pinned.current = true;
    setTimeout(() => { pinned.current = false; }, 1200);
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {isMobile ? (
        <div className={classes.chips} data-shown={scrolled > 220 || undefined} ref={chipRow} role="navigation" aria-label="Jump to section">
          {present.map((s) => (
            <UnstyledButton key={s.id} className={classes.chip} data-on={active === s.id || undefined} onClick={() => go(s.id)}>{s.label}</UnstyledButton>
          ))}
        </div>
      ) : (
        <nav className={classes.rail} aria-label="Jump to section">
          {present.map((s) => (
            <Tooltip key={s.id} label={s.label} position="left" withArrow openDelay={80}>
              <UnstyledButton className={classes.dot} data-on={active === s.id || undefined} onClick={() => go(s.id)} aria-label={`Go to ${s.label}`}>
                <span />
              </UnstyledButton>
            </Tooltip>
          ))}
        </nav>
      )}
    </>
  );
}

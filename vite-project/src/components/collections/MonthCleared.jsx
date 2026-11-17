import { useCallback, useEffect, useState } from 'react';
import { Portal, Text } from '@mantine/core';
import confetti from 'canvas-confetti';
import { useAuth } from '../../hooks/useAppStore';
import { holdUpdate } from '../../utils/updateGate';
import { MONTH_CLEARED_EVENT } from '../../utils/appEvents';
import { mrApi } from '../../api/mrApi';
import ThumbsUpMascot from './ThumbsUpMascot';

const SHOW_MS = 4500;
const CHECK_EVERY_MS = 60 * 1000; // when the app comes back, at most once a minute
let lastCheck = 0; // shared, so a re-mounted screen doesn't ask twice
let lastUser = null;

/** Waits (up to ~20 s) until the daily welcome screen has gone. */
function afterWelcome() {
  return new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      if (!document.querySelector('[role="dialog"][aria-label="Welcome"]') || tries > 40) resolve();
      else { tries += 1; setTimeout(check, 500); }
    };
    setTimeout(check, 800);
  });
}
const LEAVE_MS = 280;

const SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];
/** "2026-09" -> "SEPT" (adds the year when it isn't this year). */
function monthName(key) {
  const [year, month] = key.split('-').map(Number);
  return `${SHORT[month - 1]}${year === new Date().getFullYear() ? '' : ` ${year}`}`;
}

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * "Shabaash! Rahul 🎉 / All invoices cleared for SEPT" at the top, after an
 * MR's collection pays off the last open invoice of a finished month: the
 * capsule mascot dances inside the pill giving a thumbs-up (arm pumps,
 * sparkles twinkle) with a burst of confetti. Same for every cleared month. Several months show one after
 * another; closes by itself or on a tap. Months cleared by an Admin (or that
 * ended after being cleared) show the next time the MR opens the app.
 */
export default function MonthCleared() {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [leaving, setLeaving] = useState(false);
  const current = queue[0] || null;

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(() => { setQueue((items) => items.slice(1)); setLeaving(false); }, reducedMotion() ? 0 : LEAVE_MS);
  }, []);

  useEffect(() => {
    const add = (event) => setQueue((items) => [...items, ...(event.detail || [])]);
    window.addEventListener(MONTH_CLEARED_EVENT, add);
    return () => window.removeEventListener(MONTH_CLEARED_EVENT, add);
  }, []);

  // Months cleared while the MR wasn't collecting (an Admin collected the
  // last invoice, or the month just ended): ask on open and when the app
  // comes back, after the welcome screen. Each month comes back only once.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return undefined;
    if (lastUser !== userId) { lastUser = userId; lastCheck = 0; } // another MR signed in on this device
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < CHECK_EVERY_MS) return;
      lastCheck = Date.now();
      await afterWelcome();
      try {
        // Months handed out here are marked seen on the server, so always show them.
        const months = await mrApi.claimMonthsCleared();
        if (months.length) window.dispatchEvent(new CustomEvent(MONTH_CLEARED_EVENT, { detail: months }));
      } catch { /* offline: try next time */ }
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [userId]);

  useEffect(() => (current ? holdUpdate() : undefined), [current]);
  useEffect(() => {
    if (!current) return undefined;
    let burst;
    if (!reducedMotion()) {
      const colors = ['#fcc419', '#40c057', '#2f9e44', '#ffffff', '#4dabf7', '#ff8fa3'];
      burst = setTimeout(() => {
        confetti({ particleCount: 90, spread: 70, startVelocity: 34, gravity: 0.9, ticks: 220, origin: { y: 0.14 }, zIndex: 1001, colors, disableForReducedMotion: true });
      }, 350);
    }
    try { navigator.vibrate?.([30, 50, 30]); } catch { /* not supported */ }
    const timer = setTimeout(close, SHOW_MS);
    return () => { clearTimeout(timer); clearTimeout(burst); };
  }, [current, close]);

  if (!current) return null;
  const first = (user?.name || '').trim().split(/\s+/)[0];
  return (
    <Portal>
      <style>{CSS}</style>
      <div key={current.month} className={`mc-pill${leaving ? ' mc-leave' : ''}`} role="status" aria-live="polite" onClick={close}>
        <span className="mc-mascot" aria-hidden><ThumbsUpMascot size={58} /></span>
        <div style={{ minWidth: 0 }}>
          <Text fw={700} fz={16} lh={1.25}>Shabaash!{first ? ` ${first}` : ''} 🎉</Text>
          <Text fz={13.5} c="dimmed" lh={1.35}>All invoices cleared for <b style={{ color: 'var(--mantine-color-green-8)' }}>{monthName(current.month)}</b></Text>
        </div>
      </div>
    </Portal>
  );
}

const CSS = `
.mc-pill{position:fixed;left:12px;right:12px;margin:0 auto;width:fit-content;max-width:440px;top:calc(env(safe-area-inset-top,0px) + 74px);z-index:1002;display:flex;align-items:center;gap:12px;padding:6px 22px 6px 6px;border-radius:999px;background:var(--mantine-color-body);border:1.5px solid #f3d27a;box-shadow:0 12px 32px rgba(176,125,0,.20),0 2px 6px rgba(0,0,0,.08);cursor:pointer;animation:mc-in 520ms cubic-bezier(.2,1.25,.35,1) both}
.mc-leave{animation:mc-out 280ms ease-in both}
.mc-mascot{flex-shrink:0;width:60px;height:60px;border-radius:50%;background:linear-gradient(160deg,#fff9db,#ffec99);display:grid;place-items:center;overflow:hidden;animation:mc-pop 560ms cubic-bezier(.2,1.5,.4,1) 120ms both}
.mc-mascot svg{display:block;margin-top:2px}
.mc-mascot .tm-body{transform-box:view-box;transform-origin:100px 186px;animation:mc-dance 760ms ease-in-out 600ms infinite}
.mc-mascot .tm-arm{transform-box:view-box;transform-origin:138px 114px;animation:mc-pump 760ms ease-in-out 600ms infinite}
.mc-mascot .tm-spark path{transform-box:fill-box;transform-origin:center;animation:mc-twinkle 900ms ease-in-out infinite alternate}
.mc-mascot .tm-spark path:nth-child(2){animation-delay:450ms}
@keyframes mc-in{0%{opacity:0;transform:translateY(-28px) scale(.9)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes mc-out{to{opacity:0;transform:translateY(-16px) scale(.96)}}
@keyframes mc-pop{0%{transform:scale(0) rotate(-12deg)}100%{transform:scale(1) rotate(0)}}
@keyframes mc-dance{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-9px) rotate(-7deg)}50%{transform:translateY(0) rotate(0)}75%{transform:translateY(-9px) rotate(7deg)}}
@keyframes mc-pump{0%,50%,100%{transform:rotate(0)}25%,75%{transform:rotate(-14deg)}}
@keyframes mc-twinkle{from{transform:scale(.55);opacity:.5}to{transform:scale(1.1);opacity:1}}
@media (prefers-reduced-motion: reduce){.mc-pill,.mc-leave,.mc-mascot,.mc-mascot *{animation:none!important}}
`;

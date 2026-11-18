import { useCallback, useEffect, useRef, useState } from 'react';
import { Portal } from '@mantine/core';
import confetti from 'canvas-confetti';
import { useAuth } from '../../hooks/useAppStore';
import { holdUpdate } from '../../utils/updateGate';
import { MONTH_CLEARED_EVENT, TROPHY_LANDED_EVENT, TROPHY_PENDING_EVENT } from '../../utils/appEvents';
import { mrApi } from '../../api/mrApi';
import TrophyMascot, { TrophyIcon } from './TrophyMascot';

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

const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-09" -> "September" (adds the year when it isn't this year). */
function monthName(key) {
  const [year, month] = key.split('-').map(Number);
  return `${LONG[month - 1]}${year === new Date().getFullYear() ? '' : ` ${year}`}`;
}
/** "October", "October & November", "September, October & November". */
function monthsText(items) {
  const names = items.map((m) => monthName(m.month));
  return names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

// Timeline (ms): veil, mascot jumps in holding the trophy, dances (words +
// confetti), steps forward holding it out, trophy flies to the counter.
const T = { enter: 120, dance: 900, present: 3500, fly: 5000, land: 5850 };

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * Month cleared: the big moment. The screen dims to a night sky with turning
 * gold rays; the Sales King jumps in holding a gold trophy and dances
 * ("Shabaash, Rahul! All October invoices cleared"); it steps forward and
 * holds the trophy out to the MR; the trophy flies into the 🏆 counter in the
 * top bar, which bumps up with confetti. Several months clear together in one
 * celebration. A tap skips to the end. With reduced motion: a calm card.
 * When the month closes last financial year: "FY 2026-27 closed with 12
 * trophies" and the counter starts fresh.
 * Months cleared by an Admin (or that ended after being cleared) show the
 * next time the MR opens the app.
 */
export default function MonthCleared() {
  const { user } = useAuth();
  // Months being celebrated together, and any that arrive meanwhile (shown next).
  const [show, setShow] = useState({ batch: null, waiting: [] });
  const batch = show.batch;
  const [stage, setStage] = useState('');     // enter | dance | present | fly | land
  const [flight, setFlight] = useState(null); // { from, to } rects for the flying trophy
  const heroRef = useRef(null);
  const timers = useRef([]);

  useEffect(() => {
    const add = (event) => setShow((s) => (s.batch
      ? { ...s, waiting: [...s.waiting, ...(event.detail || [])] }
      : { batch: event.detail?.length ? event.detail : null, waiting: [] }));
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

  useEffect(() => (batch ? holdUpdate() : undefined), [batch]);

  const finish = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = [];
    window.dispatchEvent(new CustomEvent(TROPHY_LANDED_EVENT));
    setStage(''); setFlight(null);
    setShow((s) => ({ batch: s.waiting.length ? s.waiting : null, waiting: [] }));
  }, []);

  useEffect(() => {
    if (!batch) return undefined;
    const at = (ms, fn) => timers.current.push(setTimeout(fn, ms));
    window.dispatchEvent(new CustomEvent(TROPHY_PENDING_EVENT, { detail: batch.map((m) => m.month) }));
    try { navigator.vibrate?.([40, 60, 40, 60, 80]); } catch { /* not supported */ }
    if (reducedMotion()) {
      at(0, () => setStage('calm'));
      at(3200, finish);
      return () => { timers.current.forEach(clearTimeout); timers.current = []; };
    }
    const colors = ['#fcc419', '#40c057', '#2f9e44', '#ffffff', '#4dabf7', '#ff8fa3', '#845ef7'];
    at(T.enter, () => setStage('enter'));
    at(T.dance, () => {
      setStage('dance');
      confetti({ particleCount: 120, spread: 100, startVelocity: 38, gravity: 0.85, ticks: 260, origin: { y: 0.25 }, zIndex: 2001, colors });
      confetti({ particleCount: 50, angle: 60, spread: 55, startVelocity: 45, origin: { x: 0, y: 0.6 }, zIndex: 2001, colors });
      confetti({ particleCount: 50, angle: 120, spread: 55, startVelocity: 45, origin: { x: 1, y: 0.6 }, zIndex: 2001, colors });
    });
    at(T.present, () => setStage('present'));
    at(T.fly, () => {
      const trophy = heroRef.current?.querySelector('[data-trophy]')?.getBoundingClientRect();
      const counter = document.getElementById('trophy-counter')?.getBoundingClientRect();
      if (trophy && counter) setFlight({ from: trophy, to: counter, go: false });
      setStage('fly');
      requestAnimationFrame(() => requestAnimationFrame(() => setFlight((f) => (f ? { ...f, go: true } : f))));
    });
    at(T.land, finish);
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [batch, finish]);

  if (!batch) return null;
  const first = (user?.name || '').trim().split(/\s+/)[0];
  const closed = batch.find((m) => m.fy_closed)?.fy_closed;
  const f = flight;
  const flyStyle = f && (f.go
    ? { left: f.to.left + 6, top: f.to.top + (f.to.height - 18) / 2, width: 18, height: 18 }
    : { left: f.from.left, top: f.from.top, width: f.from.width, height: f.from.height });
  return (
    <Portal>
      <style>{CSS}</style>
      <div className={`mc-stage mc-${stage}`} role="status" aria-live="polite" onClick={finish}
        aria-label={`Shabaash${first ? `, ${first}` : ''}! All ${monthsText(batch)} invoices cleared.${closed ? ` ${closed.label} closed with ${closed.trophies} trophies.` : ''}`}>
        <div className="mc-veil" />
        <div className="mc-rays" />
        <div className="mc-words" aria-hidden>
          <div className="mc-big">Shabaash{first ? `, ${first}` : ''}!</div>
          <div className="mc-small">All <b>{monthsText(batch)}</b> invoices cleared 🎉</div>
          {closed && <div className="mc-fy">🏆 {closed.label} closed with {closed.trophies} {closed.trophies === 1 ? 'trophy' : 'trophies'} · new season starts!</div>}
        </div>
        <div className="mc-hero" ref={heroRef} aria-hidden>
          <div className="mc-dancer"><TrophyMascot size={210} hideTrophy={stage === 'fly'} /></div>
        </div>
        {stage === 'calm' && <div className="mc-calm" aria-hidden><TrophyIcon size={72} /></div>}
        {f && <div className="mc-fly" style={flyStyle} aria-hidden><TrophyIcon size={f.from.width} /></div>}
        <div className="mc-skip" aria-hidden>Tap to continue</div>
      </div>
    </Portal>
  );
}

const CSS = `
.mc-stage{position:fixed;inset:0;z-index:2000;cursor:pointer;overflow:hidden}
.mc-veil{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(52,40,110,.88),rgba(10,10,22,.94));opacity:0;transition:opacity 450ms}
.mc-rays{position:absolute;left:50%;top:52%;width:150vmax;height:150vmax;margin:-75vmax 0 0 -75vmax;border-radius:50%;opacity:0;transition:opacity 700ms;
  background:repeating-conic-gradient(from 0deg,rgba(255,214,90,.20) 0deg 9deg,rgba(255,214,90,0) 9deg 22deg);
  -webkit-mask:radial-gradient(circle,#000 6%,transparent 34%);mask:radial-gradient(circle,#000 6%,transparent 34%);animation:mc-spin 16s linear infinite}
.mc-words{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 13vh);width:min(92vw,440px);transform:translate(-50%,-10px) scale(.7);opacity:0;text-align:center;transition:all 450ms cubic-bezier(.2,1.6,.4,1)}
.mc-big{font-size:clamp(26px,8vw,36px);font-weight:800;color:#ffe066;letter-spacing:.3px;text-shadow:0 2px 0 #b07d00,0 8px 22px rgba(0,0,0,.45)}
.mc-small{display:inline-block;margin-top:8px;font-size:15px;color:#fff;background:rgba(255,255,255,.13);padding:6px 14px;border-radius:99px}
.mc-small b{color:#8ce99a;font-weight:700}
.mc-fy{margin:10px auto 0;font-size:14px;font-weight:600;color:#ffe066;background:rgba(250,176,5,.16);border:1px solid rgba(250,176,5,.45);padding:6px 12px;border-radius:12px;width:fit-content}
.mc-hero{position:absolute;left:50%;top:100%;transform:translateX(-50%);transition:top 700ms cubic-bezier(.2,1.35,.4,1),transform 650ms cubic-bezier(.3,1.4,.5,1)}
.mc-hero svg{display:block;filter:drop-shadow(0 14px 28px rgba(0,0,0,.45))}
.mc-skip{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);text-align:center;font-size:12px;color:rgba(255,255,255,.55);opacity:0;transition:opacity 400ms 1.2s}
.mc-fly{position:fixed;z-index:2002;transition:left 800ms cubic-bezier(.55,0,.25,1),top 800ms cubic-bezier(.55,.1,.3,1),width 800ms,height 800ms;filter:drop-shadow(0 6px 14px rgba(250,176,5,.6))}
.mc-fly svg{width:100%;height:100%}
.mc-calm{position:absolute;left:50%;top:45%;transform:translate(-50%,-50%)}
.mc-enter .mc-veil,.mc-dance .mc-veil,.mc-present .mc-veil,.mc-fly .mc-veil,.mc-calm .mc-veil{opacity:1}
.mc-enter .mc-rays,.mc-dance .mc-rays,.mc-present .mc-rays{opacity:1}
.mc-enter .mc-hero,.mc-dance .mc-hero{top:34%}
.mc-dance .mc-dancer{animation:mc-dance 760ms ease-in-out infinite;transform-origin:50% 100%}
.mc-dance .mc-words,.mc-present .mc-words,.mc-calm .mc-words{opacity:1;transform:translate(-50%,0) scale(1)}
.mc-dance .mc-skip,.mc-present .mc-skip{opacity:1}
.mc-present .mc-hero{top:40%;transform:translateX(-50%) scale(1.55)}
.mc-present .mc-words{top:calc(env(safe-area-inset-top,0px) + 7vh)}
.mc-present .mc-dancer{animation:mc-offer 1500ms ease-in-out both;transform-origin:50% 100%}
.mc-fly .mc-hero{top:110%;transition:top 550ms ease-in 250ms}
.mc-fly .mc-veil{opacity:0;transition:opacity 600ms 300ms}
.mc-calm .mc-words{top:22vh}
@keyframes mc-dance{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-14px) rotate(-6deg)}50%{transform:translateY(0) rotate(0)}75%{transform:translateY(-14px) rotate(6deg)}}
@keyframes mc-spin{to{transform:rotate(360deg)}}
@keyframes mc-offer{0%{transform:translateY(0) rotate(0)}30%{transform:translateY(-10px) rotate(0)}55%{transform:translateY(6px) rotate(0) scale(1.04)}100%{transform:translateY(0) rotate(0) scale(1.04)}}
@media (prefers-reduced-motion: reduce){.mc-stage *{animation:none!important;transition:none!important}}
`;

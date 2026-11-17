import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAppStore';
import { useGreeting } from '../../hooks/useGreeting';
import { crownFor } from '../../utils/crown';
import { dailyLine, todayKey } from '../../utils/dailyLine';
import classes from './DailyWelcome.module.css';

const SEEN_KEY = 'daily-welcome';
const SHOW_MS = 2200;

function seenToday(userId) {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')[userId] === todayKey(); } catch { return false; }
}
function markSeen(userId) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seen, [userId]: todayKey() }));
  } catch { /* storage off: it may show again, that's fine */ }
}

/**
 * First open of the day (after 5 AM): 👑, "Good morning, Rahul" and the day's
 * line for ~2 seconds, then it fades into the app. A tap skips it.
 */
export default function DailyWelcome() {
  const { user } = useAuth();
  const greeting = useGreeting();
  const userId = user?.id;
  const [state, setState] = useState('hidden'); // hidden | shown | leaving
  const leave = useCallback(() => setState((current) => (current === 'shown' ? 'leaving' : current)), []);

  useEffect(() => {
    if (!userId || !user?.name || new Date().getHours() < 5 || seenToday(userId)) return undefined;
    // Marked seen only once it actually shows (effects can run twice).
    const show = setTimeout(() => { markSeen(userId); setState('shown'); }, 0);
    const timer = setTimeout(leave, SHOW_MS);
    return () => { clearTimeout(show); clearTimeout(timer); };
  }, [userId, user?.name, leave]);

  if (state === 'hidden') return null;
  const firstName = user.name.trim().split(/\s+/)[0];
  return (
    <div
      className={`${classes.screen} ${state === 'leaving' ? classes.leaving : ''}`}
      role="dialog"
      aria-label="Welcome"
      onClick={leave}
      onAnimationEnd={(event) => { if (state === 'leaving' && event.target === event.currentTarget) setState('hidden'); }}
    >
      <div className={classes.crown} aria-hidden>{crownFor(user)}</div>
      <div className={classes.hello}>{greeting}, {firstName}</div>
      <div className={classes.line}>{dailyLine(userId)}</div>
    </div>
  );
}

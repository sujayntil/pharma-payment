import { useEffect } from 'react';
import { Group, Portal, Text, ThemeIcon } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import '@fontsource/permanent-marker/400.css';
import confetti from 'canvas-confetti';
import { money } from '../../utils/formatters';
import { holdUpdate } from '../../utils/updateGate';
import { useAuth } from '../../hooks/useAppStore';
import { royalWords } from '../../utils/crown';
import SalesKingMascot from './SalesKingMascot';
import { HEADLINES } from './celebrationText';

const SHOW_MS = 3000; // long enough to enjoy, closes on a tap too
const ADMIN_SHOW_MS = 2200;

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * "Well done, Sales King!" after an MR saves a collection: the crowned
 * capsule mascot bounces in, the words appear in spray-paint graffiti, then
 * a green tick with the amount (and what is left on a part payment).
 * Confetti only when the invoice is cleared; a part payment gets the mascot
 * and words without confetti, plus what is left to collect.
 * Closes by itself after ~2s or on a tap. Android phones get a short buzz;
 * with "reduce motion" on there is no confetti, only the tick and text.
 *
 * celebration: { amount, left, cleared, customer } or null.
 * variant 'admin': the mascot dancing and a big green tick; no confetti,
 * no graffiti words, a little shorter.
 */
export default function CollectionCelebration({ celebration, onDone }) {
  const { user } = useAuth();
  // The celebration (and the Undo bar after it) plays out before any update screen.
  useEffect(() => (celebration ? holdUpdate() : undefined), [celebration]);
  useEffect(() => {
    if (!celebration) return undefined;
    const reduced = prefersReducedMotion();
    const isAdmin = celebration.variant === 'admin';
    if (!reduced && !isAdmin) {
      const colors = ['#40c057', '#2f9e44', '#fcc419', '#ffffff', '#ff6b6b', '#4dabf7'];
      if (celebration.cleared) {
        confetti({ particleCount: 140, spread: 80, startVelocity: 45, origin: { y: 0.65 }, zIndex: 1000, colors, disableForReducedMotion: true });
        setTimeout(() => {
          confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, zIndex: 1000, colors, disableForReducedMotion: true });
          confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, zIndex: 1000, colors, disableForReducedMotion: true });
        }, 250);
      }
    }
    try { navigator.vibrate?.(celebration.cleared ? [40, 60, 40] : 30); } catch { /* not supported */ }
    const timer = setTimeout(onDone, isAdmin ? ADMIN_SHOW_MS : SHOW_MS);
    return () => clearTimeout(timer);
  }, [celebration, onDone]);

  if (!celebration) return null;
  const { amount, left, cleared, customer, headline, detail } = celebration;
  if (celebration.variant === 'admin') {
    return (
      <Portal>
        <div
          role="status"
          aria-live="polite"
          aria-label={`${money(amount)} collected${cleared ? '. Invoice cleared.' : left > 0 ? `, ${money(left)} left` : ''}`}
          onClick={onDone}
          className="sk-backdrop"
        >
          <style>{CELEBRATION_CSS}</style>
          <div className="sk-card">
            <div className="sk-dance"><SalesKingMascot size={130} /></div>
            <ThemeIcon className="sk-tick sk-big-tick" size={64} radius="xl" color="green" aria-hidden><IconCheck size={40} stroke={3} /></ThemeIcon>
            <Text fw={700} fz={20} ta="center" mt={8}>
              {money(amount)} collected{!cleared && left > 0 ? <Text span c="dimmed" fw={500} fz={15}> · {money(left)} left</Text> : null}
            </Text>
            {customer && <Text size="sm" c="dimmed" ta="center" style={{ overflowWrap: 'anywhere' }}>{customer}</Text>}
          </div>
        </div>
      </Portal>
    );
  }
  const [lead, king] = splitHeadline(royalWords(headline || (cleared ? HEADLINES.cleared[0] : HEADLINES.part[0]), user));
  return (
    <Portal>
      <div
        role="status"
        aria-live="polite"
        aria-label={`${lead} ${king}. ${money(amount)} collected${cleared ? '. Invoice cleared.' : left > 0 ? `, ${money(left)} left` : ''}`}
        onClick={onDone}
        className="sk-backdrop"
      >
        <style>{CELEBRATION_CSS}</style>
        <div className="sk-card">
          <Splats />
          <div className="sk-mascot"><SalesKingMascot size={150} /></div>
          <div className="sk-graffiti" aria-hidden>
            <span className="sk-lead">{lead}</span>
            <span className="sk-king">{king}</span>
          </div>
          {/* Green tick: the collection is saved (part and full alike). */}
          <Group gap={8} mt={10} justify="center" wrap="nowrap" style={{ position: 'relative' }}>
            <ThemeIcon className="sk-tick" size={30} radius="xl" color="green" aria-hidden><IconCheck size={19} stroke={3} /></ThemeIcon>
            <Text fw={700} fz={18} ta="center">
              {money(amount)} collected{!cleared && left > 0 ? <Text span c="dimmed" fw={500} fz={15}> · {money(left)} left</Text> : null}
            </Text>
          </Group>
          {/* "Invoice cleared", or for a split collection "2 invoices cleared". */}
          {(detail || cleared) && <Text size="sm" fw={600} c="green.8" ta="center" style={{ position: 'relative' }}>{detail || 'Invoice cleared'}</Text>}
          {customer && <Text size="sm" c="dimmed" ta="center" style={{ position: 'relative', overflowWrap: 'anywhere' }}>{customer}</Text>}
        </div>
      </div>
    </Portal>
  );
}

function splitHeadline(text) {
  const words = text.split(' ');
  return [words.slice(0, -2).join(' '), words.slice(-2).join(' ')];
}

/** Spray-paint splats and drips behind the words. */
function Splats() {
  return (
    <svg className="sk-splats" viewBox="0 0 300 260" preserveAspectRatio="none" aria-hidden>
      <g opacity="0.9">
        <path d="M40 150 q-18 -30 10 -44 q24 -14 40 8 q22 -10 30 12 q16 22 -8 34 q-6 26 -36 18 q-26 8 -36 -28 z" fill="#d3f9d8" />
        <rect x="58" y="176" width="5" height="26" rx="2.5" fill="#d3f9d8" />
        <circle cx="60.5" cy="204" r="4" fill="#d3f9d8" />
        <path d="M200 130 q4 -30 36 -26 q30 2 30 30 q14 20 -10 34 q-14 22 -40 8 q-30 -6 -16 -46 z" fill="#fff3bf" />
        <rect x="236" y="168" width="5" height="34" rx="2.5" fill="#fff3bf" />
        <circle cx="238.5" cy="205" r="4.5" fill="#fff3bf" />
        <circle cx="30" cy="40" r="6" fill="#ffc9c9" />
        <circle cx="46" cy="28" r="3" fill="#ffc9c9" />
        <circle cx="270" cy="50" r="7" fill="#d0ebff" />
        <circle cx="256" cy="34" r="3" fill="#d0ebff" />
        <circle cx="150" cy="236" r="5" fill="#d3f9d8" />
        <circle cx="170" cy="246" r="2.5" fill="#d3f9d8" />
      </g>
    </svg>
  );
}

const CELEBRATION_CSS = `
.sk-backdrop{position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;background:var(--app-celebrate-veil);animation:sk-fade 160ms ease-out}
.sk-card{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding:18px 22px 22px;min-width:270px;max-width:88vw;background:var(--mantine-color-body);border-radius:22px;box-shadow:0 14px 44px rgba(0,0,0,0.18);animation:sk-pop 360ms cubic-bezier(.2,1.4,.4,1)}
.sk-splats{position:absolute;inset:0;width:100%;height:100%}
.sk-mascot{position:relative;animation:sk-bounce 900ms ease-in-out 360ms infinite alternate;transform-origin:50% 100%}
.sk-graffiti{position:relative;display:flex;flex-direction:column;align-items:center;margin-top:2px;transform:rotate(-5deg);font-family:'Permanent Marker',cursive;line-height:1.02;text-align:center}
.sk-lead{font-size:22px;color:#2f9e44;-webkit-text-stroke:1px #1b1b1b;text-shadow:2px 2px 0 rgba(0,0,0,0.12)}
.sk-king{font-size:38px;color:#fcc419;-webkit-text-stroke:2px #1b1b1b;paint-order:stroke fill;text-shadow:3px 3px 0 #2f9e44,5px 5px 0 rgba(0,0,0,0.15);animation:sk-spray 420ms ease-out 140ms both;white-space:nowrap}
@keyframes sk-tick{0%{transform:scale(0)}70%{transform:scale(1.25)}100%{transform:scale(1)}}
.sk-tick{flex-shrink:0;animation:sk-tick 380ms cubic-bezier(.2,1.4,.4,1) 260ms both}
/* Admin: the mascot dances (sway + hop), big tick pops in under it. */
.sk-dance{animation:sk-dance 700ms ease-in-out 200ms infinite;transform-origin:50% 100%}
@keyframes sk-dance{0%{transform:translateY(0) rotate(0)}25%{transform:translateY(-10px) rotate(-8deg)}50%{transform:translateY(0) rotate(0)}75%{transform:translateY(-10px) rotate(8deg)}100%{transform:translateY(0) rotate(0)}}
.sk-big-tick{margin-top:-6px;box-shadow:0 4px 14px rgba(47,158,68,.35)}
@keyframes sk-fade{from{opacity:0}to{opacity:1}}
@keyframes sk-pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes sk-bounce{from{transform:translateY(0) rotate(-3deg)}to{transform:translateY(-8px) rotate(3deg)}}
@keyframes sk-spray{0%{opacity:0;transform:scale(1.4);filter:blur(4px)}100%{opacity:1;transform:scale(1);filter:blur(0)}}
@media (prefers-reduced-motion: reduce){.sk-card,.sk-mascot,.sk-dance,.sk-king,.sk-backdrop,.sk-tick{animation:none!important}}
`;

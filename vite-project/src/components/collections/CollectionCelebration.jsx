import { useEffect } from 'react';
import { Portal, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import confetti from 'canvas-confetti';
import { money } from '../../utils/formatters';

const SHOW_MS = 2200;

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * Short "well done" after an MR saves a collection.
 *   cleared: big confetti + "Invoice cleared!"
 *   part:    a green tick + "₹5,000 collected · ₹2,400 left" (no confetti)
 * Closes by itself after ~2s or on a tap. Android phones get a short buzz;
 * with "reduce motion" on there is no confetti, only the tick and text.
 *
 * celebration: { amount, left, cleared, customer } or null.
 */
export default function CollectionCelebration({ celebration, onDone }) {
  useEffect(() => {
    if (!celebration) return undefined;
    const reduced = prefersReducedMotion();
    if (celebration.cleared && !reduced) {
      const colors = ['#40c057', '#2f9e44', '#fab005', '#ffffff', '#228be6'];
      confetti({ particleCount: 140, spread: 80, startVelocity: 45, origin: { y: 0.65 }, zIndex: 1000, colors, disableForReducedMotion: true });
      setTimeout(() => {
        confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, zIndex: 1000, colors, disableForReducedMotion: true });
        confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, zIndex: 1000, colors, disableForReducedMotion: true });
      }, 250);
    }
    try { navigator.vibrate?.(celebration.cleared ? [40, 60, 40] : 30); } catch { /* not supported */ }
    const timer = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(timer);
  }, [celebration, onDone]);

  if (!celebration) return null;
  const { amount, left, cleared, customer } = celebration;
  return (
    <Portal>
      <div
        role="status"
        aria-live="polite"
        onClick={onDone}
        style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.72)', animation: 'celebrate-fade 160ms ease-out' }}
      >
        <style>{'@keyframes celebrate-fade{from{opacity:0}to{opacity:1}}@keyframes celebrate-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}@media (prefers-reduced-motion: reduce){.celebrate-pop{animation:none!important}}'}</style>
        <Stack
          className="celebrate-pop"
          align="center"
          gap={6}
          p="xl"
          style={{ background: 'var(--mantine-color-body)', borderRadius: 20, boxShadow: '0 12px 40px rgba(0,0,0,0.15)', minWidth: 260, maxWidth: '86vw', animation: 'celebrate-pop 320ms ease-out' }}
        >
          <ThemeIcon size={cleared ? 76 : 60} radius="xl" color="green">
            <IconCheck size={cleared ? 44 : 34} stroke={3} />
          </ThemeIcon>
          {cleared && <Text fw={800} fz={22} mt={6}>Invoice cleared!</Text>}
          <Text fw={700} fz={cleared ? 18 : 20} mt={cleared ? 0 : 6} ta="center">
            {money(amount)} collected{!cleared && left > 0 ? <Text span c="dimmed" fw={500} fz={16}> · {money(left)} left</Text> : null}
          </Text>
          {customer && <Text size="sm" c="dimmed" ta="center" style={{ overflowWrap: 'anywhere' }}>{customer}</Text>}
        </Stack>
      </div>
    </Portal>
  );
}

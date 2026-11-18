import { useEffect, useRef, useState } from 'react';
import { Drawer, Group, Modal, Stack, Text, UnstyledButton } from '@mantine/core';
import confetti from 'canvas-confetti';
import { mrApi } from '../../api/mrApi';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import { useIsMobile } from '../../hooks/useIsMobile';
import { TROPHY_LANDED_EVENT, TROPHY_PENDING_EVENT } from '../../utils/appEvents';
import { TrophyIcon } from './TrophyMascot';
import css from './TrophyCounter.module.css';

/**
 * 🏆 count in the MR's top bar: months they have fully cleared (this FY, plus
 * last FY until all of last FY's bills are paid). Tap for "Your trophies",
 * grouped by financial year. The month-cleared celebration flies its trophy
 * here; on landing the count reloads, bumps and pops a little confetti.
 */
export default function TrophyCounter({ size = 34 }) {
  const isMobile = useIsMobile();
  const appRefresh = useAppRefresh();
  const [data, setData] = useState(null);
  const [opened, setOpened] = useState(false);
  const [bump, setBump] = useState(0);
  const [pending, setPending] = useState([]); // trophies still flying: shown once they land
  const ref = useRef(null);

  useEffect(() => {
    let alive = true;
    mrApi.getTrophies().then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [appRefresh, bump]);

  useEffect(() => {
    const flying = (event) => setPending(event.detail || []);
    const landed = () => {
      setPending([]);
      setBump((n) => n + 1);
      const r = ref.current?.getBoundingClientRect();
      if (r && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        confetti({ particleCount: 40, spread: 70, startVelocity: 22, scalar: 0.7, ticks: 90, zIndex: 3000,
          origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight },
          colors: ['#fcc419', '#40c057', '#4dabf7', '#ff8fa3', '#ffffff'] });
      }
    };
    window.addEventListener(TROPHY_PENDING_EVENT, flying);
    window.addEventListener(TROPHY_LANDED_EVENT, landed);
    return () => { window.removeEventListener(TROPHY_PENDING_EVENT, flying); window.removeEventListener(TROPHY_LANDED_EVENT, landed); };
  }, []);

  // Until the celebration's trophy lands, show the count without it.
  const shown = Math.max(0, (data?.count ?? 0) - pending.filter((m) => data?.counted_months?.includes(m)).length);

  const list = (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        One trophy for every month whose bills you fully collected. The counter shows {data?.fy_label || 'this financial year'}
        {data?.carry_fy_label ? `, plus ${data.carry_fy_label} until all its bills are paid` : ''}.
      </Text>
      {!data?.groups?.length && <Text size="sm">No trophies yet. Clear all of a month's bills to win your first 🏆</Text>}
      {data?.groups?.map((g) => (
        <div key={g.fy}>
          <Group justify="space-between" mb={6}><Text fw={700} size="sm">{g.label}</Text><Text size="sm" c="dimmed">{g.months.length} 🏆</Text></Group>
          <div className={css.list}>
            {g.months.map((m) => (
              <div key={m.month} className={css.item}>
                <TrophyIcon size={22} />
                <div style={{ flex: 1, minWidth: 0 }}><Text size="sm" fw={600}>{m.label}</Text>{m.cleared_on && <Text size="xs" c="dimmed">Cleared {new Date(`${m.cleared_on}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Stack>
  );

  return (
    <>
      <UnstyledButton ref={ref} id="trophy-counter" key={bump} className={css.pill} data-bump={bump > 0 || undefined} style={{ height: size }} onClick={() => setOpened(true)} aria-label={`Trophies: ${shown}`}>
        <TrophyIcon size={isMobile ? 16 : 18} /><span>{shown}</span>
      </UnstyledButton>
      {isMobile
        ? <Drawer opened={opened} onClose={() => setOpened(false)} position="bottom" size="auto" title={<Text fw={700}>Your trophies 🏆</Text>} radius="lg">{list}</Drawer>
        : <Modal opened={opened} onClose={() => setOpened(false)} title={<Text fw={700}>Your trophies 🏆</Text>} centered>{list}</Modal>}
    </>
  );
}

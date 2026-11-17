import { useEffect, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { holdUpdate } from '../../utils/updateGate';

export const UNDO_SECONDS = 15;

/** Undo bar body: message, Undo with seconds left, and a line filling left to right. */
export default function UndoCountdown({ message, onUndo, onEnd }) {
  const [left, setLeft] = useState(UNDO_SECONDS);
  const [started, setStarted] = useState(false);
  // The Undo bar finishes before any "Update available" screen.
  useEffect(() => holdUpdate(), []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setStarted(true));
    const tick = setInterval(() => setLeft((value) => Math.max(value - 1, 0)), 1000);
    const end = setTimeout(onEnd, UNDO_SECONDS * 1000);
    return () => { cancelAnimationFrame(frame); clearInterval(tick); clearTimeout(end); };
  }, [onEnd]);
  return (
    <>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm" fw={600}>{message}</Text>
        <Button size="compact-sm" variant="subtle" color="green" onClick={onUndo} style={{ flexShrink: 0 }}>
          Undo <Text span size="xs" c="dimmed" ml={6} fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>{left}</Text>
        </Button>
      </Group>
      {/* Time left: a line filling left to right. */}
      <div aria-hidden style={{ marginTop: 8, height: 3, borderRadius: 2, overflow: 'hidden', background: 'var(--mantine-color-green-1)' }}>
        <div style={{
          height: '100%',
          width: started ? '100%' : '0%',
          background: 'var(--mantine-color-green-6)',
          transition: `width ${UNDO_SECONDS}s linear`,
        }} />
      </div>
    </>
  );
}

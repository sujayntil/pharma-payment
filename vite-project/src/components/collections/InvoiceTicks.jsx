import { ActionIcon, Button, Checkbox, Group, Paper, Text } from '@mantine/core';
import { IconCash, IconX } from '@tabler/icons-react';
import { money } from '../../utils/formatters';

/** Tick box for a table row (pending invoices only). */
export function TickCell({ ticks, invoice }) {
  if (!(Number(invoice.pending_amount) > 0)) return null;
  return <Checkbox color="green" checked={ticks.isTicked(invoice)} onChange={() => ticks.toggle(invoice)} aria-label={`Select ${invoice.invoice_number}`} />;
}

/** Header tick: select every pending invoice in the table. */
export function TickAllCell({ ticks, invoices }) {
  if (!invoices.some((invoice) => Number(invoice.pending_amount) > 0)) return null;
  const all = ticks.allTicked(invoices);
  return <Checkbox color="green" checked={all} indeterminate={!all && ticks.count > 0} onChange={() => ticks.selectAll(invoices)} aria-label="Select all" />;
}

/** Bottom bar while something is ticked: ✕  ₹ total · N   Select all  Collect. */
export function TickedBar({ ticks, invoices, onCollect, bottom = 8 }) {
  if (!ticks.count) return null;
  const all = ticks.allTicked(invoices || []);
  return (
    <Paper withBorder shadow="md" radius="md" p="xs" pl={4}
      style={{ position: 'sticky', bottom, zIndex: 3 }}>
      <Group justify="space-between" wrap="nowrap" gap={6}>
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <ActionIcon variant="subtle" color="gray" size="lg" onClick={ticks.clear} aria-label="Clear selection"><IconX size={18} /></ActionIcon>
          <div style={{ minWidth: 0 }}>
            <Text fw={700} lh={1.2} style={{ whiteSpace: 'nowrap' }}>{money(ticks.total)}</Text>
            <Text size="xs" c="dimmed" lh={1.2} truncate="end">{ticks.count} selected</Text>
          </div>
        </Group>
        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
          {/* Hidden once everything shown is ticked; ✕ clears. */}
          {invoices && !all && <Button variant="subtle" color="gray" px={8} onClick={() => ticks.selectAll(invoices)}>Select all</Button>}
          <Button leftSection={<IconCash size={16} />} onClick={onCollect}>Collect</Button>
        </Group>
      </Group>
    </Paper>
  );
}

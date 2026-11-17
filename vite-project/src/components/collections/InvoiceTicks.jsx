import { ActionIcon, Button, Checkbox, Group, Paper, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCash, IconTrash, IconX } from '@tabler/icons-react';
import { money } from '../../utils/formatters';

/** Tick box for a table row (only rows the list allows, e.g. pending invoices). */
export function TickCell({ ticks, invoice, label }) {
  if (!ticks.canTick(invoice)) return null;
  return <Checkbox color="green" checked={ticks.isTicked(invoice)} onChange={() => ticks.toggle(invoice)} aria-label={`Select ${label || invoice.invoice_number}`} />;
}

/** Header tick: select every pending invoice in the table. */
export function TickAllCell({ ticks, invoices }) {
  if (!invoices.some(ticks.canTick)) return null;
  const all = ticks.allTicked(invoices);
  return <Checkbox color="green" checked={all} indeterminate={!all && ticks.count > 0} onChange={() => ticks.selectAll(invoices)} aria-label="Select all" />;
}

export const DELETE_LIMIT = 20;

/**
 * Bottom bar while something is ticked: ✕  ₹ total · N   Select all  🗑  Collect.
 * onDelete (Admin): red bin left of Collect, up to 20 at a time.
 * showTotal false: just "N selected" (customers).
 */
export function TickedBar({ ticks, invoices, onCollect, onDelete, deleteLabel = 'Delete', showTotal = true, bottom = 8 }) {
  if (!ticks.count) return null;
  const all = ticks.allTicked(invoices || []);
  return (
    <Paper withBorder shadow="md" radius="md" p="xs" pl={4}
      style={{ position: 'sticky', bottom, zIndex: 3 }}>
      <Group justify="space-between" wrap="nowrap" gap={6}>
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <ActionIcon variant="subtle" color="gray" size="lg" onClick={ticks.clear} aria-label="Clear selection"><IconX size={18} /></ActionIcon>
          <div style={{ minWidth: 0 }}>
            {showTotal ? <>
              <Text fw={700} lh={1.2} style={{ whiteSpace: 'nowrap' }}>{money(ticks.total)}</Text>
              <Text size="xs" c="dimmed" lh={1.2} truncate="end">{ticks.count} selected</Text>
            </> : <Text fw={700} style={{ whiteSpace: 'nowrap' }}>{ticks.count} selected</Text>}
          </div>
        </Group>
        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
          {/* Hidden once everything shown is ticked; ✕ clears. */}
          {invoices && !all && <Button variant="subtle" color="gray" px={8} onClick={() => ticks.selectAll(invoices)}>Select all</Button>}
          {onDelete && (
            <Tooltip label={`${deleteLabel} (up to ${DELETE_LIMIT})`} withArrow>
              <ActionIcon variant="light" color="red" size="lg" aria-label={deleteLabel} onClick={() => {
                if (ticks.count > DELETE_LIMIT) {
                  notifications.show({ color: 'red', position: 'bottom-center', message: `Select up to ${DELETE_LIMIT} to delete at once.` });
                  return;
                }
                onDelete();
              }}><IconTrash size={18} /></ActionIcon>
            </Tooltip>
          )}
          {onCollect && <Button leftSection={<IconCash size={16} />} onClick={onCollect}>Collect</Button>}
        </Group>
      </Group>
    </Paper>
  );
}

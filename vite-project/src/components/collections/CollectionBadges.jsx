import { Badge, Group, Text, Tooltip } from '@mantine/core';
import { dateTime, money } from '../../utils/formatters';
import { STATUS_LABELS, recorderOf, useActorLabel } from './collectionUtils';

// Mantine's badge label can be a pixel or two narrower than its uppercase
// text and then adds an ellipsis; let the text show in full instead.
const FULL_LABEL = { label: { overflow: 'visible', textOverflow: 'clip' } };

const STATUS_COLORS = { PAID: 'green', PARTIAL: 'yellow', UNPAID: 'red' };

export function StatusBadge({ status }) {
  return <Badge color={STATUS_COLORS[status] || 'gray'} variant="light" style={{ whiteSpace: 'nowrap', flexShrink: 0, overflow: 'visible' }} styles={FULL_LABEL}>{STATUS_LABELS[status] || status}</Badge>;
}

/** Shown when an invoice's latest ledger entry is a reversal. */
export function ReversedBadge() {
  return <Badge color="orange" variant="light" style={{ whiteSpace: 'nowrap', flexShrink: 0, overflow: 'visible' }} styles={FULL_LABEL}>Reversed</Badge>;
}

/**
 * Shown next to an invoice when the latest collection entry is a reversal
 * ("Reversed"). Who did it is shown in the "Recorded by" column.
 */
export function AdminUpdateBadge({ row }) {
  if (!row?.last_collection_is_reversal) return null;
  const detail = `${money(Math.abs(row.last_collection_amount || 0))} reversed on ${dateTime(row.last_collection_at)}`;
  return (
    <Tooltip label={detail} withArrow multiline maw={260} events={{ hover: true, focus: true, touch: true }}>
      <span style={{ display: 'inline-flex', cursor: 'help' }}><ReversedBadge /></span>
    </Tooltip>
  );
  // Disabled: "Updated by Admin" badge -- replaced by the "Recorded by" column
  // ("Admin - <Name>"). Re-enable if needed:
  // if (!row?.last_collection_by_admin) return null;
  // const reversal = row.last_collection_is_reversal;
  // const label = reversal ? 'Reversed by Admin' : 'Updated by Admin';
  // return <Badge size="sm" variant="dot" color={reversal ? 'orange' : 'violet'}>{label}</Badge>;
}

export function StatusCell({ row }) {
  // Wraps instead of truncating when the column is narrow.
  return (
    <Group gap={6} wrap="wrap" style={{ minWidth: 'min-content' }}>
      <StatusBadge status={row.status ?? row.invoice_status} />
      <AdminUpdateBadge row={row} />
    </Group>
  );
}

/** "Recorded by" cell. The column header says "Recorded by"; this is only the value. */
export function RecordedBy({ row, size = 'sm' }) {
  const label = useActorLabel()(recorderOf(row));
  return (
    <Text span size={size} title={label} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{label}</Text>
  );
}

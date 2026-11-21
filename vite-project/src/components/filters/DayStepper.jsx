import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { formatDateLocal } from '../../utils/formatters';

const shift = (day, by) => {
  const [y, m, d] = day.split('-').map(Number);
  return formatDateLocal(new Date(y, m - 1, d + by));
};

/** With one day chosen: ‹ previous day · next day › around the date button. */
export default function DayStepper({ value, firstDate, onChange, children }) {
  const day = value?.from && value.from === value.to ? value.from : null;
  if (!day) return children;
  const today = formatDateLocal(new Date());
  const first = firstDate ? String(firstDate).slice(0, 10) : null;
  const go = (by) => { const next = shift(day, by); onChange({ from: next, to: next }); };
  return (
    <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
      <Tooltip label="Previous day" openDelay={400}>
        <ActionIcon variant="default" size={36} radius="md" aria-label="Previous day" disabled={Boolean(first) && day <= first} onClick={() => go(-1)}>
          <IconChevronLeft size={16} />
        </ActionIcon>
      </Tooltip>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
      <Tooltip label="Next day" openDelay={400}>
        <ActionIcon variant="default" size={36} radius="md" aria-label="Next day" disabled={day >= today} onClick={() => go(1)}>
          <IconChevronRight size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

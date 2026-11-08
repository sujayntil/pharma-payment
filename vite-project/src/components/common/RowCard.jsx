import { Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import classes from './RowCard.module.css';

/**
 * Phone-friendly replacement for a table row: title + amount on top,
 * status badges, a two-column detail grid, and actions that never scroll
 * off-screen.
 *
 * details: [{ label, value, full }] (falsy entries are skipped; full spans both columns)
 */
export default function RowCard({ title, subtitle, amount, amountLabel, amountColor, badges, details = [], actions, highlight, onClick }) {
  const shown = details.filter(Boolean);
  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      bg={highlight}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
      {...(onClick && {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } },
      })}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          <Text fw={700} lineClamp={2} style={{ overflowWrap: 'anywhere' }}>{title}</Text>
          {subtitle && <Text size="xs" c="dimmed">{subtitle}</Text>}
        </div>
        {amount != null && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <Text fw={700} c={amountColor} style={{ whiteSpace: 'nowrap' }}>{amount}</Text>
            {amountLabel && <Text size="xs" c="dimmed">{amountLabel}</Text>}
          </div>
        )}
      </Group>
      {badges && <Group gap={6} mt={8} wrap="wrap">{badges}</Group>}
      {shown.length > 0 && (
        <SimpleGrid cols={2} spacing="xs" verticalSpacing={6} mt="xs">
          {shown.map((detail) => (
            <div key={detail.label} style={{ minWidth: 0, gridColumn: detail.full ? '1 / -1' : undefined }}>
              <Text size="xs" c="dimmed">{detail.label}</Text>
              <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{detail.value}</Text>
            </div>
          ))}
        </SimpleGrid>
      )}
      {actions && (
        <Group className={classes.actions} gap="xs" mt="sm" justify="flex-end" wrap="wrap" onClick={(event) => event.stopPropagation()}>
          {actions}
        </Group>
      )}
    </Paper>
  );
}

/** Vertical list of RowCards. */
export function CardList({ children }) {
  return <Stack gap="xs">{children}</Stack>;
}

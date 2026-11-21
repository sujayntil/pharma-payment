import { Group, Paper, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

/**
 * Money/summary box that never breaks its number across lines. On narrow
 * phones (< 36em ≈ 576px) it becomes one compact row: label left, value right.
 */
export default function StatCard({ label, value, color, hint, bg, size = 'lg' }) {
  const narrow = useMediaQuery('(max-width: 35.99em)', false, { getInitialValueInEffect: false });
  const valueSize = size === 'lg' ? (narrow ? 20 : 26) : (narrow ? 16 : 18);
  const valueNode = <Text fw={700} fz={valueSize} c={color} style={{ whiteSpace: 'nowrap' }} data-stat-value>{value}</Text>;
  // size="slim": one short row (label left, number right) for list pages.
  if (size === 'slim') {
    return (
      <Paper withBorder px="md" py={10} bg={bg} data-stat>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm" c="dimmed" truncate title={hint || undefined}>{label}</Text>
          <Text fw={700} fz={narrow ? 17 : 20} c={color} style={{ whiteSpace: 'nowrap' }} data-stat-value>{value}</Text>
        </Group>
      </Paper>
    );
  }
  return (
    <Paper withBorder p={narrow ? 'sm' : 'md'} bg={bg} data-stat>
      {narrow ? (
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <div style={{ minWidth: 0 }}>
            <Text size="sm" c="dimmed">{label}</Text>
            {hint && <Text size="xs" c="dimmed">{hint}</Text>}
          </div>
          {valueNode}
        </Group>
      ) : (
        <>
          <Text size={size === 'lg' ? 'sm' : 'xs'} c="dimmed">{label}</Text>
          {valueNode}
          {hint && <Text size="xs" c="dimmed" data-stat-hint>{hint}</Text>}
        </>
      )}
    </Paper>
  );
}

import { Group, Paper, Progress, Text } from '@mantine/core';
import css from './DashboardParts.module.css';

const ZONE_TONES = {
  green: { background: 'var(--mantine-color-green-light)', color: 'var(--mantine-color-green-8)' },
  red: { background: 'var(--mantine-color-red-light)', color: 'var(--mantine-color-red-7)' },
  blue: { background: 'var(--mantine-color-blue-light)', color: 'var(--mantine-color-blue-7)' },
};

/** Section heading: coloured icon tile + bold title (+ optional detail, and an action on the right). */
export function ZoneHeading({ icon: Icon, tone, title, meta, children }) {
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap">
      <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
        <span className={css.zoneIcon} style={ZONE_TONES[tone]}><Icon size={18} stroke={2} /></span>
        <Text className={css.zone}>{title}</Text>
        {meta && <Text className={css.zoneMeta} truncate>{meta}</Text>}
      </Group>
      {children}
    </Group>
  );
}

/**
 * "59% of sales collected" bar with the paid / partially paid / unpaid line.
 * billed and pending are the same invoices' totals; loading shows a dash.
 */
export function CollectionBar({ billed, pending, paid = 0, partial = 0, unpaid = 0, loading = false, label = 'of sales collected' }) {
  const total = Number(billed || 0);
  const recovered = Math.max(0, total - Number(pending || 0));
  const rate = total > 0 ? Math.max(0, Math.min(100, Math.round((recovered / total) * 100))) : 0;
  return (
    <Paper p="md" className={css.card}>
      <Group justify="space-between" align="baseline" mb={8} gap="xs">
        <Text size="sm" c="dimmed"><Text span fw={700} c="var(--app-ink)" fz="md" className={css.num}>{loading ? '—' : `${rate}%`}</Text> {label}</Text>
      </Group>
      <Progress value={loading ? 0 : rate} color="green.7" size="md" radius="xl" transitionDuration={600} aria-label={`${rate}% ${label}`} />
      <div className={css.statusLine}>
        <span><i className={css.statusDot} style={{ background: 'var(--mantine-color-green-6)' }} /><b>{paid}</b> paid</span>
        <span><i className={css.statusDot} style={{ background: 'var(--mantine-color-yellow-6)' }} /><b>{partial}</b> partially paid</span>
        <span><i className={css.statusDot} style={{ background: 'var(--mantine-color-red-6)' }} /><b>{unpaid}</b> unpaid</span>
      </div>
    </Paper>
  );
}


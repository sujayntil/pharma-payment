import { Group, Text, Title } from '@mantine/core';
import classes from './TitleBar.module.css';

/** Small summary card for a page's title row ("Net collected ₹93,77,350"). */
export function MiniStat({ label, value, tone }) {
  return (
    <div className={classes.mini} data-tone={tone || undefined}>
      <Text className={classes.miniLabel}>{label}</Text>
      <Text className={classes.miniValue}>{value}</Text>
    </div>
  );
}

/**
 * Every Admin page's title row, the same everywhere: the title (and what
 * belongs right after it, e.g. tabs or "Saved") on the left; summary cards,
 * view switches and actions on the right, primary action last. On a phone
 * the right side drops under the title.
 */
export default function TitleBar({ title, left, children }) {
  return (
    <Group justify="space-between" wrap="wrap" gap="md" rowGap="xs" className={classes.bar}>
      <Group gap="md" wrap="nowrap" align="center" style={{ minWidth: 0 }}>
        <Title order={1} className={classes.title}>{title}</Title>
        {left}
      </Group>
      {children && <Group gap="xs" wrap="wrap" className={classes.right}>{children}</Group>}
    </Group>
  );
}

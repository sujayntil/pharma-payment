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
 * Laptop list pages: the title with its summary cards and actions on one
 * line, so the pinned top stays thin. left: things right after the title
 * (e.g. tabs); children: cards and buttons on the right.
 */
export default function TitleBar({ title, left, children }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md" className={classes.bar}>
      <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
        <Title order={1} className={classes.title}>{title}</Title>
        {left}
      </Group>
      <Group gap="xs" wrap="nowrap">{children}</Group>
    </Group>
  );
}

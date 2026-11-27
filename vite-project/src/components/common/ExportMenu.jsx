import { ActionIcon, Button, Menu, Tooltip } from '@mantine/core';
import { IconDownload, IconFileTypePdf, IconFileTypeXls } from '@tabler/icons-react';

/**
 * One Export button for every list: opens a small menu, Excel or PDF.
 * onExport(format) gets 'xlsx' or 'pdf'. iconOnly: the round icon button
 * used on phones.
 */
export default function ExportMenu({ onExport, loading = false, disabled = false, iconOnly = false, size = 'xs', label = 'Export' }) {
  const target = iconOnly
    ? (
      <Tooltip label={label} withArrow>
        <ActionIcon variant="default" size="lg" aria-label={label} loading={loading} disabled={disabled}><IconDownload size={16} /></ActionIcon>
      </Tooltip>
    )
    : <Button size={size} variant="default" leftSection={<IconDownload size={size === 'xs' ? 14 : 16} />} loading={loading} disabled={disabled}>{label}</Button>;
  return (
    <Menu position="bottom-end" shadow="md" withinPortal disabled={disabled || loading}>
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconFileTypeXls size={16} color="var(--mantine-color-green-7)" />} onClick={() => onExport('xlsx')}>Excel (.xlsx)</Menu.Item>
        <Menu.Item leftSection={<IconFileTypePdf size={16} color="var(--mantine-color-red-7)" />} onClick={() => onExport('pdf')}>PDF (.pdf)</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

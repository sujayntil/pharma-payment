import { SegmentedControl, Text, useMantineColorScheme } from '@mantine/core';
import { IconDeviceMobile, IconMoon, IconSun } from '@tabler/icons-react';
import { syncThemeColor } from '../../utils/themeColor';

const option = (Icon, label) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon size={14} />{label}</span>
);

/** Appearance: Light / Dark / System (follows the phone). Saved on this device. */
export default function AppearanceSwitch() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const pick = (value) => { setColorScheme(value); syncThemeColor(value); };
  return (
    <div style={{ padding: '6px 12px 8px' }}>
      <Text size="xs" c="dimmed" mb={6}>Appearance</Text>
      <SegmentedControl size="xs" fullWidth value={colorScheme} onChange={pick} aria-label="Appearance"
        data={[
          { value: 'light', label: option(IconSun, 'Light') },
          { value: 'dark', label: option(IconMoon, 'Dark') },
          { value: 'auto', label: option(IconDeviceMobile, 'System') },
        ]} />
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionIcon, Anchor, Badge, Box, Drawer, Group, Indicator, Loader, Popover, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { notificationsApi } from '../../api/notificationsApi';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import { useBackClose } from '../../hooks/useBackClose';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SWIPE_SHEET_CLASS, useSwipeDownToClose } from '../../hooks/useSwipeDownToClose';
import { dayOf, money, timeOf } from '../../utils/formatters';
import { BELL_REFRESH_EVENT } from '../../utils/appEvents';


// The bell shows the 5 newest collections; "See all collections" has the rest.
const BELL_SIZE = 5;

/** "2:01 pm" today, "Yesterday, 2:01 pm", else "14 Nov, 2:01 pm" (India time). */
function when(value) {
  const day = dayOf(value);
  const today = dayOf(new Date());
  const yesterday = dayOf(new Date(Date.now() - 86400000));
  if (day === today) return timeOf(value);
  if (day === yesterday) return `Yesterday, ${timeOf(value)}`;
  return `${day.replace(/ \d{4}$/, '')}, ${timeOf(value)}`;
}

/**
 * Admin bell in the top bar: the newest collections (and reversals).
 * A red count shows how many came in since the bell was last opened (by
 * someone else; the Admin's own entries are not news). Opening it marks
 * them seen on the server, so laptop and phone agree. Tapping an entry opens
 * that invoice on the Invoices page. Phone: bottom sheet; laptop: dropdown.
 */
export default function NotificationBell({ size = 38 }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const appRefresh = useAppRefresh();
  const [opened, setOpened] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  const close = useCallback(() => setOpened(false), []);
  useBackClose(opened && isMobile, close);
  useSwipeDownToClose(opened && isMobile, close);

  // Load now, on every refresh (button, pull, or the quiet one each minute), and when an alert arrives.
  useEffect(() => {
    let active = true;
    notificationsApi.recent(BELL_SIZE)
      .then((result) => { if (active) { setData(result); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appRefresh, tick]);
  useEffect(() => {
    // The minute-by-minute check comes from the app-wide quiet refresh.
    const again = () => setTick((value) => value + 1);
    window.addEventListener(BELL_REFRESH_EVENT, again);
    return () => window.removeEventListener(BELL_REFRESH_EVENT, again);
  }, []);

  const open = () => {
    setOpened(true);
    // Load the latest list (with its "new" dots), then mark it all seen.
    // The dots stay while the list is open; the red count clears now.
    notificationsApi.recent(BELL_SIZE)
      .then((result) => {
        setData({ ...result, unread: 0 }); setFailed(false);
        if (result.unread > 0) return notificationsApi.markSeen();
        return null;
      })
      .catch(() => {});
  };
  const toggle = () => (opened ? close() : open());
  const go = (path) => {
    close();
    // Let the sheet's Back entry settle first, so Back from the invoice
    // returns here in one press.
    setTimeout(() => navigate(path), isMobile ? 120 : 0);
  };

  const count = data.unread;
  const bell = (
    <Tooltip label={count ? `${count} new collection${count === 1 ? '' : 's'}` : 'Recent collections'} withArrow openDelay={250} disabled={opened}>
      <Indicator label={count > 9 ? '9+' : count} size={17} color="red" offset={5} disabled={!count} inline withBorder>
        <ActionIcon variant="default" radius="xl" size={size} onClick={toggle} aria-label={count ? `Recent collections, ${count} new` : 'Recent collections'} aria-expanded={opened}>
          <IconBell size={size > 34 ? 18 : 16} />
        </ActionIcon>
      </Indicator>
    </Tooltip>
  );

  const list = (
    <Stack gap={0}>
      {loading && !data.items.length ? <Group justify="center" p="lg"><Loader size="sm" /></Group>
        : failed && !data.items.length ? <Text size="sm" c="dimmed" ta="center" p="lg">Couldn't load collections. Check your connection.</Text>
          : !data.items.length ? <Text size="sm" c="dimmed" ta="center" p="lg">No collections yet.</Text>
            : data.items.map((item) => <BellItem key={item.payment_id} item={item} onOpen={() => go(`/admin/invoices?invoice=${item.invoice_id}`)} />)}
    </Stack>
  );
  const footer = (
    <Box px="md" py={10} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
      <Anchor component="button" type="button" size="sm" c="green.7" fw={600} onClick={() => go('/admin/collections')}>See all collections</Anchor>
    </Box>
  );

  if (isMobile) {
    return (
      <>
        {bell}
        <Drawer
          opened={opened}
          onClose={close}
          position="bottom"
          radius="lg"
          size="auto"
          title={<Text fw={700}>Recent collections</Text>}
          classNames={{ content: SWIPE_SHEET_CLASS }}
          styles={{ content: { maxHeight: '80dvh' }, body: { padding: 0 } }}
        >
          {list}
          {footer}
        </Drawer>
      </>
    );
  }
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={380} shadow="md" radius="md" offset={8} withinPortal>
      <Popover.Target>{bell}</Popover.Target>
      <Popover.Dropdown p={0}>
        <Group justify="space-between" px="md" py={10} style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
          <Text fw={700} size="sm">Recent collections</Text>
          {loading && <Loader size={14} />}
        </Group>
        <ScrollArea.Autosize mah={420} type="auto">{list}</ScrollArea.Autosize>
        {footer}
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 *   ● ₹2,000 · City Care Pharmacy              2:01 pm
 *     INV-1080 · Rahul · UPI
 */
function BellItem({ item, onOpen }) {
  const reversal = item.is_reversal;
  const by = item.recorded_by_me ? 'You' : item.recorded_by_name || 'Unknown';
  return (
    <UnstyledButton
      onClick={onOpen}
      px="md"
      py={10}
      style={{ display: 'block', width: '100%', borderBottom: '1px solid var(--mantine-color-gray-1)', background: item.is_new ? 'var(--mantine-color-green-0)' : undefined }}
      aria-label={`${reversal ? 'Reversal' : 'Collection'} ${money(Math.abs(item.amount))} for ${item.invoice_number}`}
    >
      <Group gap={10} wrap="nowrap" align="flex-start">
        <Box w={8} mt={7} style={{ flexShrink: 0 }}>
          {item.is_new && <Box w={8} h={8} bg="green.6" style={{ borderRadius: '50%' }} aria-label="New" />}
        </Box>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm" fw={600} truncate c={reversal ? 'orange.8' : undefined}>
              {reversal ? '−' : ''}{money(Math.abs(item.amount))}
              <Text span size="sm" fw={400} c="var(--mantine-color-text)"> · {item.customer_name || '—'}</Text>
            </Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{when(item.payment_date)}</Text>
          </Group>
          <Group gap={6} wrap="nowrap" mt={2}>
            <Text size="xs" c="dimmed" truncate>{[item.invoice_number, by, item.mode].filter(Boolean).join(' · ')}</Text>
            {reversal && <Badge size="xs" color="orange" variant="light">Reversal</Badge>}
          </Group>
        </Box>
      </Group>
    </UnstyledButton>
  );
}

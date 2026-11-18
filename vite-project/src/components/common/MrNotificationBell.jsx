import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionIcon, Badge, Box, Drawer, Group, Indicator, Loader, Popover, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { notificationsApi } from '../../api/notificationsApi';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import { useBackClose } from '../../hooks/useBackClose';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SWIPE_SHEET_CLASS, useSwipeDownToClose } from '../../hooks/useSwipeDownToClose';
import { dayOf, money, timeOf } from '../../utils/formatters';
import { BELL_REFRESH_EVENT } from '../../utils/appEvents';
import PaymentAlerts from './PaymentAlerts';

const BELL_SIZE = 10;

/** "2:01 pm" today, "Yesterday, 2:01 pm", else "14 Nov, 2:01 pm" (India time). */
function when(value) {
  const day = dayOf(value);
  if (day === dayOf(new Date())) return timeOf(value);
  if (day === dayOf(new Date(Date.now() - 86400000))) return `Yesterday, ${timeOf(value)}`;
  return `${day.replace(/ \d{4}$/, '')}, ${timeOf(value)}`;
}

/**
 * MR bell: what the office did on my invoices — a payment it recorded
 * (a cheque or NEFT that came to the office) or one it reversed (a bounce).
 * The MR's own collections aren't listed: they already know. Red count =
 * new since the bell was last opened. Tapping an entry opens that invoice.
 */
export default function MrNotificationBell({ size = 36 }) {
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

  useEffect(() => {
    let active = true;
    notificationsApi.mine(BELL_SIZE)
      .then((result) => { if (active) { setData(result); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appRefresh, tick]);
  useEffect(() => {
    const again = () => setTick((value) => value + 1);
    window.addEventListener(BELL_REFRESH_EVENT, again);
    return () => window.removeEventListener(BELL_REFRESH_EVENT, again);
  }, []);

  const open = () => {
    setOpened(true);
    notificationsApi.mine(BELL_SIZE)
      .then((result) => {
        setData({ ...result, unread: 0 }); setFailed(false);
        return result.unread > 0 ? notificationsApi.markMineSeen() : null;
      })
      .catch(() => {});
  };
  const toggle = () => (opened ? close() : open());
  const go = (invoiceId) => {
    close();
    setTimeout(() => navigate(`/mr/invoices?invoice=${invoiceId}`), isMobile ? 120 : 0);
  };

  const count = data.unread;
  const bell = (
    <Tooltip label={count ? `${count} new` : 'Updates from office'} withArrow openDelay={250} disabled={opened}>
      <Indicator label={count > 9 ? '9+' : count} size={17} color="red" offset={5} disabled={!count} inline withBorder>
        <ActionIcon variant="default" radius="xl" size={size} onClick={toggle} aria-label={count ? `Updates from office, ${count} new` : 'Updates from office'} aria-expanded={opened}>
          <IconBell size={size > 34 ? 18 : 16} />
        </ActionIcon>
      </Indicator>
    </Tooltip>
  );

  const alertsRow = (
    <Box px="md" py={10} style={{ borderBottom: '1px solid var(--app-line)', background: 'var(--app-soft)' }}>
      <PaymentAlerts compact />
    </Box>
  );
  const list = (
    <Stack gap={0}>
      {loading && !data.items.length ? <Group justify="center" p="lg"><Loader size="sm" /></Group>
        : failed && !data.items.length ? <Text size="sm" c="dimmed" ta="center" p="lg">Couldn't load updates. Check your connection.</Text>
          : !data.items.length ? (
            <Box p="lg" ta="center">
              <Text size="sm" fw={600}>No updates yet</Text>
              <Text size="xs" c="dimmed" mt={4}>When the office records or reverses a payment for your customers, you'll see it here.</Text>
            </Box>
          ) : data.items.map((item) => <UpdateItem key={item.payment_id} item={item} onOpen={() => go(item.invoice_id)} />)}
    </Stack>
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
          title={<Text fw={700}>Updates from office</Text>}
          classNames={{ content: SWIPE_SHEET_CLASS }}
          styles={{ content: { maxHeight: '80dvh' }, body: { padding: 0 } }}
        >
          {alertsRow}
          {list}
        </Drawer>
      </>
    );
  }
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={380} shadow="md" radius="md" offset={8} withinPortal>
      <Popover.Target>{bell}</Popover.Target>
      <Popover.Dropdown p={0}>
        <Group justify="space-between" px="md" py={10} style={{ borderBottom: '1px solid var(--app-line)' }}>
          <Text fw={700} size="sm">Updates from office</Text>
          {loading && <Loader size={14} />}
        </Group>
        {alertsRow}
        <ScrollArea.Autosize mah={420} type="auto">{list}</ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 *   ● ₹12,400 received · Palak Medical          2:01 pm
 *     INV-1080 · NEFT · by Admin
 *   ● −₹5,000 reversed · Kruti Medical   [Reversed]
 *     INV-1042 · Cheque bounced
 */
function UpdateItem({ item, onOpen }) {
  const reversal = item.is_reversal;
  const detail = reversal
    ? [item.invoice_number, item.reason, item.recorded_by_name && `by ${item.recorded_by_name}`]
    : [item.invoice_number, item.mode, item.recorded_by_name && `by ${item.recorded_by_name}`];
  return (
    <UnstyledButton
      onClick={onOpen}
      px="md"
      py={10}
      style={{ display: 'block', width: '100%', borderBottom: '1px solid var(--app-soft-2)', background: item.is_new ? 'var(--mantine-color-green-light)' : undefined }}
      aria-label={`${money(Math.abs(item.amount))} ${reversal ? 'reversed' : 'received'} for ${item.invoice_number}`}
    >
      <Group gap={10} wrap="nowrap" align="flex-start">
        <Box w={8} mt={7} style={{ flexShrink: 0 }}>
          {item.is_new && <Box w={8} h={8} bg="green.6" style={{ borderRadius: '50%' }} aria-label="New" />}
        </Box>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm" fw={600} truncate c={reversal ? 'orange.8' : 'green.8'}>
              {reversal ? '−' : ''}{money(Math.abs(item.amount))} {reversal ? 'reversed' : 'received'}
              <Text span size="sm" fw={400} c="var(--mantine-color-text)"> · {item.customer_name || '—'}</Text>
            </Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{when(item.payment_date)}</Text>
          </Group>
          <Group gap={6} wrap="nowrap" mt={2}>
            <Text size="xs" c="dimmed" truncate>{detail.filter(Boolean).join(' · ')}</Text>
            {reversal && <Badge size="xs" color="orange" variant="light">Reversed</Badge>}
          </Group>
        </Box>
      </Group>
    </UnstyledButton>
  );
}

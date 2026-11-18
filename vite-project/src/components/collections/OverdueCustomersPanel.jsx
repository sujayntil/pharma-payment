import { useEffect, useState } from 'react';
import { Alert, Badge, Group, Loader, Paper, Stack, Table, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import { errorText, money, shortDate } from '../../utils/formatters';

/**
 * "Overdue" panel (unpaid past 40 days' credit; 60 for distributors) shared by the Admin dashboard (all
 * customers, with an MR column) and the MR dashboard (only their own
 * customers -- the server filters, see GET /mr/overdue-alerts).
 *
 * load: () => Promise<rows> from adminApi.getOverdueAlerts or mrApi.getOverdueAlerts
 * onSelect: optional (row) => void; makes each customer open on tap/click.
 * refined: the Admin dashboard's calmer look (smaller title, soft badges,
 *   urgency colour growing with age, grey table headers, "All clear" when
 *   empty). headerClass: class for the table header cells in that look.
 */

// Urgency grows with how far past credit: up to 9 days amber, 10–49 red, 50+ solid red.
const ageBadge = (days, credit = 40) => {
  const late = days - credit;
  return late >= 50 ? { color: 'red', variant: 'filled' } : late >= 10 ? { color: 'red', variant: 'light' } : { color: 'orange', variant: 'light' };
};
export default function OverdueCustomersPanel({ load, showMr = false, description, emptyText = 'No overdue bills. Nothing is unpaid past 40 days (60 for distributors).', onSelect, tableMinWidth, refined = false, headerClass, cardClass }) {
  const isMobile = useIsMobile();
  const appRefresh = useAppRefresh(); // top-bar ⟳ / pull-to-refresh reloads this
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    load()
      .then((items) => { if (active) setRows(items); })
      .catch((err) => { if (active) setError(errorText(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load, appRefresh]);

  const total = rows.reduce((sum, item) => sum + Number(item.overdue_amount || 0), 0);
  const badgeFor = (days, credit) => (refined ? ageBadge(days, credit) : { color: 'red', variant: 'light' });
  const th = refined ? { className: headerClass } : {};

  if (refined && !loading && !error && !rows.length) {
    return (
      <Paper p="md" className={cardClass}>
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color="green" variant="light" radius="xl" size={34}><IconCheck size={19} /></ThemeIcon>
          <div><Text fw={600} fz={15}>All clear</Text><Text size="sm" c="dimmed">Nothing unpaid past 40 days (60 for distributors).</Text></div>
        </Group>
      </Paper>
    );
  }

  // Dashboard look: one-line header, 4 columns, colour only on age and balance.
  if (refined) {
    const count = `${rows.length} ${rows.length === 1 ? 'customer' : 'customers'}`;
    return (
      <Paper p="md" className={cardClass}>
        <Group justify="space-between" align="baseline" wrap="nowrap" gap="sm" mb={rows.length ? 'sm' : 0}>
          <div><Text fw={600} fz={14} c="gray.7">Overdue</Text><Text fz={12} c="dimmed">Unpaid past 40 days · distributors 60</Text></div>
          {rows.length > 0 && <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}><Text span fw={700} c="red.7" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(total)}</Text> · {count}</Text>}
        </Group>
        {error && <Alert color="red" mt="sm">{error}</Alert>}
        {loading ? <Group justify="center" p="md"><Loader size="sm" /></Group> : !rows.length ? null : isMobile ? (
          <Stack gap={0}>
            {rows.map((item) => (
              <Group key={item.customer_id} justify="space-between" align="flex-start" wrap="nowrap" gap="sm" py="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-2)', cursor: onSelect ? 'pointer' : undefined }} {...(onSelect && { component: UnstyledButton, onClick: () => onSelect(item), w: '100%', 'aria-label': `Open ${item.customer}` })}>
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>{item.customer}</Text>
                  <Text size="xs" c="dimmed">Oldest {item.oldest_invoice_number} · {shortDate(item.oldest_invoice_date)}</Text>
                  <Text size="xs" c="dimmed">{item.invoice_count} {item.invoice_count === 1 ? 'invoice' : 'invoices'}{showMr ? ` · ${item.mr || 'Unassigned'}` : ''}</Text>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <Text fw={700} c="red.7" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{money(item.overdue_amount)}</Text>
                  <Badge size="sm" {...badgeFor(item.days_overdue, item.credit_days)}>{item.days_overdue} days old</Badge>
                </div>
              </Group>
            ))}
          </Stack>
        ) : (
          <Table highlightOnHover verticalSpacing="xs" layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th {...th} w="38%">Customer</Table.Th><Table.Th {...th} w="27%">Oldest invoice</Table.Th><Table.Th {...th} w="15%">Bill age</Table.Th><Table.Th {...th} ta="right">Balance</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows.map((item) => (
              <Table.Tr key={item.customer_id} onClick={onSelect ? () => onSelect(item) : undefined} style={onSelect ? { cursor: 'pointer' } : undefined}>
                <Table.Td>
                  <Text size="sm" fw={600} truncate title={item.customer}>{item.customer}</Text>
                  <Text size="xs" c="dimmed" truncate>{showMr ? `${item.mr || 'Unassigned'} · ` : ''}{item.invoice_count} {item.invoice_count === 1 ? 'invoice' : 'invoices'}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{item.oldest_invoice_number}</Text>
                  <Text size="xs" c="dimmed">{shortDate(item.oldest_invoice_date)}</Text>
                </Table.Td>
                <Table.Td><Badge {...badgeFor(item.days_overdue, item.credit_days)}>{item.days_overdue} days old</Badge></Table.Td>
                <Table.Td ta="right" fw={700} c="red.7" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(item.overdue_amount)}</Table.Td>
              </Table.Tr>
            ))}</Table.Tbody>
          </Table>
        )}
      </Paper>
    );
  }

  return (
    <Paper withBorder={!refined} p="md" className={refined ? cardClass : undefined}>
      <Group justify="space-between" align="flex-start" mb="sm" wrap="nowrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          {refined ? <Text fw={600} fz={14} c="gray.7">Overdue</Text> : <Title order={3}>Overdue</Title>}
          {description && !refined && <Text size="sm" c="dimmed">{description}</Text>}
          {refined && rows.length > 0 && <Text size="sm" c="dimmed">Total <Text span fw={700} c="dark" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(total)}</Text></Text>}
        </div>
        <Badge color={rows.length ? 'red' : 'gray'} variant={refined ? 'light' : undefined} style={{ flexShrink: 0 }}>{rows.length} {rows.length === 1 ? 'customer' : 'customers'}</Badge>
      </Group>
      {rows.length > 0 && !refined && <Text size="sm" mb="sm">Total overdue: <Text span fw={700} c="red">{money(total)}</Text></Text>}
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      {loading ? <Group justify="center" p="lg"><Loader /></Group> : !rows.length ? <Text c="dimmed" py="md">{emptyText}</Text> : isMobile ? (
        <Stack gap={0}>
          {rows.map((item) => (
            <Group key={item.customer_id} justify="space-between" align="flex-start" wrap="nowrap" gap="sm" py="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-2)', cursor: onSelect ? 'pointer' : undefined }} {...(onSelect && { component: UnstyledButton, onClick: () => onSelect(item), w: '100%', 'aria-label': `Open ${item.customer}` })}>
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>{item.customer}</Text>
                <Text size="xs" c="dimmed">Oldest {item.oldest_invoice_number} · {shortDate(item.oldest_invoice_date)}</Text>
                <Text size="xs" c="dimmed">{item.invoice_count} {item.invoice_count === 1 ? 'invoice' : 'invoices'}{showMr ? ` · ${item.mr || 'Unassigned'}` : ''}</Text>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <Text fw={700} c="red" style={{ whiteSpace: 'nowrap' }}>{money(item.overdue_amount)}</Text>
                <Badge size="sm" {...badgeFor(item.days_overdue, item.credit_days)}>{item.days_overdue} days old</Badge>
              </div>
            </Group>
          ))}
        </Stack>
      ) : (
        <Table.ScrollContainer minWidth={tableMinWidth ?? (showMr ? 760 : 640)}>
          <Table striped={!refined} highlightOnHover verticalSpacing={refined ? 'xs' : 'sm'}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th {...th}>Customer</Table.Th><Table.Th {...th}>Oldest invoice</Table.Th><Table.Th {...th}>{refined ? 'Bill age' : 'Oldest bill age'}</Table.Th>
                {showMr && <Table.Th {...th}>MR</Table.Th>}
                <Table.Th {...th} ta={refined ? 'center' : undefined}>{refined ? 'Invoices' : 'Overdue invoices'}</Table.Th><Table.Th {...th} ta="right">{refined ? 'Balance' : 'Overdue balance'}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows.map((item) => (
              <Table.Tr key={item.customer_id} onClick={onSelect ? () => onSelect(item) : undefined} style={onSelect ? { cursor: 'pointer' } : undefined}>
                <Table.Td fw={600}>{item.customer}</Table.Td>
                <Table.Td>{refined ? <Text size="sm">{item.oldest_invoice_number} <Text span size="xs" c="dimmed">· {shortDate(item.oldest_invoice_date)}</Text></Text> : <>{item.oldest_invoice_number}<Text size="xs" c="dimmed">{shortDate(item.oldest_invoice_date)}</Text></>}</Table.Td>
                <Table.Td><Badge {...badgeFor(item.days_overdue, item.credit_days)}>{item.days_overdue} days old</Badge></Table.Td>
                {showMr && <Table.Td>{item.mr || '—'}</Table.Td>}
                <Table.Td ta={refined ? 'center' : undefined}>{item.invoice_count}</Table.Td>
                <Table.Td ta="right" fw={700} c="red" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(item.overdue_amount)}</Table.Td>
              </Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  );
}

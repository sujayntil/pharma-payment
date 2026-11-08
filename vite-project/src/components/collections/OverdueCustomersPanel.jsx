import { useEffect, useState } from 'react';
import { Alert, Badge, Group, Loader, Paper, Stack, Table, Text, Title, UnstyledButton } from '@mantine/core';
import { useIsMobile } from '../../hooks/useIsMobile';
import { errorText, money, shortDate } from '../../utils/formatters';

/**
 * "Outstanding for 40+ days" panel shared by the Admin dashboard (all
 * customers, with an MR column) and the MR dashboard (only their own
 * customers -- the server filters, see GET /mr/overdue-alerts).
 *
 * load: () => Promise<rows> from adminApi.getOverdueAlerts or mrApi.getOverdueAlerts
 * onSelect: optional (row) => void; makes each customer open on tap/click.
 */
export default function OverdueCustomersPanel({ load, showMr = false, description, emptyText = 'No customers have invoices outstanding for 40 days or more.', onSelect }) {
  const isMobile = useIsMobile();
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
  }, [load]);

  const total = rows.reduce((sum, item) => sum + Number(item.overdue_amount || 0), 0);

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" align="flex-start" mb="sm" wrap="nowrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          <Title order={3}>Outstanding for 40+ days</Title>
          {description && <Text size="sm" c="dimmed">{description}</Text>}
        </div>
        <Badge color={rows.length ? 'red' : 'gray'} style={{ flexShrink: 0 }}>{rows.length} {rows.length === 1 ? 'customer' : 'customers'}</Badge>
      </Group>
      {rows.length > 0 && <Text size="sm" mb="sm">Total 40+ day balance: <Text span fw={700} c="red">{money(total)}</Text></Text>}
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
                <Badge size="sm" color="red" variant="light">{item.days_overdue} days</Badge>
              </div>
            </Group>
          ))}
        </Stack>
      ) : (
        <Table.ScrollContainer minWidth={showMr ? 760 : 640}>
          <Table striped highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Customer</Table.Th><Table.Th>Oldest invoice</Table.Th><Table.Th>Days overdue</Table.Th>
                {showMr && <Table.Th>MR</Table.Th>}
                <Table.Th>Overdue invoices</Table.Th><Table.Th ta="right">40+ day balance</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows.map((item) => (
              <Table.Tr key={item.customer_id} onClick={onSelect ? () => onSelect(item) : undefined} style={onSelect ? { cursor: 'pointer' } : undefined}>
                <Table.Td fw={600}>{item.customer}</Table.Td>
                <Table.Td>{item.oldest_invoice_number}<Text size="xs" c="dimmed">{shortDate(item.oldest_invoice_date)}</Text></Table.Td>
                <Table.Td><Badge color="red" variant="light">{item.days_overdue} days</Badge></Table.Td>
                {showMr && <Table.Td>{item.mr || '—'}</Table.Td>}
                <Table.Td>{item.invoice_count}</Table.Td>
                <Table.Td ta="right" fw={700} c="red">{money(item.overdue_amount)}</Table.Td>
              </Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  );
}

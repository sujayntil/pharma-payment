import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Anchor, Badge, Box, Collapse, Group, Loader, Paper, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
  IconArrowBackUp, IconCash, IconChevronDown, IconFileDownload, IconFileUpload, IconLogin, IconLogout,
  IconPencil, IconShieldCheck, IconShieldX, IconUser, IconUserCog, IconUsers,
} from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import { auditApi } from '../../api/auditApi';
import EmptyResults from '../../components/common/EmptyResults';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { listPaperProps, reloadingStyle } from '../../components/common/listPaper';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import FilterBar, { FilterSelect } from '../../components/filters/FilterBar';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import { useIsMobile } from '../../hooks/useIsMobile';
import { dayOf, displayPhone, errorText, money, timeOf } from '../../utils/formatters';

const TYPES = [
  { value: 'collections', label: 'Collections' },
  { value: 'reversals', label: 'Reversals and undos' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'customers', label: 'Customers' },
  { value: 'users', label: 'Users' },
  { value: 'sign_ins', label: 'Sign-ins' },
  { value: 'files', label: 'Imports and exports' },
];
const ROLES = [{ value: 'ADMIN', label: 'Admins' }, { value: 'MR', label: 'MRs' }];
const BLANK = { userId: '', role: '', type: '', range: EMPTY_RANGE };

/**
 * Admin "Audit log": everything everyone did (every MR and every Admin),
 * newest first, grouped by day. Read-only. Each row reads as a sentence:
 *   11:52 pm  Rahul (MR)  collected ₹8,400 · Dr. Mehta Clinic · INV-1081 · UPI
 * Edits have "Details" with before → after. Invoice numbers open the
 * invoice; customer names open the customer.
 */
export default function AdminAuditLog() {
  const isMobile = useIsMobile();
  const appRefresh = useAppRefresh();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(BLANK);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [people, setPeople] = useState([]);

  useEffect(() => {
    adminApi.getUsers().then((users) => setPeople((users.items || users).map((user) => ({ value: String(user.id), label: `${user.name} (${user.role === 'ADMIN' ? 'Admin' : 'MR'})` })))).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await auditApi.list({
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          ...(filters.userId && { user_id: filters.userId }),
          ...(filters.role && { role: filters.role }),
          ...(filters.type && { type: filters.type }),
          ...(filters.range.from && { date_from: filters.range.from }),
          ...(filters.range.to && { date_to: filters.range.to }),
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        });
        if (active) setData(result);
      } catch (err) {
        if (active) setError(errorText(err, "Couldn't load the audit log."));
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [filters, page, debouncedSearch, appRefresh]);

  const update = (patch) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };
  const onSearch = (value) => { setSearch(value); setPage(1); };
  const reset = () => { setFilters(BLANK); setSearch(''); setPage(1); };
  const range = describeRange(filters.range);
  const chips = [
    filters.userId && { key: 'user', label: `Person: ${people.find((p) => p.value === filters.userId)?.label || '…'}`, onRemove: () => update({ userId: '' }) },
    filters.role && { key: 'role', label: ROLES.find((r) => r.value === filters.role)?.label, onRemove: () => update({ role: '' }) },
    filters.type && { key: 'type', label: TYPES.find((t) => t.value === filters.type)?.label, onRemove: () => update({ type: '' }) },
    range && { key: 'range', label: `Date: ${range}`, onRemove: () => update({ range: EMPTY_RANGE }) },
    search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') },
  ];

  const openInvoice = (id) => navigate(`/admin/invoices?invoice=${id}`);
  const openCustomer = (customer) => navigate('/admin/customers', { state: { openCustomer: customer } });

  // Rows grouped under "Today", "Yesterday" or the date (India time).
  const groups = [];
  for (const item of data.items) {
    const day = dayOf(item.at);
    if (!groups.length || groups[groups.length - 1].day !== day) groups.push({ day, items: [] });
    groups[groups.length - 1].items.push(item);
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="sm" wrap="nowrap"><Title order={1}>Audit log</Title><Badge variant="light" size="lg">{data.total}</Badge></Group>
      </Group>
      <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Invoice, customer, person" chips={chips} onReset={reset} activeOutline>
        <FilterSelect placeholder="Everyone" icon={<IconUser size={16} />} data={people} value={filters.userId} onChange={(userId) => update({ userId: userId || '' })} searchable />
        <FilterSelect placeholder="All roles" icon={<IconUsers size={16} />} data={ROLES} value={filters.role} onChange={(role) => update({ role: role || '' })} />
        <FilterSelect placeholder="All actions" icon={<IconShieldCheck size={16} />} data={TYPES} value={filters.type} onChange={(type) => update({ type: type || '' })} />
        <DateRangeFilter label="Date" value={filters.range} onChange={(value) => update({ range: value })} />
      </FilterBar>
      {error && <Alert color="red" variant="light">{error}</Alert>}
      <Paper {...listPaperProps(isMobile)} {...reloadingStyle(loading && data.items.length > 0)}>
        {loading && !data.items.length ? <Group justify="center" p="xl"><Loader /></Group>
          : !data.items.length ? (chips.some(Boolean) ? <EmptyResults search={search} noun="entries" onClear={reset} /> : <Text ta="center" c="dimmed" py="xl">Nothing recorded yet.</Text>)
            : (
              <Stack gap={0}>
                {groups.map((group) => (
                  <Box key={group.day}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase" px={isMobile ? 'sm' : 'md'} pt="md" pb={6}>{dayLabel(group.day)}</Text>
                    {group.items.map((item) => <AuditRow key={item.id} item={item} isMobile={isMobile} onInvoice={openInvoice} onCustomer={openCustomer} />)}
                  </Box>
                ))}
              </Stack>
            )}
        <ListPagination total={data.total} page={page} onChange={setPage} label="entries" />
      </Paper>
    </Stack>
  );
}

function dayLabel(day) {
  if (day === dayOf(new Date())) return 'Today';
  if (day === dayOf(new Date(Date.now() - 86400000))) return 'Yesterday';
  return day;
}

/** One entry: time · who · what, with links and "Details" for edits. */
function AuditRow({ item, isMobile, onInvoice, onCustomer }) {
  const [open, setOpen] = useState(false);
  const look = LOOK[item.action] || LOOK.default;
  const Icon = look.icon;
  const who = item.actor;
  const invoiceLink = item.invoice?.number && (item.invoice.id
    ? <Anchor component="button" type="button" size="sm" fw={600} onClick={() => onInvoice(item.invoice.id)}>{item.invoice.number}</Anchor>
    : <Text span size="sm" fw={600}>{item.invoice.number}</Text>);
  const customerLink = item.customer?.name && (item.customer.id
    ? <Anchor component="button" type="button" size="sm" onClick={() => onCustomer({ id: item.customer.id, name: item.customer.name })}>{item.customer.name}</Anchor>
    : <Text span size="sm">{item.customer.name}</Text>);

  return (
    <Box px={isMobile ? 'sm' : 'md'} py={10} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
      <Group gap={10} wrap="nowrap" align="flex-start">
        <ThemeIcon size={30} radius="xl" variant="light" color={look.color} aria-hidden><Icon size={16} /></ThemeIcon>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
            <Text size="sm" style={{ minWidth: 0 }}>
              <Text span fw={700}>{who ? who.name : 'Someone'}</Text>
              {who && <Badge ml={6} size="xs" variant="light" color={who.role === 'ADMIN' ? 'grape' : 'blue'} style={{ verticalAlign: 1 }}>{who.role === 'ADMIN' ? 'Admin' : 'MR'}</Badge>}
              {' '}<Sentence item={item} invoiceLink={invoiceLink} customerLink={customerLink} />
            </Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{timeOf(item.at)}</Text>
          </Group>
          <Extra item={item} />
          {/* The MR change is already in the sentence, so no Details there. */}
          {item.changes.length > 0 && item.action !== 'customer_mr_changed' && (
            <>
              <UnstyledButton onClick={() => setOpen((value) => !value)} mt={4} aria-expanded={open}>
                <Group gap={4}><Text size="xs" fw={600} c="green.8">{open ? 'Hide details' : `Details (${item.changes.length})`}</Text>
                  <IconChevronDown size={13} color="var(--mantine-color-green-8)" style={{ transform: open ? 'rotate(180deg)' : undefined }} /></Group>
              </UnstyledButton>
              <Collapse expanded={open}>
                <Stack gap={2} mt={6} p={8} style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
                  {item.changes.map((change) => (
                    <Text key={change.field} size="xs">
                      <Text span c="dimmed">{FIELD_LABELS[change.field] || change.field}: </Text>
                      <Text span td="line-through" c="dimmed">{show(change.field, change.old)}</Text>
                      {' → '}<Text span fw={600}>{show(change.field, change.new)}</Text>
                    </Text>
                  ))}
                </Stack>
              </Collapse>
            </>
          )}
        </Box>
      </Group>
    </Box>
  );
}

/** "collected ₹8,400 · Dr. Mehta Clinic · INV-1081 · UPI" and friends. */
function Sentence({ item, invoiceLink, customerLink }) {
  const sep = ' · ';
  const amount = item.amount != null ? money(item.amount) : null;
  const subject = item.subject;
  switch (item.action) {
    case 'collected': return <>collected <b>{amount}</b>{customerLink && <>{sep}{customerLink}</>}{invoiceLink && <>{sep}{invoiceLink}</>}{item.mode && `${sep}${item.mode}`}</>;
    case 'reversed': return <>reversed <b>{amount}</b>{invoiceLink && <>{sep}{invoiceLink}</>}{customerLink && <>{sep}{customerLink}</>}</>;
    case 'payment_undone': return <>undid a collection of <b>{amount}</b>{invoiceLink && <>{sep}{invoiceLink}</>}</>;
    case 'invoice_created': return <>added invoice {invoiceLink}{customerLink && <>{sep}{customerLink}</>}{amount && `${sep}${amount}`}</>;
    case 'invoice_updated': return <>edited invoice {invoiceLink}</>;
    case 'invoice_deleted': return <>deleted invoice {invoiceLink}{customerLink && <>{sep}{customerLink}</>}{amount && `${sep}${amount}`}</>;
    case 'customer_created': return <>added customer {customerLink}</>;
    case 'customer_updated': return <>edited customer {customerLink}</>;
    case 'customer_deleted': return <>deleted customer {customerLink}</>;
    case 'customer_mr_changed': {
      const change = item.changes.find((c) => c.field === 'mr');
      return <>changed {customerLink}’s MR{change && <>{sep}{change.old || 'None'} → <b>{change.new || 'None'}</b></>}</>;
    }
    case 'customer_contact_updated': return <>updated phone numbers for {customerLink}</>;
    case 'user_created': return <>added user <b>{subject?.name}</b>{subject?.role && ` (${subject.role === 'ADMIN' ? 'Admin' : 'MR'}${subject.employee_code ? ` · ${subject.employee_code}` : ''})`}</>;
    case 'user_updated': return <>edited user <b>{subject?.name}</b></>;
    case 'user_deleted': return <>deleted user <b>{subject?.name}</b></>;
    case 'signed_in': return <>signed in</>;
    case 'signed_out': return <>signed out</>;
    case 'sign_in_failed': return <Text span c="red.7" fw={600}>failed to sign in{item.info.employee_code ? ` as ${item.info.employee_code}` : ''}</Text>;
    case 'invoices_imported': return <>imported <b>{item.info.file || 'a sales book'}</b></>;
    case 'invoices_exported': return <>downloaded invoices (Excel){item.info.rows != null && `${sep}${item.info.rows} rows`}</>;
    case 'collections_exported': return <>downloaded collections (Excel)</>;
    default: return <>{item.action.replace(/_/g, ' ')}</>;
  }
}

/** Second line: reference, reason, import counts, filters used, address. */
function Extra({ item }) {
  const bits = [];
  if (item.reference) bits.push(`Ref: ${item.reference}`);
  if (item.reason) bits.push(`Reason: ${item.reason}`);
  if (item.action === 'invoices_imported') {
    const { created = 0, updated = 0, skipped = 0 } = item.info;
    bits.push(`${created} added · ${updated} updated · ${skipped} skipped`);
  }
  if (item.info.filters && Object.keys(item.info.filters).length) {
    bits.push(`Filters: ${Object.entries(item.info.filters).map(([key, value]) => `${key.replace(/_/g, ' ')} ${value}`).join(', ')}`);
  }
  if (item.info.address) bits.push(`From ${item.info.address}`);
  if (!bits.length) return null;
  return <Text size="xs" c="dimmed" mt={2} style={{ overflowWrap: 'anywhere' }}>{bits.join(' · ')}</Text>;
}

const FIELD_LABELS = {
  name: 'Name', type: 'Type', phone: 'Phone', alternate_phone: 'Alternate phone', whatsapp_on: 'WhatsApp',
  address: 'Address', gstin: 'GSTIN', mr: 'MR', invoice_number: 'Invoice number', invoice_date: 'Invoice date',
  total_amount: 'Bill', payment_mode: 'Payment mode', remarks: 'Remarks', customer_name: 'Customer',
  employee_code: 'Employee code', role: 'Role',
};

function show(field, value) {
  if (value == null || value === '') return '—';
  if (field === 'total_amount') return money(value);
  if (field === 'phone' || field === 'alternate_phone') return displayPhone(value) || value;
  if (field === 'whatsapp_on') return value === 'main' ? 'Main number' : value === 'alternate' ? 'Alternate number' : '—';
  if (field === 'role') return value === 'ADMIN' ? 'Admin' : 'MR';
  return String(value);
}

const LOOK = {
  collected: { icon: IconCash, color: 'green' },
  reversed: { icon: IconArrowBackUp, color: 'orange' },
  payment_undone: { icon: IconArrowBackUp, color: 'orange' },
  invoice_created: { icon: IconPencil, color: 'blue' },
  invoice_updated: { icon: IconPencil, color: 'blue' },
  invoice_deleted: { icon: IconPencil, color: 'red' },
  customer_created: { icon: IconUsers, color: 'blue' },
  customer_updated: { icon: IconUsers, color: 'blue' },
  customer_deleted: { icon: IconUsers, color: 'red' },
  customer_mr_changed: { icon: IconUsers, color: 'blue' },
  customer_contact_updated: { icon: IconUsers, color: 'blue' },
  user_created: { icon: IconUserCog, color: 'grape' },
  user_updated: { icon: IconUserCog, color: 'grape' },
  user_deleted: { icon: IconUserCog, color: 'red' },
  signed_in: { icon: IconLogin, color: 'gray' },
  signed_out: { icon: IconLogout, color: 'gray' },
  sign_in_failed: { icon: IconShieldX, color: 'red' },
  invoices_imported: { icon: IconFileUpload, color: 'teal' },
  invoices_exported: { icon: IconFileDownload, color: 'teal' },
  collections_exported: { icon: IconFileDownload, color: 'teal' },
  default: { icon: IconShieldCheck, color: 'gray' },
};

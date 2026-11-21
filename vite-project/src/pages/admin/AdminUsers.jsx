import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Loader, Menu, Modal, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconBellOff, IconDots, IconPlus } from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import { useAuth } from '../../hooks/useAppStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import RowCard, { CardList } from '../../components/common/RowCard';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import TableScroll from '../../components/common/TableScroll';

const emptyUser = { name: '', employee_code: '', role: 'MR', phone: '', password: '', title: 'KING' };
const TITLES = [{ value: 'KING', label: '👑 King' }, { value: 'QUEEN', label: '👸 Queen' }];

export default function AdminUsers() {
  const appRefresh = useAppRefresh(); // top-bar ⟳ / pull-to-refresh reloads this page in place
  const { user: currentUser } = useAuth();
  const isMobile = useIsMobile();
  const [users, setUsers] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false); const [editing, setEditing] = useState(null); const [deleting, setDeleting] = useState(null); const [form, setForm] = useState(emptyUser); const [busy, setBusy] = useState(false);
  const load = () => adminApi.getUsers().then(setUsers).catch((err) => setError(err.detail || err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, [appRefresh]);
  const create = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await adminApi.createUser({ ...form, name: form.name.trim(), employee_code: form.employee_code.trim(), phone: form.phone.trim() || null, title: form.title }); setNotice('User created.'); setCreateOpen(false); setForm(emptyUser); await load(); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };
  const edit = (target) => { setEditing(target); setForm({ name: target.name, employee_code: target.employee_code, role: target.role, phone: target.phone || '', password: '', title: target.title || 'KING' }); };
  const save = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { const payload = { name: form.name.trim(), role: form.role, phone: form.phone.trim() || null, title: form.title }; if (form.password) payload.password = form.password; await adminApi.updateUser(editing.id, payload); setNotice('User updated.'); setEditing(null); await load(); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };
  // Empty MRs' "Updates from office" bells: one MR or all (asks first).
  const [clearing, setClearing] = useState(null); // { id?, name? } or 'all'
  const mrCount = users.filter((u) => u.role === 'MR').length;
  const clearBells = async () => { setBusy(true); setError(''); try { const one = clearing !== 'all' ? clearing : null; await adminApi.clearMrBells(one?.id); setNotice(one ? `${one.name}'s bell cleared.` : "All MRs' bells cleared."); setClearing(null); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };
  const bellItem = (target) => target.role === 'MR' && <Menu.Item leftSection={<IconBellOff size={15} />} onClick={() => setClearing(target)}>Clear bell</Menu.Item>;
  const rowMenu = (target) => target.role === 'MR' && (
    <Menu position="bottom-end" shadow="md" withinPortal>
      <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${target.name}`}><IconDots size={16} /></ActionIcon></Menu.Target>
      <Menu.Dropdown>{bellItem(target)}</Menu.Dropdown>
    </Menu>
  );
  const remove = async () => { setBusy(true); setError(''); try { await adminApi.deleteUser(deleting.id); setNotice('User deleted.'); setDeleting(null); await load(); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };
  return <Stack gap="md"><Group justify="space-between"><Title order={1}>Users</Title><Group gap="xs"><Button leftSection={<IconPlus size={16} />} onClick={() => { setForm(emptyUser); setCreateOpen(true); }}>Add user</Button>
    {mrCount > 0 && (
      <Menu position="bottom-end" shadow="md" withinPortal>
        <Menu.Target><ActionIcon variant="default" size="lg" aria-label="More user actions"><IconDots size={16} /></ActionIcon></Menu.Target>
        <Menu.Dropdown><Menu.Item leftSection={<IconBellOff size={15} />} onClick={() => setClearing('all')}>Clear all MRs' bells</Menu.Item></Menu.Dropdown>
      </Menu>
    )}</Group></Group>{error && <Alert color="red" onClose={() => setError('')} withCloseButton>{error}</Alert>}{notice && <Alert color="green" onClose={() => setNotice('')} withCloseButton>{notice}</Alert>}<Paper withBorder p="md">{loading ? <Group justify="center" p="xl"><Loader /></Group> : isMobile ? <CardList>{users.map((target) => (
      <RowCard
        key={target.id}
        title={target.name}
        subtitle={target.employee_code}
        badges={<Badge variant="light" color={target.role === 'ADMIN' ? 'blue' : 'green'}>{target.role === 'ADMIN' ? 'Admin' : 'MR'}</Badge>}
        details={[{ label: 'Phone', value: target.phone || '—' }]}
        actions={<><Button size="sm" variant="default" onClick={() => edit(target)}>Edit</Button><Button size="sm" variant="subtle" color="red" disabled={target.id === currentUser?.id} onClick={() => setDeleting(target)}>Delete</Button>{rowMenu(target)}</>}
      />
    ))}</CardList> : <TableScroll minWidth={650}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Employee code</Table.Th><Table.Th>Phone</Table.Th><Table.Th>Role</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{users.map((target) => <Table.Tr key={target.id}><Table.Td fw={600}>{target.name} <span aria-label={target.title === 'QUEEN' ? 'Queen' : 'King'}>{target.title === 'QUEEN' ? '👸' : '👑'}</span></Table.Td><Table.Td>{target.employee_code}</Table.Td><Table.Td>{target.phone || '—'}</Table.Td><Table.Td><Badge variant="light" color={target.role === 'ADMIN' ? 'blue' : 'green'}>{target.role === 'ADMIN' ? 'Admin' : 'MR'}</Badge></Table.Td><Table.Td><Group gap="xs"><Button size="xs" variant="default" onClick={() => edit(target)}>Edit</Button><Button size="xs" variant="subtle" color="red" disabled={target.id === currentUser?.id} onClick={() => setDeleting(target)}>Delete</Button>{rowMenu(target)}</Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></TableScroll>}</Paper>
    <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Add user" centered><form onSubmit={create}><Stack><TextInput label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} /><TextInput label="Employee code" required value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.currentTarget.value })} /><Select label="Role" data={[{ value: 'MR', label: 'Medical representative' }, { value: 'ADMIN', label: 'Administrator' }]} value={form.role} onChange={(value) => setForm({ ...form, role: value || 'MR' })} /><TextInput label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.currentTarget.value })} /><Select label="Title" description="Crown on their Home screen" data={TITLES} value={form.title} allowDeselect={false} onChange={(value) => setForm({ ...form, title: value || 'KING' })} /><TextInput type="password" label="Temporary password" description="At least 8 characters" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.currentTarget.value })} /><Button type="submit" loading={busy}>Create user</Button></Stack></form></Modal>
    <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.name || 'user'}`} centered><form onSubmit={save}><Stack><TextInput label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} /><TextInput label="Employee code" value={form.employee_code} disabled /><Select label="Role" data={[{ value: 'MR', label: 'Medical representative' }, { value: 'ADMIN', label: 'Administrator' }]} value={form.role} onChange={(value) => setForm({ ...form, role: value || 'MR' })} /><TextInput label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.currentTarget.value })} /><Select label="Title" description="Crown on their Home screen" data={TITLES} value={form.title} allowDeselect={false} onChange={(value) => setForm({ ...form, title: value || 'KING' })} /><TextInput type="password" label="New password (optional)" description="At least 8 characters" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.currentTarget.value })} /><Button type="submit" loading={busy}>Save changes</Button></Stack></form></Modal>
    <Modal opened={!!clearing} onClose={() => setClearing(null)} title={clearing === 'all' ? "Clear all MRs' bells" : 'Clear bell'} centered><Stack><Text>{clearing === 'all' ? `Clear the "Updates from office" list for all ${mrCount} MRs?` : `Clear the "Updates from office" list for ${clearing?.name}?`} New updates will still arrive. Nothing in the books changes.</Text><Group justify="end"><Button variant="default" onClick={() => setClearing(null)}>Cancel</Button><Button loading={busy} onClick={clearBells}>Clear</Button></Group></Stack></Modal>
    <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete user" centered><Stack><Text>Delete {deleting?.name}? This cannot be undone.</Text><Group justify="end"><Button variant="default" onClick={() => setDeleting(null)}>Cancel</Button><Button color="red" loading={busy} onClick={remove}>Delete user</Button></Group></Stack></Modal>
  </Stack>;
}

import { useEffect, useState } from 'react';
import { Alert, Button, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconFileSpreadsheet, IconDatabase, IconDownload } from '@tabler/icons-react';
import SidePanel from '../common/SidePanel';
import { adminApi } from '../../api/adminApi';
import { dateTime, downloadErrorText, saveDownload } from '../../utils/formatters';
import css from './BackupPanel.module.css';

const FILES = [
  {
    kind: 'excel', icon: IconFileSpreadsheet, color: 'green', title: 'Excel',
    text: 'To read or share with your CA: customers, invoices, payments, products, team and activity.',
    get: () => adminApi.backupExcel(), fallback: 'Pharma backup.xlsx',
  },
  {
    kind: 'full', icon: IconDatabase, color: 'blue', title: 'Full backup',
    text: 'To rebuild the whole app if ever needed. Includes sign-in details, so keep it private.',
    get: () => adminApi.backupFull(), fallback: 'Pharma full backup.json.gz',
  },
];

/** Admin › menu › Backup: download a copy of all the data to keep. */
export default function BackupPanel({ opened, onClose }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [last, setLast] = useState(undefined);

  useEffect(() => {
    if (!opened) return undefined;
    let live = true;
    adminApi.backupStatus().then((data) => { if (live) setLast(data.last); }).catch(() => { if (live) setLast(null); });
    return () => { live = false; };
  }, [opened]);

  const download = async (file) => {
    setBusy(file.kind); setError('');
    try {
      saveDownload(await file.get(), file.fallback);
      setLast({ at: new Date().toISOString(), kind: file.kind === 'excel' ? 'Excel' : 'Full', by: null });
    } catch (err) {
      setError(await downloadErrorText(err, 'Could not prepare the backup. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SidePanel opened={opened} onClose={onClose} width={520} mobileProps={{ size: 'auto' }} title={<Text fw={700}>Backup</Text>}>
      <Stack gap="md" pb="md">
        <div>
          <Text fw={600} size="sm" mb={4}>Download a copy</Text>
          <Text size="xs" c="dimmed" mb="xs">Keep one on a pen drive once a month.</Text>
          <div className={css.list}>
            {FILES.map((file) => (
              <div key={file.kind} className={css.row}>
                <ThemeIcon variant="light" color={file.color} radius="md" size={34}><file.icon size={18} /></ThemeIcon>
                <div className={css.text}>
                  <Text fw={600} size="sm">{file.title}</Text>
                  <Text size="xs" c="dimmed">{file.text}</Text>
                </div>
                <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} loading={busy === file.kind} disabled={Boolean(busy) && busy !== file.kind} onClick={() => download(file)}>
                  Download
                </Button>
              </div>
            ))}
          </div>
        </div>

        {error && <Alert color="red" variant="light">{error}</Alert>}

        <Group gap={6}>
          <Text size="xs" c="dimmed">
            {last === undefined ? ' ' : last ? <>Last downloaded: {last.kind} · {dateTime(last.at)}{last.by ? ` · ${last.by}` : ''}</> : 'Not downloaded yet.'}
          </Text>
        </Group>
      </Stack>
    </SidePanel>
  );
}

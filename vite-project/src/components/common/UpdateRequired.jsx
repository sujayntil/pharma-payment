import { useEffect, useState } from 'react';
import { Button, Center, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { isUpdateHeld, onUpdateHoldChange } from '../../utils/updateGate';

/* global __APP_VERSION__ */
const CURRENT = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;
const CHECK_EVERY_MS = 5 * 60 * 1000;

async function latestVersion() {
  const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json()).version || null;
}

async function update() {
  // Drop cached app files so the reload can only get the new version.
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    const registration = await navigator.serviceWorker?.getRegistration('/');
    await registration?.update();
  } catch { /* nothing cached or no worker: a plain reload is enough */ }
  window.location.reload();
}

/**
 * "Update available. Please update to continue." Shown over everything (login
 * included) once a newer version is live. Checks on open, on coming back to
 * the app, and every 5 minutes. Waits while a collection is being saved or
 * its Undo bar is showing.
 */
export default function UpdateRequired() {
  const [outdated, setOutdated] = useState(false);
  const [held, setHeld] = useState(isUpdateHeld);
  const [busy, setBusy] = useState(false);

  useEffect(() => onUpdateHoldChange(setHeld), []);

  useEffect(() => {
    if (CURRENT === 'dev') return undefined;
    let active = true;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      latestVersion()
        .then((latest) => { if (active && latest && latest !== CURRENT) setOutdated(true); })
        .catch(() => { /* offline: try again later */ });
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  if (!outdated || held) return null;
  return (
    <Center
      role="alertdialog"
      aria-label="Update available"
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'var(--mantine-color-body)', padding: 24 }}
    >
      <Stack align="center" gap="sm" maw={320} ta="center">
        <ThemeIcon size={56} radius="xl" color="green" variant="light"><IconRefresh size={28} /></ThemeIcon>
        <Title order={3}>Update available</Title>
        <Text c="dimmed">Please update to continue.</Text>
        <Button size="md" mt="sm" fullWidth loading={busy} leftSection={<IconRefresh size={18} />} onClick={() => { setBusy(true); update(); }}>
          Update
        </Button>
      </Stack>
    </Center>
  );
}

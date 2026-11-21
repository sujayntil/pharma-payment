import { useEffect, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { IconBell, IconBellOff } from '@tabler/icons-react';
import { notificationsApi } from '../../api/notificationsApi';

function decodeKey(value) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  const bytes = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
}

function sameKey(buffer, bytes) {
  if (!buffer) return true; // browser doesn't tell: assume it matches
  const a = new Uint8Array(buffer);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
}

const NOT_READY = 'The app is still getting ready on this device. Close it, open it again, and then enable alerts.';

/**
 * A service-worker registration that really has a running ("active") worker.
 *
 * `navigator.serviceWorker.ready` is resolved once per page, so it can hand
 * back a registration whose worker has since been removed or replaced (site
 * data cleared, app reinstalled while open). Subscribing with that fails with
 * "no active Service Worker". This looks the registration up fresh,
 * registers again if it is missing, and waits for the worker to activate.
 */
async function activeRegistration({ forceRegister = false } = {}) {
  let registration = forceRegister ? null : await navigator.serviceWorker.getRegistration('/');
  if (!registration || (!registration.active && !registration.installing && !registration.waiting)) {
    registration = await navigator.serviceWorker.register('/sw.js');
  }
  if (registration.active) return registration;
  const worker = registration.installing || registration.waiting;
  if (worker && worker.state !== 'activated') {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(NOT_READY)), 15000);
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') { clearTimeout(timer); resolve(); }
        if (worker.state === 'redundant') { clearTimeout(timer); reject(new Error(NOT_READY)); }
      });
    });
  }
  const fresh = (await navigator.serviceWorker.getRegistration('/')) || registration;
  if (!fresh.active) throw new Error(NOT_READY);
  return fresh;
}

/** compact: one quiet line for the bell's footer (Admin). */
export default function PaymentAlerts({ compact = false }) {
  const [subscription, setSubscription] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const supported = typeof window !== 'undefined' && window.isSecureContext && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;

  // On every open: make sure the server still has this phone, and that it
  // was set up with the current app keys. The phone can say "on" while the
  // server dropped it (expired, keys changed), and then alerts silently stop.
  useEffect(() => {
    if (!supported) return undefined;
    let live = true;
    (async () => {
      const registration = await navigator.serviceWorker.ready;
      let current = await registration.pushManager.getSubscription();
      if (current && Notification.permission !== 'granted') {
        if (live) { setSubscription(current); setMessage('Notifications are blocked for this app in phone settings. Allow them to get alerts.'); }
        return;
      }
      if (current) {
        const publicKey = await notificationsApi.getPublicKey();
        if (!sameKey(current.options?.applicationServerKey, decodeKey(publicKey))) {
          await current.unsubscribe();
          current = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
        }
        await notificationsApi.save(current.toJSON());
      }
      if (live) setSubscription(current);
    })().catch(() => {});
    return () => { live = false; };
  }, [supported]);

  const test = async () => {
    setTesting(true); setMessage('');
    try {
      if (subscription) await notificationsApi.save(subscription.toJSON());
      const r = await notificationsApi.test();
      if (r.delivered > 0) setMessage(`Test sent to ${r.delivered} ${r.delivered === 1 ? 'device' : 'devices'}. It should pop up in a few seconds. If not, check this app's notification settings on the phone.`);
      else if (r.problems?.includes('not_configured')) setMessage('Alerts are not set up on the server (VAPID keys missing).');
      else if (r.removed > 0 || !r.devices) setMessage('The server had no working device for you. Turn alerts off and on again on this phone.');
      else setMessage(`The phone's push service did not accept the alert (${(r.problems || []).join(', ')}). Try again in a minute.`);
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Could not send a test alert.');
    } finally { setTesting(false); }
  };

  const toggle = async () => {
    setBusy(true); setMessage('');
    try {
      let registration = await activeRegistration();
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await notificationsApi.remove(current.endpoint);
        await current.unsubscribe();
        setSubscription(null);
        setMessage('Alerts are off on this device.');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Allow notifications in browser settings, then enable alerts again.');
        const publicKey = await notificationsApi.getPublicKey();
        const options = { userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) };
        let created;
        try {
          created = await registration.pushManager.subscribe(options);
        } catch (error) {
          // The worker went away between the check and the subscribe: register
          // again and try once more before giving up.
          if (!/no active service worker/i.test(error?.message || '')) throw error;
          registration = await activeRegistration({ forceRegister: true });
          created = await registration.pushManager.subscribe(options);
        }
        await notificationsApi.save(created.toJSON());
        setSubscription(created);
        setMessage('Alerts are on for this device.');
      }
    } catch (error) {
      const text = error.response?.data?.detail || error.message || 'Could not update notification settings.';
      setMessage(/no active service worker/i.test(text) ? NOT_READY : text);
    } finally { setBusy(false); }
  };

  if (compact) {
    return (
      <div>
        <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
          <Text size="sm" c="dimmed">Alerts on this device</Text>
          <Group gap={6} wrap="nowrap">
          {subscription && <Button size="compact-sm" variant="subtle" loading={testing} onClick={test}>Send test</Button>}
          <Button size="compact-sm" disabled={!supported} loading={busy} variant={subscription ? 'default' : 'light'} leftSection={subscription ? <IconBellOff size={14} /> : <IconBell size={14} />} onClick={toggle}>{subscription ? 'Turn off' : 'Turn on'}</Button>
          </Group>
        </Group>
        {(message || !supported) && <Text size="xs" c="dimmed" mt={4}>{message || 'Needs a supported browser and secure connection.'}</Text>}
      </div>
    );
  }

  return <Group justify="space-between" align="center"><div><Text fw={600}>Payment collection alerts</Text><Text size="sm" c="dimmed">{message || (subscription ? 'This device will be notified when a payment is recorded.' : supported ? 'Get notified when a payment is recorded.' : 'Push notifications require a supported browser and secure connection.')}</Text></div><Group gap="xs" wrap="nowrap">{subscription && <Button variant="subtle" loading={testing} onClick={test}>Send test</Button>}<Button disabled={!supported} loading={busy} variant={subscription ? 'default' : 'light'} leftSection={subscription ? <IconBellOff size={16} /> : <IconBell size={16} />} onClick={toggle}>{subscription ? 'Disable alerts' : 'Enable alerts'}</Button></Group></Group>;
}

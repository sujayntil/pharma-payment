import { useEffect, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { IconBell, IconBellOff } from '@tabler/icons-react';
import { notificationsApi } from '../../api/notificationsApi';

function decodeKey(value) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  const bytes = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
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

export default function PaymentAlerts() {
  const [subscription, setSubscription] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const supported = typeof window !== 'undefined' && window.isSecureContext && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then(setSubscription).catch(() => {});
  }, [supported]);

  const toggle = async () => {
    setBusy(true); setMessage('');
    try {
      let registration = await activeRegistration();
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await notificationsApi.remove(current.endpoint);
        await current.unsubscribe();
        setSubscription(null);
        setMessage('Payment and 40-day outstanding alerts are disabled on this device.');
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
        setMessage('Payment and 40-day outstanding alerts are enabled on this device.');
      }
    } catch (error) {
      const text = error.response?.data?.detail || error.message || 'Could not update notification settings.';
      setMessage(/no active service worker/i.test(text) ? NOT_READY : text);
    } finally { setBusy(false); }
  };

  return <Group justify="space-between" align="center"><div><Text fw={600}>Payment collection alerts</Text><Text size="sm" c="dimmed">{message || (subscription ? 'This device will be notified when a payment is recorded.' : supported ? 'Get notified when a payment is recorded.' : 'Push notifications require a supported browser and secure connection.')}</Text></div><Button disabled={!supported} loading={busy} variant={subscription ? 'default' : 'light'} leftSection={subscription ? <IconBellOff size={16} /> : <IconBell size={16} />} onClick={toggle}>{subscription ? 'Disable alerts' : 'Enable alerts'}</Button></Group>;
}

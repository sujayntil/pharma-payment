import { useEffect, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { IconBell, IconBellOff } from '@tabler/icons-react';
import { notificationsApi } from '../../api/notificationsApi';

function decodeKey(value) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  const bytes = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
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
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await notificationsApi.remove(current.endpoint);
        await current.unsubscribe();
        setSubscription(null);
        setMessage('Payment alerts are disabled on this device.');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Allow notifications in browser settings, then enable alerts again.');
        const publicKey = await notificationsApi.getPublicKey();
        const created = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
        await notificationsApi.save(created.toJSON());
        setSubscription(created);
        setMessage('Payment alerts are enabled on this device.');
      }
    } catch (error) {
      setMessage(error.response?.data?.detail || error.message || 'Could not update notification settings.');
    } finally { setBusy(false); }
  };

  return <Group justify="space-between" align="center"><div><Text fw={600}>Payment alerts</Text><Text size="sm" c="dimmed">{message || (subscription ? 'This device will be notified when an MR records a payment.' : supported ? 'Get notified when an MR records a payment.' : 'Push notifications require a supported browser and secure connection.')}</Text></div><Button disabled={!supported} loading={busy} variant={subscription ? 'default' : 'light'} leftSection={subscription ? <IconBellOff size={16} /> : <IconBell size={16} />} onClick={toggle}>{subscription ? 'Disable alerts' : 'Enable alerts'}</Button></Group>;
}

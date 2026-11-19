import { useState } from 'react';
import { Alert, Button, Center, Container, List, Paper, PasswordInput, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconAlertCircle, IconShieldLock } from '@tabler/icons-react';
import { authApi } from '../../api/authApi';
import { useAppDispatch, useAuth } from '../../hooks/useAppStore';
import { logout, setUserData, tokenRenewed } from '../../store/slices/authSlice';
import { getToken, isKeptSignedIn, saveToken } from '../../utils/authToken';

/**
 * Full screen after signing in with an easy-to-guess password (admin123,
 * mr123...): set a new one before using the app. This device stays signed
 * in; other devices are signed out.
 */
export default function ChangePasswordScreen() {
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mismatch = again.length > 0 && next !== again;
  const submit = async (event) => {
    event.preventDefault();
    if (next !== again) { setError("The new passwords don't match."); return; }
    setBusy(true); setError('');
    try {
      const data = await authApi.changePassword(null, next);
      saveToken(data.access_token, isKeptSignedIn());
      dispatch(tokenRenewed(data.access_token));
      dispatch(setUserData({ must_change_password: false }));
    } catch (err) {
      setError(err.detail || err.message || 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };
  const signOut = () => {
    authApi.logout(getToken()).catch(() => {});
    dispatch(logout());
  };

  return (
    <Center mih="100dvh" px="md" bg="var(--app-soft)">
      <Container size={420} w="100%">
        <Paper withBorder shadow="sm" radius="lg" p={{ base: 'lg', sm: 32 }}>
          <form onSubmit={submit}>
            <Stack gap="md">
              <Stack align="center" gap="xs">
                <ThemeIcon size={48} radius="md" color="green" variant="filled"><IconShieldLock size={26} /></ThemeIcon>
                <Title order={3} ta="center">Set a new password</Title>
                <Text size="sm" c="dimmed" ta="center">{user?.name ? `${user.name}, your` : 'Your'} password is too easy to guess. Choose a new one to keep the account safe.</Text>
              </Stack>
              {error && <Alert color="red" icon={<IconAlertCircle size={18} />}>{error}</Alert>}
              <PasswordInput label="New password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.currentTarget.value); setError(''); }} required minLength={8} maxLength={72} />
              <PasswordInput label="New password again" autoComplete="new-password" value={again} onChange={(e) => { setAgain(e.currentTarget.value); setError(''); }} required error={mismatch ? "Doesn't match" : null} />
              <List size="xs" c="dimmed" spacing={2}>
                <List.Item>At least 8 characters</List.Item>
                <List.Item>Not something easy like 12345678, admin123 or your employee code</List.Item>
              </List>
              <Button type="submit" loading={busy} disabled={next.length < 8 || mismatch}>Save new password</Button>
              <Button variant="subtle" color="gray" onClick={signOut}>Sign out</Button>
            </Stack>
          </form>
        </Paper>
      </Container>
    </Center>
  );
}

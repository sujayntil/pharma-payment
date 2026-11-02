import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Center, Container, Paper, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { IconAlertCircle, IconArrowRight, IconPill, IconUser } from '@tabler/icons-react';
import { useAppDispatch, useAuth } from '../hooks/useAppStore';
import { loginUser, clearError } from '../store/slices/authSlice';

export default function LoginPage() {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, role, loading, error } = useAuth();

  useEffect(() => {
    if (isAuthenticated && role) {
      navigate(location.state?.from?.pathname || (role === 'ADMIN' ? '/admin' : '/mr'), { replace: true });
    }
  }, [isAuthenticated, role, navigate, location]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!employeeCode.trim() || !password) return;
    dispatch(clearError());
    const result = await dispatch(loginUser({ employeeCode: employeeCode.trim(), password }));
    if (loginUser.fulfilled.match(result)) {
      navigate(result.payload.user.role === 'ADMIN' ? '/admin' : '/mr', { replace: true });
    }
  };

  return (
    <Center mih="100dvh" px="md" bg="gray.0">
      <Container size={420} w="100%">
        <Paper withBorder shadow="sm" radius="lg" p={{ base: 'lg', sm: 32 }}>
          <Stack gap="lg">
            <Stack align="center" gap="xs">
              <ThemeIcon size={48} radius="md" color="green" variant="filled"><IconPill size={26} /></ThemeIcon>
              <Title order={2} ta="center">Pharma Sales &amp; Collection</Title>
              <Text size="sm" c="dimmed" ta="center">Sign in with your employee code to continue.</Text>
            </Stack>

            {error && <Alert color="red" icon={<IconAlertCircle size={18} />} title="Sign in failed">{error}</Alert>}

            <form onSubmit={handleSubmit}>
              <Stack>
                <TextInput
                  label="Employee code"
                  placeholder="e.g. MR001 or ADMIN01"
                  leftSection={<IconUser size={17} />}
                  autoComplete="username"
                  value={employeeCode}
                  onChange={(event) => setEmployeeCode(event.currentTarget.value)}
                  required
                />
                <PasswordInput
                  label="Password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  required
                />
                <Button type="submit" fullWidth mt="xs" loading={loading} rightSection={<IconArrowRight size={17} />}>
                  Sign in
                </Button>
              </Stack>
            </form>
            <Text size="xs" c="dimmed" ta="center">If you need access, contact your administrator.</Text>
          </Stack>
        </Paper>
      </Container>
    </Center>
  );
}

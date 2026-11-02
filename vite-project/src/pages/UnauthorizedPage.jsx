import { Button, Center, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconArrowLeft, IconShieldLock } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAppStore';

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const destination = role === 'ADMIN' ? '/admin' : role === 'MR' ? '/mr' : '/login';

  return (
    <Center mih="100dvh" px="md" bg="gray.0">
      <Paper withBorder shadow="sm" radius="lg" p="xl" maw={440} w="100%">
        <Stack align="center" gap="sm">
          <ThemeIcon size={56} radius="xl" color="red" variant="light"><IconShieldLock size={29} /></ThemeIcon>
          <Title order={2} ta="center">Access restricted</Title>
          <Text c="dimmed" ta="center">Your account does not have permission to view this page.</Text>
          <Button leftSection={<IconArrowLeft size={17} />} onClick={() => navigate(destination)} mt="sm">Return to workspace</Button>
        </Stack>
      </Paper>
    </Center>
  );
}

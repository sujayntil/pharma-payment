import { Button, Center, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAppStore';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();
  const destination = !isAuthenticated ? '/login' : role === 'ADMIN' ? '/admin' : '/mr';

  return (
    <Center mih="100dvh" px="md" bg="gray.0">
      <Paper withBorder shadow="sm" radius="lg" p="xl" maw={440} w="100%">
        <Stack align="center" gap="sm">
          <ThemeIcon size={56} radius="xl" color="gray" variant="light"><Text fw={700}>404</Text></ThemeIcon>
          <Title order={2} ta="center">Page not found</Title>
          <Text c="dimmed" ta="center">The page you requested does not exist or has been moved.</Text>
          <Button leftSection={<IconArrowLeft size={17} />} onClick={() => navigate(destination)} mt="sm">Go to workspace</Button>
        </Stack>
      </Paper>
    </Center>
  );
}

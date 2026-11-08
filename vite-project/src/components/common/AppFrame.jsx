import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppShell,
  Avatar,
  Box,
  Burger,
  Button,
  Divider,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconLogout, IconPill } from '@tabler/icons-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppDispatch, useAuth } from '../../hooks/useAppStore';
import { logout, setUserData } from '../../store/slices/authSlice';
import { authApi } from '../../api/authApi';

/**
 * bottomNav: on phones, show the sections as a bottom tab bar instead of the
 * burger menu (MR app). Desktop keeps the left sidebar either way.
 */
export default function AppFrame({ items, active, onChange, children, bottomNav = false }) {
  const [opened, setOpened] = useState(false);
  const isMobile = useIsMobile();
  const useBottomNav = bottomNav && isMobile;
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const userId = user?.id;
  const userName = user?.name;
  const initials = user?.name?.trim().slice(0, 1).toUpperCase() || '';

  useEffect(() => {
    if (!userId || userName) return undefined;
    let active = true;
    authApi.getCurrentUser()
      .then((profile) => {
        if (active) dispatch(setUserData(profile));
      })
      .catch(() => { /* Keep the session on transient profile-load errors. */ });
    return () => { active = false; };
  }, [dispatch, userId, userName]);

  const choose = (id) => {
    onChange(id);
    setOpened(false);
  };

  const signOut = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 244, breakpoint: 'sm', collapsed: { mobile: useBottomNav || !opened } }}
      footer={useBottomNav ? { height: 'calc(64px + env(safe-area-inset-bottom, 0px))' } : undefined}
      padding="md"
    >
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between">
          <Group gap="sm">
            {!useBottomNav && <Burger opened={opened} onClick={() => setOpened((value) => !value)} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />}
            <ThemeIcon size={34} radius="md" variant="filled"><IconPill size={19} /></ThemeIcon>
            <div>
              <Text fw={700} size="sm">Pharma Sales</Text>
              <Text c="dimmed" size="xs">Collection workspace</Text>
            </div>
          </Group>
          <Menu shadow="md" width={190} position="bottom-end">
            <Menu.Target>
              <UnstyledButton aria-label="Open user menu">
                <Group gap="xs">
                  <Avatar color="green" radius="xl">{initials}</Avatar>
                  <Box visibleFrom="sm">
                    <Text size="sm" fw={600}>{user?.name || 'User'}</Text>
                    <Text size="xs" c="dimmed">{role === 'ADMIN' ? 'Administrator' : 'Medical representative'}</Text>
                  </Box>
                  <IconChevronDown size={15} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{role === 'ADMIN' ? 'Administrator' : 'Medical representative'}</Menu.Label>
              <Menu.Item color="red" leftSection={<IconLogout size={15} />} onClick={signOut}>Log out</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed" px="sm" mb={4}>Workspace</Text>
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.id}
                  active={active === item.id}
                  label={item.label}
                  leftSection={<Icon size={18} stroke={1.8} />}
                  onClick={() => choose(item.id)}
                  variant="light"
                  color="green"
                />
              );
            })}
          </Stack>
        </AppShell.Section>
        <AppShell.Section>
          <Divider my="sm" />
          <Button variant="subtle" color="gray" fullWidth justify="flex-start" leftSection={<IconLogout size={17} />} onClick={signOut}>Log out</Button>
        </AppShell.Section>
      </AppShell.Navbar>

      {useBottomNav && (
        <AppShell.Footer style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <nav aria-label="Main" style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, height: 64 }}>
            {items.map((item) => {
              const Icon = item.icon;
              const current = active === item.id;
              return (
                <UnstyledButton
                  key={item.id}
                  onClick={() => choose(item.id)}
                  aria-current={current ? 'page' : undefined}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: current ? 'var(--mantine-color-green-7)' : 'var(--mantine-color-gray-6)' }}
                >
                  <Icon size={22} stroke={current ? 2.2 : 1.8} />
                  <Text size="xs" fw={current ? 700 : 500} c="inherit">{item.label}</Text>
                </UnstyledButton>
              );
            })}
          </nav>
        </AppShell.Footer>
      )}

      <AppShell.Main>
        <div style={{ maxWidth: 1440, margin: '0 auto' }}>{children}</div>
      </AppShell.Main>
    </AppShell>
  );
}

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
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconLogout, IconPill } from '@tabler/icons-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBackClose } from '../../hooks/useBackClose';
import { useAppDispatch, useAuth } from '../../hooks/useAppStore';
import DailyWelcome from './DailyWelcome';

/* global __APP_NUMBER__ */
// The release number people see, e.g. "2.0.1" (package.json "version").
const APP_NUMBER = typeof __APP_NUMBER__ === 'undefined' ? 'dev' : __APP_NUMBER__;
import { logout, setUserData } from '../../store/slices/authSlice';
import { authApi } from '../../api/authApi';
import AppRefreshProvider from './AppRefreshProvider';
import PullToRefresh from './PullToRefresh';
import RefreshButton from './RefreshButton';
import NotificationBell from './NotificationBell';
import { BELL_REFRESH_EVENT } from '../../utils/appEvents';

const NAV_KEY = 'nav-collapsed';
const readCollapsed = () => { try { return window.localStorage.getItem(NAV_KEY) === '1'; } catch { return false; } };
const saveCollapsed = (value) => { try { window.localStorage.setItem(NAV_KEY, value ? '1' : '0'); } catch { /* storage off */ } };

/**
 * bottomNav: on phones, show the sections as a bottom tab bar instead of the
 * burger menu (MR app). Desktop keeps the left sidebar either way.
 *
 * Laptop sidebar can be collapsed with the small round handle on its right
 * edge to a narrow rail of icons with a small label under each; the choice
 * is remembered in this browser.
 * items: [{ id, label, icon, shortLabel? }] -- shortLabel is used in the rail.
 */
export default function AppFrame({ items, active, onChange, children, bottomNav = false }) {
  const [opened, setOpened] = useState(false);
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const compact = collapsed && !isMobile;
  const toggleCollapsed = () => setCollapsed((value) => { saveCollapsed(!value); return !value; });
  const useBottomNav = bottomNav && isMobile;
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, role, token } = useAuth();
  const userId = user?.id;
  const initials = user?.name?.trim().slice(0, 1).toUpperCase() || '';

  // Profile refreshed once per app open, so a change made in Admin → Users
  // (name, King / Queen) shows without signing in again.
  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    authApi.getCurrentUser()
      .then((profile) => {
        if (active) dispatch(setUserData(profile));
      })
      .catch(() => { /* Keep the session on transient profile-load errors. */ });
    return () => { active = false; };
  }, [dispatch, userId]);

  // Messages from the service worker: a tapped payment alert asks to open
  // its invoice (the app was already open), and an alert that arrives while
  // the app is open refreshes the bell.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      const message = event.data || {};
      if (message.type === 'open' && typeof message.path === 'string' && message.path.startsWith('/')) navigate(message.path);
      if (message.type === 'payment') window.dispatchEvent(new Event(BELL_REFRESH_EVENT));
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  // Phone Back closes the ☰ menu (Admin) instead of leaving the screen.
  const menuOpen = opened && isMobile && !useBottomNav;
  useBackClose(menuOpen, () => setOpened(false));
  // Picking a section from the open ☰ menu: close the menu first (which also
  // drops its Back entry), then go to the section once that has settled, so
  // Back from the new section returns to the previous one in a single press.
  const choose = (id) => {
    if (menuOpen) {
      setOpened(false);
      setTimeout(() => onChange(id), 120);
      return;
    }
    onChange(id);
  };

  const signOut = () => {
    // Tell the server to end this session; signing out locally never waits on it.
    authApi.logout(token).catch(() => {});
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <AppRefreshProvider>
    {/* MR on phone: pull down from the top to refresh (no button needed). */}
    {useBottomNav && <PullToRefresh top={52} />}
    <AppShell
      // Phones get a slimmer header so the lists below have more room.
      header={{ height: isMobile ? 52 : 64 }}
      navbar={{ width: compact ? 84 : 244, breakpoint: 'sm', collapsed: { mobile: useBottomNav || !opened } }}
      footer={useBottomNav ? { height: 'calc(64px + env(safe-area-inset-bottom, 0px))' } : undefined}
      padding="md"
    >
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between">
          <Group gap="sm">
            {!useBottomNav && <Burger opened={opened} onClick={() => setOpened((value) => !value)} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />}
            <ThemeIcon size={isMobile ? 28 : 34} radius="md" variant="filled"><IconPill size={isMobile ? 16 : 19} /></ThemeIcon>
            <div>
              <Text fw={700} size="sm">Portal</Text>
              {!isMobile && <Text c="dimmed" size="xs">Collection workspace</Text>}
            </div>
          </Group>
          <Group gap={isMobile ? 'xs' : 'md'} wrap="nowrap">
          {/* Refresh: Admin everywhere, MR on laptop (MR phones pull down instead). */}
          {!useBottomNav && <RefreshButton size={isMobile ? 34 : 38} />}
          {role === 'ADMIN' && <NotificationBell size={isMobile ? 34 : 38} />}
          <Menu shadow="md" width={190} position="bottom-end">
            <Menu.Target>
              <UnstyledButton aria-label="Open user menu">
                <Group gap="xs">
                  <Avatar color="green" radius="xl" size={isMobile ? 32 : 38}>{initials}</Avatar>
                  <Box visibleFrom="sm">
                    <Text size="sm" fw={600}>{user?.name || 'User'}</Text>
                    <Text size="xs" c="dimmed">{role === 'ADMIN' ? 'Administrator' : 'Medical representative'}</Text>
                  </Box>
                  {!isMobile && <IconChevronDown size={15} />}
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              {/* Who is signed in, then the one action. */}
              <Box px="sm" py={6}>
                <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>{user?.name || 'User'}</Text>
                <Text size="xs" c="dimmed">{role === 'ADMIN' ? 'Administrator' : 'Medical representative'}</Text>
                {/* Which build this is, so anyone can check they have the latest update. */}
                <Text size="xs" c="dimmed" mt={4}>Version {APP_NUMBER}</Text>
              </Box>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconLogout size={15} />} onClick={signOut}>Log out</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p={compact ? 6 : 'sm'} style={{ transition: 'width 150ms ease', overflow: 'visible' }}>
        {!isMobile && (
          // Round handle on the sidebar's right border.
          <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} position="right" withArrow openDelay={300}>
            <UnstyledButton
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              style={{
                position: 'absolute', top: compact ? 10 : 18, right: -12, zIndex: 5, width: 24, height: 24, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--mantine-color-body)', border: '1px solid var(--mantine-color-gray-3)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)', color: 'var(--mantine-color-gray-7)',
              }}
            >
              {collapsed ? <IconChevronRight size={14} stroke={2.2} /> : <IconChevronLeft size={14} stroke={2.2} />}
            </UnstyledButton>
          </Tooltip>
        )}
        <AppShell.Section grow component={ScrollArea}>
          {compact ? (
            // Narrow rail: icon with a small label under it; full name on hover.
            // The top gap keeps the edge handle clear of the first item.
            <Stack gap={4} align="stretch" mt={34}>
              {items.map((item) => {
                const Icon = item.icon;
                const current = active === item.id;
                return (
                  <Tooltip key={item.id} label={item.label} position="right" withArrow openDelay={300}>
                    <UnstyledButton
                      onClick={() => choose(item.id)}
                      aria-label={item.label}
                      aria-current={current ? 'page' : undefined}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 2px', borderRadius: 8,
                        background: current ? 'var(--mantine-color-green-light)' : undefined,
                        color: current ? 'var(--mantine-color-green-8)' : 'var(--mantine-color-gray-7)',
                      }}
                    >
                      <Icon size={22} stroke={current ? 2.1 : 1.8} />
                      <Text size="11px" fw={current ? 700 : 500} lh={1.2} ta="center" style={{ maxWidth: 76 }}>{item.shortLabel || item.label}</Text>
                    </UnstyledButton>
                  </Tooltip>
                );
              })}
            </Stack>
          ) : (
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
          )}
        </AppShell.Section>
        <AppShell.Section>
          <Divider my="sm" />
          {compact ? (
            <Stack gap={4} align="stretch">
              <Tooltip label="Log out" position="right" withArrow openDelay={300}>
                <UnstyledButton onClick={signOut} aria-label="Log out" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 2px', borderRadius: 8, color: 'var(--mantine-color-gray-7)' }}>
                  <IconLogout size={20} />
                  <Text size="11px" fw={500}>Log out</Text>
                </UnstyledButton>
              </Tooltip>
            </Stack>
          ) : (
            <Button variant="subtle" color="gray" fullWidth justify="flex-start" leftSection={<IconLogout size={17} />} onClick={signOut}>Log out</Button>
          )}
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
    {/* First open of the day: a short welcome, then the app. */}
    <DailyWelcome />
    </AppRefreshProvider>
  );
}

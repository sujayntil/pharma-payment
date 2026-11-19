import { lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { IconChartBar, IconChartPie, IconFileInvoice, IconUsers, IconTrophy, IconUserCog, IconCash, IconFileSpreadsheet, IconShieldCheck } from '@tabler/icons-react';
import AppFrame from '../../components/common/AppFrame';

const AdminDashboard = lazy(() => import('./AdminDashboard'));
const AdminInsights = lazy(() => import('./AdminInsights'));
const AdminInvoices = lazy(() => import('./AdminInvoices'));
const AdminCustomers = lazy(() => import('./AdminCustomers'));
const AdminPerformance = lazy(() => import('./AdminPerformance'));
const AdminUsers = lazy(() => import('./AdminUsers'));
const AdminCollections = lazy(() => import('./AdminCollections'));
const AdminImport = lazy(() => import('./AdminImport'));
const AdminAuditLog = lazy(() => import('./AdminAuditLog'));

// "Last 7 days" for the Dashboard's deletions note (India dates).
const lastDays = (n) => {
  const day = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const now = new Date();
  return { from: day(new Date(now.getTime() - (n - 1) * 86400000)), to: day(now) };
};

const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: IconChartBar },
  { id: 'insights', label: 'Insights', icon: IconChartPie },
  { id: 'invoices', label: 'Invoices', icon: IconFileInvoice },
  { id: 'customers', label: 'Customers', icon: IconUsers },
  { id: 'collections', label: 'Collections', icon: IconCash },
  { id: 'import', label: 'Import & mapping', shortLabel: 'Import', icon: IconFileSpreadsheet },
  { id: 'performance', label: 'MR Performance', shortLabel: 'Performance', icon: IconTrophy },
  { id: 'users', label: 'Users', icon: IconUserCog },
  { id: 'audit', label: 'Audit log', shortLabel: 'Audit', icon: IconShieldCheck },
];

export default function AdminLayout() {
  // The current tab lives in the address (/admin, /admin/invoices, ...) so
  // Back moves between tabs and a reload keeps the tab.
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split('/')[2];
  const activeTab = ADMIN_TABS.some((tab) => tab.id === segment) ? segment : 'dashboard';
  const tabPath = (tab) => (tab === 'dashboard' ? '/admin' : `/admin/${tab}`);
  // Set when the Dashboard opens a customer; the key remounts Customers on it.
  const openCustomer = activeTab === 'customers' ? (location.state?.openCustomer ?? null) : null;
  const choose = (tab) => { if (tab !== activeTab || openCustomer || location.state?.collectionsFilters || location.state?.auditView) navigate(tabPath(tab)); };

  return (
    <AppFrame items={ADMIN_TABS} active={activeTab} onChange={choose}>
      <main>
        <Suspense fallback={<Center py="xl"><Loader size="sm" /></Center>}>
        {activeTab === 'dashboard' && <AdminDashboard onOpenCustomer={(customer) => navigate(tabPath('customers'), { state: { openCustomer: customer } })} onOpenDeleted={() => navigate(tabPath('audit'), { state: { auditView: 'deleted' } })} />}
        {activeTab === 'insights' && <AdminInsights onOpenCustomer={(customer) => navigate(tabPath('customers'), { state: { openCustomer: customer } })} />}
        {activeTab === 'invoices' && <AdminInvoices />}
        {activeTab === 'customers' && <AdminCustomers key={openCustomer?.id ?? 'list'} openCustomer={openCustomer} />}
        {/* From Insights ("See in Collections"): opens already filtered. */}
        {activeTab === 'collections' && <AdminCollections key={location.state?.collectionsFilters ? JSON.stringify(location.state.collectionsFilters) : 'plain'} preset={location.state?.collectionsFilters ?? null} />}
        {activeTab === 'import' && <AdminImport />}
        {activeTab === 'performance' && <AdminPerformance />}
        {activeTab === 'users' && <AdminUsers />}
        {activeTab === 'audit' && <AdminAuditLog key={location.state?.auditView || 'plain'} initialView={location.state?.auditView} deletedPreset={location.state?.auditView === 'deleted' ? { range: lastDays(7) } : null} />}
        </Suspense>
      </main>
    </AppFrame>
  );
}


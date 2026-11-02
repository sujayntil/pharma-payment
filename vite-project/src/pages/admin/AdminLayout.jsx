import { lazy, Suspense, useState } from 'react';
import { Center, Loader } from '@mantine/core';
import { IconChartBar, IconFileInvoice, IconUsers, IconTrophy, IconUserCog, IconCash, IconFileSpreadsheet } from '@tabler/icons-react';
import AppFrame from '../../components/common/AppFrame';

const AdminDashboard = lazy(() => import('./AdminDashboard'));
const AdminInvoices = lazy(() => import('./AdminInvoices'));
const AdminCustomers = lazy(() => import('./AdminCustomers'));
const AdminPerformance = lazy(() => import('./AdminPerformance'));
const AdminUsers = lazy(() => import('./AdminUsers'));
const AdminCollections = lazy(() => import('./AdminCollections'));
const AdminImport = lazy(() => import('./AdminImport'));

const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: IconChartBar },
  { id: 'invoices', label: 'Invoices', icon: IconFileInvoice },
  { id: 'customers', label: 'Customers', icon: IconUsers },
  { id: 'collections', label: 'Collections', icon: IconCash },
  { id: 'import', label: 'Import & mapping', icon: IconFileSpreadsheet },
  { id: 'performance', label: 'MR Performance', icon: IconTrophy },
  { id: 'users', label: 'Users', icon: IconUserCog },
];

export default function AdminLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <AppFrame items={ADMIN_TABS} active={activeTab} onChange={setActiveTab}>
      <main>
        <Suspense fallback={<Center py="xl"><Loader size="sm" /></Center>}>
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'invoices' && <AdminInvoices />}
        {activeTab === 'customers' && <AdminCustomers />}
        {activeTab === 'collections' && <AdminCollections />}
        {activeTab === 'import' && <AdminImport />}
        {activeTab === 'performance' && <AdminPerformance />}
        {activeTab === 'users' && <AdminUsers />}
        </Suspense>
      </main>
    </AppFrame>
  );
}


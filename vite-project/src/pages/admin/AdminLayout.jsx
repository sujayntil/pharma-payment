import { useState } from 'react';
import { IconChartBar, IconFileInvoice, IconUsers, IconTrophy, IconUserCog, IconCash, IconFileSpreadsheet } from '@tabler/icons-react';
import AppFrame from '../../components/common/AppFrame';
import AdminDashboard from './AdminDashboard';
import AdminInvoices from './AdminInvoices';
import AdminCustomers from './AdminCustomers';
import AdminPerformance from './AdminPerformance';
import AdminUsers from './AdminUsers';
import AdminCollections from './AdminCollections';
import AdminImport from './AdminImport';

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
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'invoices' && <AdminInvoices />}
        {activeTab === 'customers' && <AdminCustomers />}
        {activeTab === 'collections' && <AdminCollections />}
        {activeTab === 'import' && <AdminImport />}
        {activeTab === 'performance' && <AdminPerformance />}
        {activeTab === 'users' && <AdminUsers />}
      </main>
    </AppFrame>
  );
}


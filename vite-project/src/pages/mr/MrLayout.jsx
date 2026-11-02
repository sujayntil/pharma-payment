import { lazy, Suspense, useState } from 'react';
import { Center, Loader } from '@mantine/core';
import { IconChartBar, IconFileUpload, IconFileInvoice, IconCash, IconUsers } from '@tabler/icons-react';
import AppFrame from '../../components/common/AppFrame';

const MrDashboard = lazy(() => import('./MrDashboard'));
const MrUploadInvoice = lazy(() => import('./MrUploadInvoice'));
const MrInvoices = lazy(() => import('./MrInvoices'));
const MrCollections = lazy(() => import('./MrCollections'));
const MrCustomers = lazy(() => import('./MrCustomers'));

const MR_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: IconChartBar },
  { id: 'upload', label: 'Upload Invoice', icon: IconFileUpload },
  { id: 'invoices', label: 'My Invoices', icon: IconFileInvoice },
  { id: 'customers', label: 'Customers', icon: IconUsers },
  { id: 'collections', label: 'My Collections', icon: IconCash },
];

export default function MrLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <AppFrame items={MR_TABS} active={activeTab} onChange={setActiveTab}>
      <main>
        <Suspense fallback={<Center py="xl"><Loader size="sm" /></Center>}>
        {activeTab === 'dashboard' && (
          <MrDashboard onNavigateToUpload={() => setActiveTab('upload')} />
        )}
        {activeTab === 'upload' && (
          <MrUploadInvoice onDone={() => setActiveTab('invoices')} />
        )}
        {activeTab === 'invoices' && <MrInvoices />}
        {activeTab === 'customers' && <MrCustomers />}
        {activeTab === 'collections' && <MrCollections />}
        </Suspense>
      </main>
    </AppFrame>
  );
}


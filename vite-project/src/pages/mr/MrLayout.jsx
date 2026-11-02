import { useState } from 'react';
import { IconChartBar, IconFileUpload, IconFileInvoice, IconCash } from '@tabler/icons-react';
import AppFrame from '../../components/common/AppFrame';
import MrDashboard from './MrDashboard';
import MrUploadInvoice from './MrUploadInvoice';
import MrInvoices from './MrInvoices';
import MrCollections from './MrCollections';

const MR_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: IconChartBar },
  { id: 'upload', label: 'Upload Invoice', icon: IconFileUpload },
  { id: 'invoices', label: 'My Invoices', icon: IconFileInvoice },
  { id: 'collections', label: 'My Collections', icon: IconCash },
];

export default function MrLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <AppFrame items={MR_TABS} active={activeTab} onChange={setActiveTab}>
      <main>
        {activeTab === 'dashboard' && (
          <MrDashboard onNavigateToUpload={() => setActiveTab('upload')} />
        )}
        {activeTab === 'upload' && (
          <MrUploadInvoice onDone={() => setActiveTab('invoices')} />
        )}
        {activeTab === 'invoices' && <MrInvoices />}
        {activeTab === 'collections' && <MrCollections />}
      </main>
    </AppFrame>
  );
}


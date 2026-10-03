import { useState } from 'react';
import {
  LayoutDashboard,
  Upload,
  FileText,
  DollarSign,
} from 'lucide-react';
import Topbar from '../../components/common/Topbar';
import TabNavigation from '../../components/common/TabNavigation';
import MrDashboard from './MrDashboard';
import MrUploadInvoice from './MrUploadInvoice';
import MrInvoices from './MrInvoices';
import MrCollections from './MrCollections';

const MR_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'upload', label: 'Upload Invoice', icon: Upload },
  { id: 'invoices', label: 'My Invoices', icon: FileText },
  { id: 'collections', label: 'My Collections', icon: DollarSign },
];

export default function MrLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-[#f4f6f4] flex flex-col">
      <Topbar />
      <TabNavigation
        tabs={MR_TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <MrDashboard onNavigateToUpload={() => setActiveTab('upload')} />
        )}
        {activeTab === 'upload' && (
          <MrUploadInvoice onDone={() => setActiveTab('invoices')} />
        )}
        {activeTab === 'invoices' && <MrInvoices />}
        {activeTab === 'collections' && <MrCollections />}
      </main>
    </div>
  );
}


import { lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { IconHome, /* IconChartBar, IconFileUpload, IconCash, */ IconFileInvoice, IconUsers } from '@tabler/icons-react';
import AppFrame from '../../components/common/AppFrame';

const MrDashboard = lazy(() => import('./MrDashboard'));
// Disabled: Add Invoice (Upload Invoice) removed. Re-enable if needed.
// const MrUploadInvoice = lazy(() => import('./MrUploadInvoice'));
// Disabled: "My Invoices" and "My Collections" are merged into one "Invoices"
// screen (MrInvoiceList). The old screens are kept unchanged; re-enable by
// restoring these imports and the tabs/routes below.
// const MrInvoices = lazy(() => import('./MrInvoices'));
// const MrCollections = lazy(() => import('./MrCollections'));
const MrInvoiceList = lazy(() => import('./MrInvoiceList'));
const MrCustomers = lazy(() => import('./MrCustomers'));

const MR_TABS = [
  { id: 'dashboard', label: 'Home', icon: IconHome },
  // Disabled: Add Invoice removed from the Workspace tab. Re-enable if needed.
  // { id: 'upload', label: 'Upload Invoice', icon: IconFileUpload },
  // Disabled (merged into "Invoices"). Re-enable if needed:
  // { id: 'invoices', label: 'My Invoices', icon: IconFileInvoice },
  // { id: 'collections', label: 'My Collections', icon: IconCash },
  { id: 'invoices', label: 'Invoices', icon: IconFileInvoice },
  { id: 'customers', label: 'Customers', icon: IconUsers },
];

export default function MrLayout() {
  // The current tab lives in the address (/mr, /mr/invoices, /mr/customers) so
  // the phone's Back button moves between tabs and a reload keeps the tab.
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split('/')[2];
  const activeTab = MR_TABS.some((tab) => tab.id === segment) ? segment : 'dashboard';
  const tabPath = (tab) => (tab === 'dashboard' ? '/mr' : `/mr/${tab}`);
  // Set when Home opens a customer directly; the key remounts Customers on it.
  const openCustomer = activeTab === 'customers' ? (location.state?.openCustomer ?? null) : null;
  const choose = (tab) => { if (tab !== activeTab || openCustomer) navigate(tabPath(tab)); };

  return (
    <AppFrame items={MR_TABS} active={activeTab} onChange={choose} bottomNav>
      <main>
        <Suspense fallback={<Center py="xl"><Loader size="sm" /></Center>}>
        {activeTab === 'dashboard' && (
          <MrDashboard
            onOpenPending={() => choose('invoices')}
            onOpenCustomer={(customer) => navigate(tabPath('customers'), { state: { openCustomer: customer } })}
            /* Disabled: onNavigateToUpload={() => setActiveTab('upload')} */
          />
        )}
        {/* Disabled: Add Invoice (Upload Invoice). Re-enable if needed.
        {activeTab === 'upload' && (
          <MrUploadInvoice onDone={() => setActiveTab('invoices')} />
        )} */}
        {/* Disabled (merged into "Invoices"). Re-enable if needed:
        {activeTab === 'invoices' && <MrInvoices />}
        {activeTab === 'collections' && <MrCollections />} */}
        {activeTab === 'invoices' && <MrInvoiceList />}
        {activeTab === 'customers' && <MrCustomers key={openCustomer?.id ?? 'list'} openCustomer={openCustomer} />}
        </Suspense>
      </main>
    </AppFrame>
  );
}

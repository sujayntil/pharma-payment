import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { IconHome, /* IconChartBar, IconFileUpload, IconCash, */ IconFileInvoice, IconUsers } from '@tabler/icons-react';
import AppFrame from '../../components/common/AppFrame';
import { useAuth } from '../../hooks/useAppStore';
import { resumePlace, saveResume } from '../../utils/resume';

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
const CustomerProfile = lazy(() => import('../common/CustomerProfile'));

const MR_TABS = [
  { id: 'dashboard', label: 'Home', icon: IconHome },
  // Disabled: Add Invoice removed from the Workspace tab. Re-enable if needed.
  // { id: 'upload', label: 'Upload Invoice', icon: IconFileUpload },
  // Disabled (merged into "Invoices"). Re-enable if needed:
  // { id: 'invoices', label: 'My Invoices', icon: IconFileInvoice },
  // { id: 'collections', label: 'My Collections', icon: IconCash },
  // Customers before Invoices: MRs work shop by shop (Bulk collect, Recent).
  { id: 'customers', label: 'Customers', icon: IconUsers },
  { id: 'invoices', label: 'Invoices', icon: IconFileInvoice },
];

export default function MrLayout() {
  // The current tab lives in the address (/mr, /mr/invoices, /mr/customers) so
  // the phone's Back button moves between tabs and a reload keeps the tab.
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split('/')[2];
  // /mr/customers/123: that customer's page (own customers only).
  const profileId = segment === 'customers' && /^\d+$/.test(location.pathname.split('/')[3] || '') ? Number(location.pathname.split('/')[3]) : null;
  const activeTab = MR_TABS.some((tab) => tab.id === segment) ? segment : 'dashboard';
  const tabPath = (tab) => (tab === 'dashboard' ? '/mr' : `/mr/${tab}`);
  // Set when Home opens a customer directly; the key remounts Customers on it.
  const openCustomer = activeTab === 'customers' ? (location.state?.openCustomer ?? null) : null;
  const choose = (tab) => { if (tab !== activeTab || openCustomer || profileId) navigate(tabPath(tab)); };

  // Reopen where the MR left off (tab and open customer) if the app comes
  // back within 30 minutes; a fresh start later still opens Home.
  const { userId } = useAuth();
  const [resume] = useState(() => (
    location.pathname.replace(/\/$/, '') === '/mr' && !location.state ? resumePlace(userId) : null
  ));
  useEffect(() => {
    if (resume) navigate(resume.path, { replace: true, state: resume.customer ? { openCustomer: resume.customer } : undefined });
  }, [resume, navigate]);
  useEffect(() => {
    const path = tabPath(activeTab);
    saveResume(userId, path === '/mr/customers' ? { path } : { path, customer: null });
  }, [activeTab, userId]);
  useEffect(() => {
    // Leaving the app (call, WhatsApp): note the time so the 30 minutes count from here.
    const onHide = () => { if (document.hidden) saveResume(userId, {}); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [userId]);

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
        {profileId && <CustomerProfile key={profileId} customerId={profileId} base="/mr" />}
        {activeTab === 'customers' && !profileId && <MrCustomers key={openCustomer?.id ?? 'list'} openCustomer={openCustomer} />}
        </Suspense>
      </main>
    </AppFrame>
  );
}

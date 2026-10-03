import { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Users,
  Award,
  UserCheck,
} from 'lucide-react';
import Topbar from '../../components/common/Topbar';
import TabNavigation from '../../components/common/TabNavigation';
import AdminDashboard from './AdminDashboard';
import AdminInvoices from './AdminInvoices';
import AdminCustomers from './AdminCustomers';
import AdminPerformance from './AdminPerformance';
import AdminUsers from './AdminUsers';

const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'performance', label: 'MR Performance', icon: Award },
  { id: 'users', label: 'Users', icon: UserCheck },
];

export default function AdminLayout() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-[#f4f6f4] flex flex-col">
      <Topbar />
      <TabNavigation
        tabs={ADMIN_TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'invoices' && <AdminInvoices />}
        {activeTab === 'customers' && <AdminCustomers />}
        {activeTab === 'performance' && <AdminPerformance />}
        {activeTab === 'users' && <AdminUsers />}
      </main>
    </div>
  );
}


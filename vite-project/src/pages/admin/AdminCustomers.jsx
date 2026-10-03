import { useEffect } from 'react';
import {
  Search,
  Users,
  BookOpen,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Receipt,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import {
  fetchCustomers,
  fetchCustomerLedger,
  setSearchQuery,
  setLedgerSearchQuery,
  clearSelectedLedger,
} from '../../store/slices/customerSlice';
import StatCard from '../../components/common/StatCard';
import StatusPill from '../../components/common/StatusPill';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import { money } from '../../utils/formatters';

export default function AdminCustomers() {
  const dispatch = useAppDispatch();
  const {
    customers,
    selectedLedger,
    loading,
    ledgerLoading,
    searchQuery,
    ledgerSearchQuery,
  } = useAppSelector((state) => state.customers);

  useEffect(() => {
    dispatch(fetchCustomers());
  }, [dispatch]);

  const handleSearchChange = (e) => {
    dispatch(setSearchQuery(e.target.value));
  };

  const handleLedgerSearchChange = (e) => {
    dispatch(setLedgerSearchQuery(e.target.value));
  };

  const openLedger = (customerId) => {
    dispatch(fetchCustomerLedger(customerId));
  };

  const closeLedger = () => {
    dispatch(clearSelectedLedger());
  };

  // Filter customers by search
  const filteredCustomers = customers.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.type?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    );
  });

  // Filter customer ledger invoices by search
  const ledgerInvoices = selectedLedger?.invoices || [];
  const filteredLedgerInvoices = ledgerInvoices.filter((inv) => {
    if (!ledgerSearchQuery.trim()) return true;
    const q = ledgerSearchQuery.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.mr?.toLowerCase().includes(q) ||
      inv.status?.toLowerCase().includes(q) ||
      inv.mode?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Customers Header & Search */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1c2321]">
              Customer Ledgers
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-[#5b6660]">
              Browse pharmacies, clinics, and doctors with complete billing histories.
            </p>
          </div>

          <div className="relative w-full sm:w-80">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Search size={15} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by customer name or type…"
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-gray-50 text-[#1c2321] border border-[#d7dcd9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2f6f4e] focus:bg-white transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-[#5b6660]">
            Loading customers…
          </div>
        ) : filteredCustomers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No customers found"
            description="No customers match your search criteria."
          />
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#d7dcd9] text-xs font-semibold text-[#5b6660]">
                    <th className="py-3 px-3">Customer Name</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Phone</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d7dcd9]">
                  {filteredCustomers.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-3 font-semibold text-[#1c2321]">
                        {c.name}
                      </td>
                      <td className="py-3 px-3 text-xs text-[#5b6660]">
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 font-medium">
                          {c.type || 'General'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs font-mono text-[#5b6660]">
                        {c.phone || '—'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => openLedger(c.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-100 text-[#1c2321] border border-[#d7dcd9] text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                        >
                          <BookOpen size={13} className="text-[#2f6f4e]" />
                          <span>View Ledger</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="sm:hidden space-y-3">
              {filteredCustomers.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 bg-gray-50/70 rounded-xl border border-[#d7dcd9] flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-xs text-[#1c2321]">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-[#5b6660] mt-0.5">
                      {c.type || 'General'} · {c.phone || 'No phone'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openLedger(c.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white text-[#1c2321] border border-[#d7dcd9] text-xs font-semibold rounded-lg shadow-2xs cursor-pointer"
                  >
                    <BookOpen size={13} className="text-[#2f6f4e]" />
                    <span>Ledger</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Customer Ledger Modal / Drawer */}
      <Modal
        isOpen={!!selectedLedger}
        onClose={closeLedger}
        title={`Ledger — ${selectedLedger?.customer?.name || 'Customer'}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-5">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Total Invoiced"
              value={money(selectedLedger?.total_invoiced)}
              icon={TrendingUp}
            />
            <StatCard
              label="Total Paid"
              value={money(selectedLedger?.total_paid)}
              icon={DollarSign}
            />
            <StatCard
              label="Outstanding"
              value={money(selectedLedger?.outstanding)}
              accent={true}
              icon={AlertTriangle}
            />
          </div>

          {/* Ledger Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Search size={15} />
            </span>
            <input
              type="text"
              value={ledgerSearchQuery}
              onChange={handleLedgerSearchChange}
              placeholder="Search by invoice number, MR, or payment mode…"
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-gray-50 text-[#1c2321] border border-[#d7dcd9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2f6f4e] focus:bg-white transition-all"
            />
          </div>

          {/* Ledger Invoices */}
          {ledgerLoading ? (
            <div className="py-8 text-center text-xs text-[#5b6660]">
              Loading ledger data…
            </div>
          ) : filteredLedgerInvoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices found in ledger"
              description="No invoice records match this customer or search term."
            />
          ) : (
            <div>
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#d7dcd9] text-xs font-semibold text-[#5b6660]">
                      <th className="py-2.5 px-3">Invoice</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">MR</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Mode</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d7dcd9]">
                    {filteredLedgerInvoices.map((inv, idx) => (
                      <tr
                        key={inv.invoice_number || idx}
                        className="hover:bg-gray-50"
                      >
                        <td className="py-2.5 px-3 font-mono font-medium text-[#1c2321]">
                          {inv.invoice_number}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-[#5b6660]">
                          {inv.date || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-[#5b6660]">
                          {inv.mr || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1c2321]">
                          {money(inv.amount)}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-[#5b6660]">
                          {inv.mode || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <StatusPill status={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="sm:hidden space-y-2.5">
                {filteredLedgerInvoices.map((inv, idx) => (
                  <div
                    key={inv.invoice_number || idx}
                    className="p-3 bg-gray-50 rounded-xl border border-[#d7dcd9] space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[#1c2321]">
                        {inv.invoice_number}
                      </span>
                      <StatusPill status={inv.status} />
                    </div>
                    <div className="text-[11px] text-[#5b6660] flex items-center justify-between">
                      <span>MR: {inv.mr || '—'}</span>
                      <span>{inv.date || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                      <span className="text-[11px] text-[#5b6660]">
                        Mode: {inv.mode || '—'}
                      </span>
                      <span className="font-mono text-xs font-bold text-[#1c2321]">
                        {money(inv.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}


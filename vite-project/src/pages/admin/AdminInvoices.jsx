import { useEffect, useState, useCallback } from 'react';
import { Search, Filter, FileText } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import {
  fetchAdminInvoices,
  setAdminFilters,
} from '../../store/slices/invoiceSlice';
import { fetchUsers } from '../../store/slices/adminSlice';
import DateFilter from '../../components/common/DateFilter';
import StatusPill from '../../components/common/StatusPill';
import EmptyState from '../../components/common/EmptyState';
import { money } from '../../utils/formatters';

export default function AdminInvoices() {
  const dispatch = useAppDispatch();
  const { allInvoices, loading, adminFilters } = useAppSelector(
    (state) => state.invoices
  );
  const { users } = useAppSelector((state) => state.admin);

  const [search, setSearch] = useState(adminFilters.search || '');

  const loadInvoices = useCallback(
    (
      mrId = adminFilters.mrId,
      status = adminFilters.status,
      dateFrom = adminFilters.dateFrom,
      dateTo = adminFilters.dateTo
    ) => {
      const params = {};
      if (mrId) params.mr_id = mrId;
      if (status) params.status = status;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      dispatch(fetchAdminInvoices(params));
    },
    [
      adminFilters.mrId,
      adminFilters.status,
      adminFilters.dateFrom,
      adminFilters.dateTo,
      dispatch,
    ]
  );

  useEffect(() => {
    dispatch(fetchUsers());
    loadInvoices();
  }, [dispatch, loadInvoices]);

  const handleMrChange = (e) => {
    const mrId = e.target.value;
    dispatch(setAdminFilters({ mrId }));
    loadInvoices(mrId, adminFilters.status, adminFilters.dateFrom, adminFilters.dateTo);
  };

  const handleStatusChange = (e) => {
    const status = e.target.value;
    dispatch(setAdminFilters({ status }));
    loadInvoices(adminFilters.mrId, status, adminFilters.dateFrom, adminFilters.dateTo);
  };

  const handleDateApply = (from, to) => {
    dispatch(setAdminFilters({ dateFrom: from, dateTo: to }));
    loadInvoices(adminFilters.mrId, adminFilters.status, from, to);
  };

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearch(val);
    dispatch(setAdminFilters({ search: val }));
  };

  const mrList = users.filter((u) => u.role === 'MR');

  const filteredInvoices = allInvoices.filter((inv) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.customer_name?.toLowerCase().includes(q) ||
      inv.mr_name?.toLowerCase().includes(q) ||
      inv.payment_mode?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Filters Card */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-[#2f6f4e]" />
          <h2 className="text-base sm:text-lg font-bold text-[#1c2321]">
            Invoice Filters
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
              Filter by Medical Representative
            </label>
            <select
              value={adminFilters.mrId}
              onChange={handleMrChange}
              className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
            >
              <option value="">All MRs</option>
              {mrList.map((mr) => (
                <option key={mr.id} value={mr.id}>
                  {mr.name} ({mr.employee_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
              Filter by Payment Status
            </label>
            <select
              value={adminFilters.status}
              onChange={handleStatusChange}
              className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
            >
              <option value="">All Statuses</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </div>
        </div>

        <DateFilter onApply={handleDateApply} />
      </div>

      {/* Invoices List Card */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#1c2321]">
              Invoices Directory
            </h2>
            <p className="text-xs text-[#5b6660]">
              Showing {filteredInvoices.length} invoices matching filters.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Search size={15} />
            </span>
            <input
              type="text"
              value={search}
              onChange={handleSearch}
              placeholder="Search invoice, customer, or MR…"
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-gray-50 text-[#1c2321] border border-[#d7dcd9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2f6f4e] focus:bg-white transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-[#5b6660]">
            Loading invoices directory…
          </div>
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices found"
            description="No invoices match the selected MR, status, date, or search filter."
          />
        ) : (
          <div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#d7dcd9] text-xs font-semibold text-[#5b6660]">
                    <th className="py-3 px-3">Invoice</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">MR</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                    <th className="py-3 px-3 text-right">Pending</th>
                    <th className="py-3 px-3">Mode</th>
                    <th className="py-3 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d7dcd9]">
                  {filteredInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-3 font-mono font-semibold text-[#1c2321]">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-3 text-xs text-[#5b6660]">
                        {inv.invoice_date || '—'}
                      </td>
                      <td className="py-3 px-3 text-[#1c2321] font-medium">
                        {inv.customer_name || '—'}
                      </td>
                      <td className="py-3 px-3 text-[#5b6660]">
                        {inv.mr_name || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-[#1c2321]">
                        {money(inv.total_amount)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-[#a8403c]">
                        {money(inv.pending_amount)}
                      </td>
                      <td className="py-3 px-3 text-xs text-[#5b6660]">
                        {inv.payment_mode || '—'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <StatusPill status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden space-y-3">
              {filteredInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3.5 bg-gray-50/70 rounded-xl border border-[#d7dcd9] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#1c2321]">
                      {inv.invoice_number}
                    </span>
                    <StatusPill status={inv.status} />
                  </div>
                  <div className="text-xs text-[#1c2321] font-medium">
                    {inv.customer_name || '—'}
                  </div>
                  <div className="text-[11px] text-[#5b6660] flex items-center justify-between">
                    <span>MR: {inv.mr_name || '—'}</span>
                    <span>{inv.invoice_date || 'No Date'}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                    <div className="font-mono text-xs text-[#5b6660]">
                      Total: <span className="font-bold text-[#1c2321]">{money(inv.total_amount)}</span>
                    </div>
                    <div className="font-mono text-xs text-[#a8403c] font-bold">
                      Pending: {money(inv.pending_amount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


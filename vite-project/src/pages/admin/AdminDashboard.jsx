import { useEffect, useCallback } from 'react';
import {
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  Receipt,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import {
  fetchAdminDashboard,
  fetchOutstandingAlerts,
  setDashFilters,
} from '../../store/slices/adminSlice';
import StatCard from '../../components/common/StatCard';
import DateFilter from '../../components/common/DateFilter';
import EmptyState from '../../components/common/EmptyState';
import { money } from '../../utils/formatters';

export default function AdminDashboard() {
  const dispatch = useAppDispatch();
  const { dashboard, alerts, loading, dashFilters } = useAppSelector(
    (state) => state.admin
  );

  const loadData = useCallback(
    (dateFrom = dashFilters.dateFrom, dateTo = dashFilters.dateTo) => {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      dispatch(fetchAdminDashboard(params));
      dispatch(fetchOutstandingAlerts(50000));
    },
    [dashFilters.dateFrom, dashFilters.dateTo, dispatch]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDateApply = (from, to) => {
    dispatch(setDashFilters({ dateFrom: from, dateTo: to }));
    loadData(from, to);
  };

  return (
    <div className="space-y-6">
      {/* Date Filter Card */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1c2321]">
              Executive Dashboard
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-[#5b6660]">
              Real-time sales, collection KPIs, and outstanding tracking across all MRs.
            </p>
          </div>
        </div>
        <DateFilter onApply={handleDateApply} />
      </div>

      {/* Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Sales"
          value={money(dashboard?.total_sales)}
          accent={true}
          icon={TrendingUp}
        />
        <StatCard
          label="Total Collected"
          value={money(dashboard?.collected)}
          icon={CheckCircle}
        />
        <StatCard
          label="Total Outstanding"
          value={money(dashboard?.outstanding)}
          icon={AlertTriangle}
        />
      </div>

      {/* Invoice Status Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Paid Invoices"
          value={dashboard?.paid ?? 0}
          icon={Receipt}
          subtext="Fully collected"
        />
        <StatCard
          label="Partial Invoices"
          value={dashboard?.partial ?? 0}
          icon={Clock}
          subtext="Partially settled"
        />
        <StatCard
          label="Unpaid Invoices"
          value={dashboard?.unpaid ?? 0}
          icon={AlertTriangle}
          subtext="Awaiting collection"
        />
      </div>

      {/* Outstanding Alerts (> ₹50,000) */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#f6ecd6] text-[#9a6b0c]">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1c2321]">
                High Value Alerts (Above ₹50,000)
              </h2>
              <p className="text-xs text-[#5b6660]">
                Critical pending accounts requiring immediate follow-up.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
            {alerts?.length || 0} Accounts
          </span>
        </div>

        {loading && (!alerts || alerts.length === 0) ? (
          <div className="py-8 text-center text-xs text-[#5b6660]">
            Checking outstanding alerts…
          </div>
        ) : !alerts || alerts.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="No high outstanding balances"
            description="There are currently no customer invoices with pending amounts exceeding ₹50,000."
          />
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#d7dcd9] text-xs font-semibold text-[#5b6660]">
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Invoice</th>
                    <th className="py-3 px-3">MR</th>
                    <th className="py-3 px-3 text-right">Outstanding Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d7dcd9]">
                  {alerts.map((item, idx) => (
                    <tr
                      key={item.invoice_id || idx}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-3 font-semibold text-[#1c2321]">
                        {item.customer || '—'}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#5b6660]">
                        {item.invoice_number}
                      </td>
                      <td className="py-3 px-3 text-[#1c2321]">
                        {item.mr || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-[#a8403c]">
                        {money(item.pending_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="sm:hidden space-y-3">
              {alerts.map((item, idx) => (
                <div
                  key={item.invoice_id || idx}
                  className="p-3.5 bg-gray-50/70 rounded-xl border border-[#d7dcd9] flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-xs text-[#1c2321]">
                      {item.customer || '—'}
                    </div>
                    <div className="text-[11px] text-[#5b6660] font-mono mt-0.5">
                      Inv: {item.invoice_number} · MR: {item.mr || '—'}
                    </div>
                  </div>
                  <div className="font-mono text-xs font-bold text-[#a8403c]">
                    {money(item.pending_amount)}
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


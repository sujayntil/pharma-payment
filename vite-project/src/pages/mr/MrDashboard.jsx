import { useEffect } from 'react';
import { FileText, CheckCircle2, Clock, Upload } from 'lucide-react';
import { useAppDispatch, useAppSelector, useAuth } from '../../hooks/useAppStore';
import { fetchMrDashboard } from '../../store/slices/mrSlice';
import StatCard from '../../components/common/StatCard';
import StatusPill from '../../components/common/StatusPill';
import EmptyState from '../../components/common/EmptyState';
import { money } from '../../utils/formatters';

export default function MrDashboard({ onNavigateToUpload }) {
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { dashboard, loading } = useAppSelector((state) => state.mr);

  useEffect(() => {
    dispatch(fetchMrDashboard());
  }, [dispatch]);

  const greetingName = dashboard?.name || user?.name || 'there';

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <h1 className="text-xl sm:text-2xl font-bold text-[#1c2321]">
          Hi, {greetingName}
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-[#5b6660]">
          Here is how your sales and collection performance look today.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Invoices"
          value={dashboard?.total_invoices ?? 0}
          accent={true}
          icon={FileText}
        />
        <StatCard
          label="Paid Invoices"
          value={dashboard?.paid ?? 0}
          icon={CheckCircle2}
        />
        <StatCard
          label="Pending (Partial + Unpaid)"
          value={(dashboard?.partial ?? 0) + (dashboard?.unpaid ?? 0)}
          icon={Clock}
        />
      </div>

      {/* Recent Invoices Card */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base sm:text-lg font-bold text-[#1c2321]">
            Recent Invoices
          </h2>
          <span className="text-xs text-[#5b6660]">
            Latest {dashboard?.recent?.length || 0} entries
          </span>
        </div>

        {loading && (!dashboard?.recent || dashboard.recent.length === 0) ? (
          <div className="py-8 text-center text-xs text-[#5b6660]">
            Loading recent invoices…
          </div>
        ) : !dashboard?.recent || dashboard.recent.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="You haven't uploaded any invoices yet. Start by uploading an invoice image or PDF."
            action={
              onNavigateToUpload && (
                <button
                  type="button"
                  onClick={onNavigateToUpload}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2f6f4e] hover:bg-[#1f4d36] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Upload size={14} /> Upload First Invoice
                </button>
              )
            }
          />
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#d7dcd9] text-xs font-semibold text-[#5b6660]">
                    <th className="py-3 px-3">Invoice</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3 text-right">Amount</th>
                    <th className="py-3 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d7dcd9]">
                  {dashboard.recent.map((inv, idx) => (
                    <tr
                      key={inv.id || idx}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-3 font-mono font-medium text-[#1c2321]">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-3 text-[#1c2321]">
                        {inv.customer || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-[#1c2321]">
                        {money(inv.total_amount)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <StatusPill status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="sm:hidden space-y-3">
              {dashboard.recent.map((inv, idx) => (
                <div
                  key={inv.id || idx}
                  className="p-3 bg-gray-50/60 rounded-xl border border-[#d7dcd9] flex items-center justify-between"
                >
                  <div>
                    <div className="font-mono text-xs font-bold text-[#1c2321]">
                      {inv.invoice_number}
                    </div>
                    <div className="text-xs text-[#5b6660] mt-0.5 truncate max-w-[170px]">
                      {inv.customer || '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-bold text-[#1c2321]">
                      {money(inv.total_amount)}
                    </div>
                    <div className="mt-1">
                      <StatusPill status={inv.status} />
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


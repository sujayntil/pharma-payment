import { useEffect, useCallback } from 'react';
import { Award } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import {
  fetchMrPerformance,
  setPerfFilters,
} from '../../store/slices/adminSlice';
import DateFilter from '../../components/common/DateFilter';
import EmptyState from '../../components/common/EmptyState';
import { money } from '../../utils/formatters';

export default function AdminPerformance() {
  const dispatch = useAppDispatch();
  const { mrPerformance, loading, perfFilters } = useAppSelector(
    (state) => state.admin
  );

  const loadData = useCallback(
    (dateFrom = perfFilters.dateFrom, dateTo = perfFilters.dateTo) => {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      dispatch(fetchMrPerformance(params));
    },
    [perfFilters.dateFrom, perfFilters.dateTo, dispatch]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDateApply = (from, to) => {
    dispatch(setPerfFilters({ dateFrom: from, dateTo: to }));
    loadData(from, to);
  };

  return (
    <div className="space-y-6">
      {/* Date Filter Card */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1c2321]">
              MR Performance &amp; Collection Rates
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-[#5b6660]">
              Evaluate field medical representatives by generated sales and collection efficiency.
            </p>
          </div>
        </div>
        <DateFilter onApply={handleDateApply} />
      </div>

      {/* Performance Table Card */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#2f6f4e]/10 text-[#2f6f4e]">
              <Award size={18} />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#1c2321]">
              Collection Scoreboard
            </h2>
          </div>
          <span className="text-xs text-[#5b6660]">
            {mrPerformance?.length || 0} Active MRs
          </span>
        </div>

        {loading && (!mrPerformance || mrPerformance.length === 0) ? (
          <div className="py-12 text-center text-xs text-[#5b6660]">
            Calculating representative metrics…
          </div>
        ) : !mrPerformance || mrPerformance.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No performance records"
            description="There are no sales or collection activities recorded for this time range."
          />
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#d7dcd9] text-xs font-semibold text-[#5b6660]">
                    <th className="py-3 px-3">Medical Representative</th>
                    <th className="py-3 px-3 text-right">Total Sales</th>
                    <th className="py-3 px-3 text-right">Collected Amount</th>
                    <th className="py-3 px-3 text-right">Pending Balance</th>
                    <th className="py-3 px-3 text-right">Collection Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d7dcd9]">
                  {mrPerformance.map((row, idx) => {
                    const sales = Number(row.sales || 0);
                    const collected = Number(row.collected || 0);
                    const rate = sales > 0 ? Math.round((collected / sales) * 100) : 0;

                    return (
                      <tr
                        key={row.name || idx}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-3 px-3 font-semibold text-[#1c2321]">
                          {row.name}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium text-[#1c2321]">
                          {money(row.sales)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[#2f6f4e]">
                          {money(row.collected)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-[#a8403c]">
                          {money(row.pending)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`inline-block font-mono text-xs font-bold px-2 py-0.5 rounded-full ${
                              rate >= 80
                                ? 'bg-emerald-100 text-[#2f6f4e]'
                                : rate >= 50
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {rate}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="sm:hidden space-y-3">
              {mrPerformance.map((row, idx) => {
                const sales = Number(row.sales || 0);
                const collected = Number(row.collected || 0);
                const rate = sales > 0 ? Math.round((collected / sales) * 100) : 0;

                return (
                  <div
                    key={row.name || idx}
                    className="p-3.5 bg-gray-50/70 rounded-xl border border-[#d7dcd9] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-[#1c2321]">
                        {row.name}
                      </span>
                      <span
                        className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full ${
                          rate >= 80
                            ? 'bg-emerald-100 text-[#2f6f4e]'
                            : rate >= 50
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {rate}% Collected
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-200 text-center">
                      <div>
                        <div className="text-[10px] text-[#5b6660]">Sales</div>
                        <div className="font-mono text-xs font-bold text-[#1c2321]">
                          {money(row.sales)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#5b6660]">Collected</div>
                        <div className="font-mono text-xs font-bold text-[#2f6f4e]">
                          {money(row.collected)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#5b6660]">Pending</div>
                        <div className="font-mono text-xs font-bold text-[#a8403c]">
                          {money(row.pending)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


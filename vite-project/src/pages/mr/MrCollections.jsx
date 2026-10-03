import { useEffect, useState } from 'react';
import {
  Search,
  DollarSign,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Loader2,
  Receipt,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import {
  fetchMrOutstanding,
  recordPayment,
  resetPaymentStatus,
  setSearchQuery,
} from '../../store/slices/mrSlice';
import StatusPill from '../../components/common/StatusPill';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import { money } from '../../utils/formatters';

const PAYMENT_MODES = [
  'Cash',
  'UPI',
  'Bank Transfer',
  'Cheque',
  'NEFT',
  'RTGS',
  'Other',
];

export default function MrCollections() {
  const dispatch = useAppDispatch();
  const {
    outstanding,
    totalOutstanding,
    loading,
    paymentLoading,
    paymentSuccess,
    paymentError,
    searchQuery,
  } = useAppSelector((state) => state.mr);

  const [activeInvoice, setActiveInvoice] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('UPI');
  const [payRef, setPayRef] = useState('');
  const [validationError, setValidationError] = useState(null);

  useEffect(() => {
    dispatch(fetchMrOutstanding());
  }, [dispatch]);

  const handleSearchChange = (e) => {
    dispatch(setSearchQuery(e.target.value));
  };

  const openPaymentModal = (item) => {
    setActiveInvoice(item);
    setPayAmount(String(item.pending_amount));
    setPayMode('UPI');
    setPayRef('');
    setValidationError(null);
    dispatch(resetPaymentStatus());
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!activeInvoice) return;

    const amountNum = parseFloat(payAmount);
    if (!amountNum || amountNum <= 0) {
      setValidationError('Please enter a valid payment amount.');
      return;
    }

    if (amountNum > activeInvoice.pending_amount + 0.01) {
      setValidationError(
        `Amount cannot exceed outstanding balance of ${money(
          activeInvoice.pending_amount
        )}.`
      );
      return;
    }

    setValidationError(null);

    const payload = {
      invoice_id: activeInvoice.invoice_id,
      amount: amountNum,
      mode: payMode || null,
      transaction_reference: payRef.trim() || null,
    };

    const action = await dispatch(recordPayment(payload));

    if (recordPayment.fulfilled.match(action)) {
      setTimeout(() => {
        setActiveInvoice(null);
      }, 1000);
    }
  };

  const filteredItems = outstanding.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.invoice_number?.toLowerCase().includes(q) ||
      item.customer?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Total Outstanding Banner */}
      <div className="bg-[#e3efe8] border border-[#2f6f4e] rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs sm:text-sm font-semibold text-[#1f4d36] uppercase tracking-wider">
            Total Outstanding Across Your Customers
          </span>
          <div className="mt-1 font-mono text-2xl sm:text-3xl font-extrabold text-[#1c2321]">
            {money(totalOutstanding)}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-white/70 border border-[#2f6f4e]/30 text-xs text-[#1f4d36] self-start sm:self-auto font-medium">
          {outstanding.length} Pending Invoices to Collect
        </div>
      </div>

      {/* Outstanding Invoices Section */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#1c2321]">
              Outstanding Invoices
            </h2>
            <p className="mt-0.5 text-xs text-[#5b6660]">
              Select an invoice to record partial or full payment collections.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Search size={15} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search invoice or customer…"
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-gray-50 text-[#1c2321] border border-[#d7dcd9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2f6f4e] focus:bg-white transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-[#5b6660]">
            Loading outstanding collections…
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={
              outstanding.length === 0
                ? 'Nothing outstanding — great work!'
                : 'No matching outstanding invoices'
            }
            description={
              outstanding.length === 0
                ? 'All invoices have been collected and settled.'
                : 'Try adjusting your search criteria.'
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.invoice_id}
                className="p-4 rounded-xl border border-[#d7dcd9] hover:border-[#2f6f4e]/50 bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm sm:text-base text-[#1c2321]">
                      {item.customer || 'Unnamed Customer'}
                    </span>
                    <StatusPill status={item.status} />
                  </div>
                  <div className="mt-1 text-xs text-[#5b6660] flex items-center gap-2">
                    <span className="font-mono font-medium text-[#1c2321]">
                      Invoice {item.invoice_number}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100">
                  <div className="text-left sm:text-right">
                    <span className="block text-[11px] text-[#5b6660]">
                      Pending Balance
                    </span>
                    <span className="font-mono text-base font-bold text-[#a8403c]">
                      {money(item.pending_amount)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => openPaymentModal(item)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2f6f4e] hover:bg-[#1f4d36] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    <DollarSign size={14} />
                    <span>Record Payment</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <Modal
        isOpen={!!activeInvoice}
        onClose={() => setActiveInvoice(null)}
        title={`Record Payment — Invoice ${activeInvoice?.invoice_number}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-4">
          {/* Customer & Pending Overview */}
          <div className="p-3.5 bg-gray-50 border border-[#d7dcd9] rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-[#5b6660]">Customer</div>
              <div className="font-semibold text-sm text-[#1c2321]">
                {activeInvoice?.customer || '—'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#5b6660]">Pending Balance</div>
              <div className="font-mono text-sm font-bold text-[#a8403c]">
                {money(activeInvoice?.pending_amount)}
              </div>
            </div>
          </div>

          {/* Validation or API Error */}
          {(validationError || paymentError) && (
            <div className="p-3 rounded-lg bg-[#f6e3e1] border border-[#a8403c]/30 text-[#a8403c] text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{validationError || paymentError}</span>
            </div>
          )}

          {/* Success Banner */}
          {paymentSuccess && (
            <div className="p-3 rounded-lg bg-[#e3efe8] border border-[#2f6f4e]/30 text-[#2f6f4e] text-xs font-semibold flex items-center gap-2">
              <CheckCircle size={15} className="shrink-0" />
              <span>Payment recorded successfully! Updating records…</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
              Amount Received (₹) <span className="text-[#a8403c]">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={activeInvoice?.pending_amount}
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
              Payment Mode <span className="text-[#a8403c]">*</span>
            </label>
            <select
              value={payMode}
              onChange={(e) => setPayMode(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
              Reference / UTR / Cheque # (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. UPI-987654321 or CHQ-00123"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setActiveInvoice(null)}
              className="px-4 py-2 text-xs font-medium text-[#1c2321] border border-[#d7dcd9] rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={paymentLoading || paymentSuccess}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2f6f4e] hover:bg-[#1f4d36] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {paymentLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Recording…</span>
                </>
              ) : (
                <>
                  <CreditCard size={14} />
                  <span>Save Payment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


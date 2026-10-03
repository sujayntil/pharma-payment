import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Edit2,
  Trash2,
  FileText,
  AlertTriangle,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import {
  fetchMyInvoices,
  updateExistingInvoice,
  deleteExistingInvoice,
  setMrFilters,
} from '../../store/slices/invoiceSlice';
import DateFilter from '../../components/common/DateFilter';
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

export default function MrInvoices() {
  const dispatch = useAppDispatch();
  const { myInvoices, loading, mrFilters } = useAppSelector(
    (state) => state.invoices
  );

  const [search, setSearch] = useState(mrFilters.search || '');
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [editForm, setEditForm] = useState({
    invoice_number: '',
    invoice_date: '',
    customer_name: '',
    total_amount: '',
    payment_mode: '',
    remarks: '',
  });
  const [editError, setEditError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation modal state
  const [deletingInvoice, setDeletingInvoice] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadInvoices = useCallback(
    (dateFrom = mrFilters.dateFrom, dateTo = mrFilters.dateTo) => {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      dispatch(fetchMyInvoices(params));
    },
    [mrFilters.dateFrom, mrFilters.dateTo, dispatch]
  );

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const handleDateApply = (from, to) => {
    dispatch(setMrFilters({ dateFrom: from, dateTo: to }));
    loadInvoices(from, to);
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    dispatch(setMrFilters({ search: val }));
  };

  // Filter invoices locally by search term
  const filteredInvoices = myInvoices.filter((inv) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.customer_name?.toLowerCase().includes(q) ||
      inv.payment_mode?.toLowerCase().includes(q)
    );
  });

  // Edit actions
  const openEdit = (invoice) => {
    setEditingInvoice(invoice);
    setEditForm({
      invoice_number: invoice.invoice_number || '',
      invoice_date: invoice.invoice_date || '',
      customer_name: invoice.customer_name || '',
      total_amount: invoice.total_amount ? String(invoice.total_amount) : '',
      payment_mode: invoice.payment_mode || '',
      remarks: invoice.remarks || '',
    });
    setEditError(null);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingInvoice) return;

    const amount = parseFloat(editForm.total_amount);
    if (!amount || amount <= 0) {
      setEditError('Please enter a valid invoice amount greater than 0.');
      return;
    }

    setIsSubmitting(true);
    setEditError(null);

    const payload = {
      invoice_number: editForm.invoice_number.trim(),
      invoice_date: editForm.invoice_date || null,
      customer_name: editForm.customer_name.trim(),
      total_amount: amount,
      payment_mode: editForm.payment_mode || null,
      remarks: editForm.remarks || null,
    };

    const action = await dispatch(
      updateExistingInvoice({ id: editingInvoice.id, data: payload })
    );

    setIsSubmitting(false);

    if (updateExistingInvoice.fulfilled.match(action)) {
      setEditingInvoice(null);
    } else {
      setEditError(action.payload || 'Failed to update invoice.');
    }
  };

  // Delete actions
  const confirmDelete = async () => {
    if (!deletingInvoice) return;
    setIsDeleting(true);
    await dispatch(deleteExistingInvoice(deletingInvoice.id));
    setIsDeleting(false);
    setDeletingInvoice(null);
  };

  return (
    <div className="space-y-6">
      {/* Header and Filters Card */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1c2321]">
              My Invoices
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-[#5b6660]">
              View, search, edit, and track your submitted invoices.
            </p>
          </div>
          <div className="text-xs font-semibold text-[#5b6660] bg-gray-50 border border-[#d7dcd9] px-3 py-1.5 rounded-lg self-start sm:self-auto">
            Total: <span className="font-mono text-[#1c2321]">{filteredInvoices.length}</span>
          </div>
        </div>

        {/* Date Presets */}
        <DateFilter onApply={handleDateApply} className="mb-4" />

        {/* Search Input */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by invoice number or customer name…"
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50/50 text-[#1c2321] text-sm border border-[#d7dcd9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2f6f4e] focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Invoices List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-12 bg-white rounded-2xl border border-[#d7dcd9] text-center text-xs text-[#5b6660]">
            Loading invoices…
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#d7dcd9]">
            <EmptyState
              icon={FileText}
              title={myInvoices.length === 0 ? 'No invoices found' : 'No matching invoices'}
              description={
                myInvoices.length === 0
                  ? 'You haven’t uploaded any invoices yet for this date range.'
                  : 'No invoices match your current search query.'
              }
            />
          </div>
        ) : (
          filteredInvoices.map((inv) => (
            <div
              key={inv.id}
              className="bg-white border border-[#d7dcd9] rounded-xl p-4 sm:p-5 shadow-xs hover:border-[#2f6f4e]/40 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Invoice info */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm sm:text-base font-bold text-[#1c2321]">
                      {inv.invoice_number}
                    </span>
                    <StatusPill status={inv.status} />
                  </div>
                  <div className="mt-1 text-xs sm:text-sm text-[#5b6660]">
                    <span className="font-medium text-[#1c2321]">
                      {inv.customer_name || 'No Customer'}
                    </span>
                    <span className="mx-1.5 text-gray-300">·</span>
                    <span>{inv.invoice_date || 'No Date'}</span>
                    {inv.payment_mode && (
                      <>
                        <span className="mx-1.5 text-gray-300">·</span>
                        <span className="text-gray-600">{inv.payment_mode}</span>
                      </>
                    )}
                  </div>
                  {inv.remarks && (
                    <div className="mt-1.5 text-xs text-gray-500 italic bg-gray-50 px-2.5 py-1 rounded-md inline-block">
                      &ldquo;{inv.remarks}&rdquo;
                    </div>
                  )}
                </div>

                {/* Amount and Actions */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100">
                  <div className="text-left sm:text-right">
                    <div className="font-mono text-base sm:text-lg font-bold text-[#1c2321]">
                      {money(inv.total_amount)}
                    </div>
                    {inv.status !== 'PAID' && (
                      <div className="text-xs text-[#a8403c] font-medium font-mono">
                        Pending: {money(inv.pending_amount)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => openEdit(inv)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#1c2321] hover:bg-gray-100 rounded-md border border-[#d7dcd9] transition-colors cursor-pointer"
                    >
                      <Edit2 size={13} className="text-[#5b6660]" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingInvoice(inv)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#a8403c] hover:bg-[#f6e3e1]/60 rounded-md border border-[#a8403c]/30 transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Invoice Modal */}
      <Modal
        isOpen={!!editingInvoice}
        onClose={() => setEditingInvoice(null)}
        title={`Edit Invoice — ${editingInvoice?.invoice_number}`}
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div className="p-3 rounded-lg bg-[#f6e3e1] border border-[#a8403c]/30 text-[#a8403c] text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Invoice Number
              </label>
              <input
                type="text"
                required
                value={editForm.invoice_number}
                onChange={(e) =>
                  setEditForm({ ...editForm, invoice_number: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Invoice Date
              </label>
              <input
                type="date"
                value={editForm.invoice_date}
                onChange={(e) =>
                  setEditForm({ ...editForm, invoice_date: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Customer Name
              </label>
              <input
                type="text"
                required
                value={editForm.customer_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, customer_name: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Invoice Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={editForm.total_amount}
                onChange={(e) =>
                  setEditForm({ ...editForm, total_amount: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Payment Mode
              </label>
              <select
                value={editForm.payment_mode}
                onChange={(e) =>
                  setEditForm({ ...editForm, payment_mode: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              >
                <option value="">Select mode</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Remarks
              </label>
              <input
                type="text"
                value={editForm.remarks}
                onChange={(e) =>
                  setEditForm({ ...editForm, remarks: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              />
            </div>
          </div>

          <div className="text-xs text-[#5b6660] bg-gray-50 p-2.5 rounded-lg border border-gray-200">
            Note: Collected payments are recorded securely via the My Collections tab.
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setEditingInvoice(null)}
              className="px-4 py-2 text-xs font-medium text-[#1c2321] border border-[#d7dcd9] rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2f6f4e] hover:bg-[#1f4d36] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <CheckCircle size={14} />
                  <span>Save changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingInvoice}
        onClose={() => setDeletingInvoice(null)}
        title="Confirm Delete Invoice"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-full bg-[#f6e3e1] text-[#a8403c] shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm text-[#1c2321] font-medium">
                Are you sure you want to delete invoice{' '}
                <span className="font-mono font-bold">
                  {deletingInvoice?.invoice_number}
                </span>
                ?
              </p>
              <p className="text-xs text-[#5b6660] mt-1">
                This will permanently remove the invoice and its payment history from the database. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setDeletingInvoice(null)}
              className="px-4 py-2 text-xs font-medium text-[#1c2321] border border-[#d7dcd9] rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={confirmDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#a8403c] hover:bg-[#863330] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {isDeleting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Deleting…</span>
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  <span>Delete permanently</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}


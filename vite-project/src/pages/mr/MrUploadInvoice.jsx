import { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  Camera,
  Loader2,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import {
  extractInvoiceAI,
  createNewInvoice,
  clearExtractResult,
} from '../../store/slices/invoiceSlice';
import { fetchMrDashboard, fetchMrOutstanding } from '../../store/slices/mrSlice';
import { money } from '../../utils/formatters';

const CUSTOMER_TYPES = [
  'Chemist',
  'Doctor',
  'Hospital',
  'Distributor',
  'Other',
];

const PAYMENT_MODES = [
  'Cash',
  'UPI',
  'Bank Transfer',
  'Cheque',
  'NEFT',
  'RTGS',
  'Other',
];

export default function MrUploadInvoice({ onDone }) {
  const dispatch = useAppDispatch();
  const { extractLoading, extractError, extractResult } = useAppSelector(
    (state) => state.invoices
  );

  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Form fields
  const [formValues, setFormValues] = useState({
    invoice_number: '',
    invoice_date: '',
    customer_name: '',
    customer_type: '',
    total_amount: '',
    paid_amount: '0',
    payment_mode: '',
    remarks: '',
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setSaveError(null);
    setSaveSuccess(false);

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) return;
    setSaveError(null);

    const resultAction = await dispatch(extractInvoiceAI(selectedFile));

    if (extractInvoiceAI.fulfilled.match(resultAction)) {
      const res = resultAction.payload;
      setFormValues({
        invoice_number: res.invoice_number || '',
        invoice_date: res.invoice_date || '',
        customer_name: res.customer_name || '',
        customer_type: res.customer_type || '',
        total_amount: res.total_amount ? String(res.total_amount) : '',
        paid_amount: res.paid_amount !== undefined ? String(res.paid_amount) : '0',
        payment_mode: res.payment_mode || '',
        remarks: res.remarks || '',
      });
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFormValues({
      invoice_number: '',
      invoice_date: '',
      customer_name: '',
      customer_type: '',
      total_amount: '',
      paid_amount: '0',
      payment_mode: '',
      remarks: '',
    });
    setSaveError(null);
    setSaveSuccess(false);
    setShowDuplicateConfirm(false);
    dispatch(clearExtractResult());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const executeSave = async (confirmDuplicate = false) => {
    setSaving(true);
    setSaveError(null);

    const total = parseFloat(formValues.total_amount) || 0;
    const paid = parseFloat(formValues.paid_amount) || 0;

    const payload = {
      invoice_number: formValues.invoice_number.trim(),
      invoice_date: formValues.invoice_date || null,
      customer_name: formValues.customer_name.trim(),
      customer_type: formValues.customer_type || null,
      total_amount: total,
      paid_amount: paid,
      payment_mode: formValues.payment_mode || null,
      remarks: formValues.remarks || null,
      image_path: extractResult?.image_path || null,
    };

    const action = await dispatch(
      createNewInvoice({ data: payload, confirmDuplicate })
    );

    setSaving(false);

    if (createNewInvoice.fulfilled.match(action)) {
      setSaveSuccess(true);
      setShowDuplicateConfirm(false);
      dispatch(fetchMrDashboard());
      dispatch(fetchMrOutstanding());
      setTimeout(() => {
        handleReset();
        if (onDone) onDone();
      }, 2000);
    } else {
      const err = action.payload;
      if (err?.status === 409) {
        setDuplicateMessage(
          err.message || 'An invoice with this number already exists. Do you want to save it anyway?'
        );
        setShowDuplicateConfirm(true);
      } else {
        setSaveError(err?.message || 'Failed to save invoice. Please try again.');
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeSave(false);
  };

  // Pending calculation preview
  const currentTotal = parseFloat(formValues.total_amount) || 0;
  const currentPaid = parseFloat(formValues.paid_amount) || 0;
  const pendingCalc = Math.max(currentTotal - currentPaid, 0);

  // Confidence check helper
  const isLowConfidence = (field) => {
    const conf = extractResult?.confidence?.[field];
    return conf !== undefined && conf < 0.6;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Upload Header Card */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#2f6f4e]/10 text-[#2f6f4e]">
            <Upload size={22} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1c2321]">
              Upload Invoice
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-[#5b6660]">
              Take a photo or upload a PDF. Gemini AI will automatically extract invoice details for your review.
            </p>
          </div>
        </div>

        {/* Success Banner */}
        {saveSuccess && (
          <div className="mt-4 p-4 rounded-xl bg-[#e3efe8] border border-[#2f6f4e]/30 text-[#2f6f4e] flex items-center gap-3 animate-in fade-in">
            <CheckCircle size={20} className="shrink-0" />
            <div>
              <div className="font-semibold text-sm">Invoice Saved Successfully!</div>
              <div className="text-xs text-[#1f4d36] mt-0.5">
                The invoice has been recorded and added to your collection ledger.
              </div>
            </div>
          </div>
        )}

        {/* Step 1: File selection & AI Extraction */}
        {!extractResult && (
          <div className="mt-6 space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#d7dcd9] hover:border-[#2f6f4e] rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-colors bg-gray-50/50 hover:bg-gray-50 flex flex-col items-center justify-center"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-white border border-[#d7dcd9] shadow-xs flex items-center justify-center text-[#2f6f4e] mb-3">
                {selectedFile?.type === 'application/pdf' ? (
                  <FileText size={28} />
                ) : (
                  <Camera size={28} />
                )}
              </div>
              <div className="text-sm font-semibold text-[#1c2321]">
                {selectedFile ? selectedFile.name : 'Tap to capture photo or upload invoice'}
              </div>
              <div className="text-xs text-[#5b6660] mt-1 max-w-sm">
                Supports camera capture on mobile, JPG, PNG, and PDF files up to 10MB.
              </div>
            </div>

            {/* Image Preview */}
            {previewUrl && (
              <div className="p-3 bg-gray-50 rounded-xl border border-[#d7dcd9] flex items-center gap-4">
                <img
                  src={previewUrl}
                  alt="Invoice Preview"
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200 shadow-2xs"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-[#1c2321] truncate">
                    {selectedFile?.name}
                  </div>
                  <div className="text-[11px] text-[#5b6660] mt-0.5">
                    {(selectedFile.size / 1024).toFixed(1)} KB · Ready for OCR
                  </div>
                </div>
              </div>
            )}

            {/* PDF File Preview */}
            {selectedFile && selectedFile.type === 'application/pdf' && (
              <div className="p-3 bg-gray-50 rounded-xl border border-[#d7dcd9] flex items-center gap-3">
                <FileText size={24} className="text-[#a8403c]" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-[#1c2321] truncate">
                    {selectedFile.name}
                  </div>
                  <div className="text-[11px] text-[#5b6660]">
                    {(selectedFile.size / 1024).toFixed(1)} KB PDF
                  </div>
                </div>
              </div>
            )}

            {/* Extract Error */}
            {extractError && (
              <div className="p-3 rounded-lg bg-[#f6e3e1] border border-[#a8403c]/30 text-[#a8403c] text-xs sm:text-sm flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{extractError}</span>
              </div>
            )}

            {/* Extract Button */}
            <button
              type="button"
              disabled={!selectedFile || extractLoading}
              onClick={handleExtract}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#2f6f4e] hover:bg-[#1f4d36] disabled:opacity-50 text-white font-semibold text-sm rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              {extractLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Reading invoice with AI…</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Extract with AI</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Step 2: Review & Confirm Form */}
        {extractResult && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5 animate-in fade-in">
            {/* Notice / Guidance */}
            <div className="p-3.5 rounded-xl bg-[#e3efe8] border border-[#2f6f4e]/30 text-[#1f4d36] text-xs sm:text-sm flex items-start gap-2.5">
              <Sparkles size={18} className="text-[#2f6f4e] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">AI Extraction Complete!</span> Please review and verify the extracted details below before confirming.
                {Object.values(extractResult.confidence || {}).some((v) => v < 0.6) && (
                  <div className="mt-1 text-[#9a6b0c] font-medium">
                    Fields highlighted in amber had lower confidence — please double-check them.
                  </div>
                )}
              </div>
            </div>

            {/* Duplicate Conflict Warning Box */}
            {showDuplicateConfirm && (
              <div className="p-4 rounded-xl bg-[#f6ecd6] border border-[#9a6b0c]/40 text-[#9a6b0c] space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm">Duplicate Invoice Warning</div>
                    <div className="text-xs mt-0.5">{duplicateMessage}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => executeSave(true)}
                    disabled={saving}
                    className="px-3 py-1.5 bg-[#9a6b0c] text-white text-xs font-semibold rounded-md shadow-xs hover:bg-[#7e5607] transition-colors cursor-pointer"
                  >
                    Yes, save anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDuplicateConfirm(false)}
                    className="px-3 py-1.5 bg-white border border-[#9a6b0c]/30 text-[#9a6b0c] text-xs font-semibold rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {saveError && (
              <div className="p-3 rounded-lg bg-[#f6e3e1] border border-[#a8403c]/30 text-[#a8403c] text-xs sm:text-sm flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {/* Field Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                  Invoice Number <span className="text-[#a8403c]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formValues.invoice_number}
                  onChange={(e) =>
                    setFormValues({ ...formValues, invoice_number: e.target.value })
                  }
                  className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f6f4e] ${
                    isLowConfidence('invoice_number')
                      ? 'border-[#9a6b0c] bg-[#f6ecd6]/40'
                      : 'border-[#d7dcd9] bg-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={formValues.invoice_date}
                  onChange={(e) =>
                    setFormValues({ ...formValues, invoice_date: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                  Customer Name <span className="text-[#a8403c]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formValues.customer_name}
                  onChange={(e) =>
                    setFormValues({ ...formValues, customer_name: e.target.value })
                  }
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f6f4e] ${
                    isLowConfidence('customer_name')
                      ? 'border-[#9a6b0c] bg-[#f6ecd6]/40'
                      : 'border-[#d7dcd9] bg-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                  Customer Type
                </label>
                <select
                  value={formValues.customer_type}
                  onChange={(e) =>
                    setFormValues({ ...formValues, customer_type: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
                >
                  <option value="">Select type</option>
                  {CUSTOMER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                  Total Amount (₹) <span className="text-[#a8403c]">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formValues.total_amount}
                  onChange={(e) =>
                    setFormValues({ ...formValues, total_amount: e.target.value })
                  }
                  className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f6f4e] ${
                    isLowConfidence('total_amount')
                      ? 'border-[#9a6b0c] bg-[#f6ecd6]/40'
                      : 'border-[#d7dcd9] bg-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                  Paid so far (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formValues.paid_amount}
                  onChange={(e) =>
                    setFormValues({ ...formValues, paid_amount: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
                />
              </div>
            </div>

            {/* Calculated Pending Preview */}
            <div className="p-3 bg-gray-50 border border-[#d7dcd9] rounded-xl flex items-center justify-between">
              <span className="text-xs font-medium text-[#5b6660]">
                Outstanding Pending Balance
              </span>
              <span className="font-mono text-sm font-bold text-[#1c2321]">
                {money(pendingCalc)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                  Payment Mode
                </label>
                <select
                  value={formValues.payment_mode}
                  onChange={(e) =>
                    setFormValues({ ...formValues, payment_mode: e.target.value })
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
                  Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Check received / delivery notes"
                  value={formValues.remarks}
                  onChange={(e) =>
                    setFormValues({ ...formValues, remarks: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 border border-[#d7dcd9] hover:bg-gray-50 text-[#1c2321] text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw size={16} />
                <span>Start over</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#2f6f4e] hover:bg-[#1f4d36] disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving invoice…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    <span>Confirm &amp; Save Entry</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


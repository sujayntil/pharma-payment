import { useState } from 'react';
import { Check } from 'lucide-react';
import { formatDateLocal, daysAgo } from '../../utils/formatters';

export default function DateFilter({
  initialPreset = 'all',
  onApply,
  className = '',
}) {
  const [activePreset, setActivePreset] = useState(initialPreset);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const handlePreset = (preset) => {
    setActivePreset(preset);
    if (preset === 'custom') {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);

    if (preset === 'all') {
      onApply(null, null);
      return;
    }

    const n = parseInt(preset, 10);
    // "Today" (n=1) -> daysAgo(0)
    const from = formatDateLocal(daysAgo(n - 1));
    const to = formatDateLocal(new Date());
    onApply(from, to);
  };

  const handleCustomApply = (e) => {
    e?.preventDefault();
    onApply(customFrom || null, customTo || null);
  };

  const presets = [
    { id: 'all', label: 'All time' },
    { id: '1', label: 'Today' },
    { id: '5', label: 'Last 5 days' },
    { id: '7', label: 'Last week' },
    { id: '30', label: 'Last month' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {presets.map((p) => {
          const isActive = activePreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors border cursor-pointer ${
                isActive
                  ? 'bg-[#2f6f4e] text-white border-[#2f6f4e] shadow-xs'
                  : 'bg-white text-[#1c2321] border-[#d7dcd9] hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {showCustom && (
        <form
          onSubmit={handleCustomApply}
          className="p-3 bg-gray-50 rounded-lg border border-[#d7dcd9] max-w-md animate-in fade-in slide-in-from-top-1"
        >
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-[#5b6660] mb-1">
                From Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs sm:text-sm bg-white border border-[#d7dcd9] rounded-md focus:outline-none focus:ring-1 focus:ring-[#2f6f4e]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5b6660] mb-1">
                To Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs sm:text-sm bg-white border border-[#d7dcd9] rounded-md focus:outline-none focus:ring-1 focus:ring-[#2f6f4e]"
                />
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#2f6f4e] hover:bg-[#1f4d36] rounded-md transition-colors cursor-pointer"
            >
              <Check size={14} /> Apply range
            </button>
          </div>
        </form>
      )}
    </div>
  );
}


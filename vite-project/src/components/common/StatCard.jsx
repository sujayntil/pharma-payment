/**
 * Reusable KPI / Stat card component.
 */
export default function StatCard({ label, value, accent = false, icon: Icon, subtext }) {
  return (
    <div
      className={`p-4 sm:p-5 rounded-xl border transition-shadow ${
        accent
          ? 'bg-[#e3efe8] border-[#2f6f4e] text-[#1c2321] shadow-sm'
          : 'bg-white border-[#d7dcd9] shadow-xs'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs sm:text-sm font-medium text-[#5b6660]">
          {label}
        </span>
        {Icon && (
          <span
            className={`p-1.5 rounded-lg ${
              accent ? 'bg-[#2f6f4e]/10 text-[#2f6f4e]' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <Icon size={16} />
          </span>
        )}
      </div>
      <div className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-[#1c2321]">
        {value}
      </div>
      {subtext && (
        <div className="mt-1 text-xs text-[#5b6660] font-normal">{subtext}</div>
      )}
    </div>
  );
}


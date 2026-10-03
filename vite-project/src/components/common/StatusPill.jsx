/**
 * Renders a status pill for PAID, PARTIAL, or UNPAID with dot indicator.
 */
export default function StatusPill({ status }) {
  const s = (status || 'UNPAID').toUpperCase();

  const styles = {
    PAID: 'bg-[#e3efe8] text-[#2f6f4e] border-[#2f6f4e]/20',
    PARTIAL: 'bg-[#f6ecd6] text-[#9a6b0c] border-[#9a6b0c]/20',
    UNPAID: 'bg-[#f6e3e1] text-[#a8403c] border-[#a8403c]/20',
  };

  const currentStyle = styles[s] || styles.UNPAID;
  const label = s.charAt(0) + s.slice(1).toLowerCase();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${currentStyle}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}


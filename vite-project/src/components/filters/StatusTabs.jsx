import { SegmentedControl } from '@mantine/core';
import { useIsMobile } from '../../hooks/useIsMobile';

const OPTIONS = [
  { value: '', label: 'All' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIAL', label: 'Part paid' },
  { value: 'PAID', label: 'Paid' },
];

/** One-click payment-status filter; stretches to full width on phones. */
export default function StatusTabs({ value, onChange, options = OPTIONS }) {
  const isMobile = useIsMobile();
  return <SegmentedControl size="sm" fullWidth={isMobile} style={isMobile ? { width: '100%' } : undefined} value={value || ''} onChange={onChange} data={options} aria-label="Payment status" />;
}

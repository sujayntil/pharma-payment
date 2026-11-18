import RowCard from './RowCard';
import SelectMark from './SelectMark';
import { useLongPress } from '../../hooks/useLongPress';

/**
 * A RowCard that can be ticked like the invoice cards: press and hold to
 * start selecting; while selecting, taps tick (only rows that can be ticked)
 * and the layout stays the same, with a ✓ on the card's left edge.
 */
export default function SelectableRowCard({ onOpen, canSelect, selecting, selected, onToggle, label, ...props }) {
  const tap = selecting ? (canSelect ? onToggle : undefined) : onOpen;
  const press = useLongPress(onToggle, tap, { enabled: canSelect && !selecting });
  return (
    <RowCard
      {...props}
      onClick={press.onClick}
      press={canSelect && !selecting ? press : undefined}
      highlight={selecting && selected ? 'var(--mantine-color-green-light)' : undefined}
      borderColor={selecting && selected ? 'var(--mantine-color-green-5)' : undefined}
      marker={selecting && canSelect ? <SelectMark selected={selected} onToggle={onToggle} label={label} /> : null}
    />
  );
}

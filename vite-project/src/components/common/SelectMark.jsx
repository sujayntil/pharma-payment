import { UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

/** Round ✓ on the card's edge: filled green when ticked, an empty ring otherwise. */
export default function SelectMark({ selected, onToggle, label }) {
  return (
    <UnstyledButton
      role="checkbox"
      aria-checked={selected}
      aria-label={`Select ${label}`}
      onClick={(event) => { event.stopPropagation(); onToggle(); }}
      style={{
        width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: selected ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-body)',
        border: `2px solid ${selected ? 'var(--mantine-color-green-6)' : 'var(--app-faint)'}`,
        boxShadow: '0 1px 3px rgba(0,0,0,.15)',
      }}
    >
      {selected && <IconCheck size={14} stroke={3} color="white" />}
    </UnstyledButton>
  );
}

import { useState } from 'react';
import { Anchor, Chip, Menu, SimpleGrid, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { MORE_MODES, REFERENCE_LABEL } from './paymentModes';

/**
 * Payment mode as one-tap chips: Cash · UPI · Cheque · More ▾ (Bank
 * Transfer, NEFT, RTGS, Other). Under it, "+ Add cheque number" or
 * "+ Add UTR / reference" (nothing for Cash) opens the optional box.
 * Required: nothing is picked at first, so the mode is always a real choice.
 */
// Compact chips so all four fit on one row, even on small phones.
const CHIP_STYLES = { root: { width: '100%' }, label: { width: '100%', justifyContent: 'center', paddingInline: 6 }, iconWrapper: { marginRight: 4 } };

export default function PaymentModeField({ mode, onMode, reference, onReference }) {
  const [showRef, setShowRef] = useState(false);
  const moreChosen = MORE_MODES.includes(mode);
  const label = REFERENCE_LABEL[mode];
  return (
    <div>
      <Text size="sm" fw={500} mb={6}>
        Payment mode <Text span c="red.6" aria-hidden>*</Text>
        {!mode && <Text span size="xs" c="dimmed" fw={400}> · tap how they paid</Text>}
      </Text>
      <SimpleGrid cols={4} spacing={6} role="radiogroup" aria-label="Payment mode" aria-required="true">
        {['Cash', 'UPI', 'Cheque'].map((item) => (
          <Chip key={item} checked={mode === item} onChange={() => onMode(item)} color="green" variant="light" radius="xl" size="sm" type="radio" styles={CHIP_STYLES}>{item}</Chip>
        ))}
        <Menu position="bottom-start" withinPortal zIndex={300}>
          <Menu.Target>
            <UnstyledButton aria-label="More payment modes" style={{ display: 'block', width: '100%' }}>
              <Chip checked={moreChosen} color="green" variant="light" radius="xl" size="sm" type="radio" component="span" styles={CHIP_STYLES} style={{ pointerEvents: 'none' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{moreChosen ? mode : 'More'}</span><IconChevronDown size={14} style={{ marginLeft: 2, flexShrink: 0 }} />
              </Chip>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            {MORE_MODES.map((item) => <Menu.Item key={item} onClick={() => onMode(item)}>{item}</Menu.Item>)}
          </Menu.Dropdown>
        </Menu>
      </SimpleGrid>
      {/* Optional, rarely used at the counter: a link until tapped. */}
      {label && (showRef || reference ? (
        <TextInput mt="sm" label={label} placeholder="Optional" value={reference} onChange={(event) => onReference(event.currentTarget.value)} autoFocus={showRef && !reference} />
      ) : (
        <Anchor component="button" type="button" size="sm" c="green.7" mt={8} onClick={() => setShowRef(true)} style={{ display: 'block' }}>
          + Add {label === 'Cheque number' ? 'cheque number' : label === 'Reference / note' ? 'note' : 'UTR / reference'}
        </Anchor>
      ))}
    </div>
  );
}

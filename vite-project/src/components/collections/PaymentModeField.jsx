import { Chip, Menu, SimpleGrid, TextInput, UnstyledButton } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { MORE_MODES, REFERENCE_LABEL } from './paymentModes';

/**
 * Payment mode as one-tap chips: Cash · UPI · Cheque · More ▾ (Bank
 * Transfer, NEFT, RTGS, Other), then the box that fits the mode: nothing
 * for Cash, an optional cheque number for Cheque, an optional UTR /
 * reference for the rest.
 */
// Compact chips so all four fit on one row, even on small phones.
const CHIP_STYLES = { root: { width: '100%' }, label: { width: '100%', justifyContent: 'center', paddingInline: 6 }, iconWrapper: { marginRight: 4 } };

export default function PaymentModeField({ mode, onMode, reference, onReference }) {
  const moreChosen = MORE_MODES.includes(mode);
  const label = REFERENCE_LABEL[mode];
  return (
    <div>
      <SimpleGrid cols={4} spacing={6} role="radiogroup" aria-label="Payment mode">
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
      {label && (
        <TextInput mt="sm" label={label} placeholder="Optional" value={reference} onChange={(event) => onReference(event.currentTarget.value)} />
      )}
    </div>
  );
}

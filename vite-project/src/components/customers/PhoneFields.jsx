import { useState } from 'react';
import { ActionIcon, Anchor, Group, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconBrandWhatsapp } from '@tabler/icons-react';
import { autoFocusOnLaptop } from '../../utils/focus';

const WHATSAPP_GREEN = '#25D366';

/**
 * The one phone section used by every customer form (MR phone form, Admin
 * Add / Edit customer, Add invoice):
 *
 *   Phone      [98765 43210            ] (WA)
 *   Alternate  [080-12345678     Clear ] (WA)     or  "+ Add alternate number"
 *   10-digit mobile, or landline with area code. Green = on WhatsApp.
 *
 * value: { phone, alternate_phone, whatsapp_on }   ('' | 'main' | 'alternate')
 * onChange(next): called with the whole updated value.
 * requiredMain: show the main number as required (it can't be removed).
 * autoFocus: focus the main number when the form opens.
 */
export default function PhoneFields({ value, onChange, requiredMain = false, autoFocus = false }) {
  const { phone = '', alternate_phone: alternate = '', whatsapp_on: whatsappOn = '' } = value;
  // The alternate box stays hidden until there is one or the user asks for it.
  const [showAlternate, setShowAlternate] = useState(Boolean(alternate));
  const set = (patch) => onChange({ ...value, ...patch });
  const toggle = (which) => set({ whatsapp_on: whatsappOn === which ? '' : which });

  return (
    <Stack gap={8}>
      <NumberRow
        label="Phone"
        required={requiredMain}
        placeholder="98765 43210 or 080-12345678"
        number={phone}
        onNumber={(next) => set({ phone: next })}
        whatsapp={whatsappOn === 'main'}
        onWhatsapp={() => toggle('main')}
        autoFocus={autoFocus}
      />
      {showAlternate ? (
        <NumberRow
          label="Alternate"
          placeholder="Optional"
          number={alternate}
          onNumber={(next) => set({ alternate_phone: next })}
          whatsapp={whatsappOn === 'alternate'}
          onWhatsapp={() => toggle('alternate')}
          onClear={() => { set({ alternate_phone: '', whatsapp_on: whatsappOn === 'alternate' ? '' : whatsappOn }); setShowAlternate(false); }}
          autoFocus={!alternate}
        />
      ) : (
        <Anchor component="button" type="button" size="sm" c="green.7" onClick={() => setShowAlternate(true)} style={{ alignSelf: 'flex-start' }}>
          + Add alternate number
        </Anchor>
      )}
      <Text size="xs" c="dimmed">10-digit mobile, or landline with area code. Green = on WhatsApp.</Text>
    </Stack>
  );
}

function NumberRow({ label, required, placeholder, number, onNumber, whatsapp, onWhatsapp, onClear, autoFocus }) {
  const filled = Boolean(number.trim());
  return (
    <Group gap={8} align="flex-end" wrap="nowrap">
      <TextInput
        style={{ flex: 1 }}
        label={label}
        required={required}
        placeholder={placeholder}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={number}
        onChange={(event) => onNumber(event.currentTarget.value)}
        data-autofocus={autoFocus ? autoFocusOnLaptop() : undefined}
        rightSection={onClear ? <Anchor component="button" type="button" size="xs" c="dimmed" onClick={onClear} aria-label={`Remove ${label.toLowerCase()} number`}>Clear</Anchor> : null}
        rightSectionWidth={onClear ? 52 : undefined}
      />
      <Tooltip label={!filled ? 'Enter the number first' : whatsapp ? 'On WhatsApp (tap to remove)' : 'Mark as on WhatsApp'} withArrow>
        <ActionIcon
          size={36}
          radius="md"
          variant={whatsapp && filled ? 'filled' : 'default'}
          color={WHATSAPP_GREEN}
          disabled={!filled}
          onClick={onWhatsapp}
          aria-pressed={whatsapp && filled}
          aria-label={`${label} is on WhatsApp`}
          style={!(whatsapp && filled) ? { color: filled ? 'var(--app-muted)' : undefined } : undefined}
        >
          <IconBrandWhatsapp size={20} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}


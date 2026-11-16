import { Fragment } from 'react';
import { ActionIcon, Group, Menu, Tooltip } from '@mantine/core';
import { IconBrandWhatsapp, IconPhone } from '@tabler/icons-react';
import { displayPhone } from '../../utils/formatters';
import { telHref, whatsappHref, whatsappNumber } from '../../utils/phone';

const WHATSAPP_GREEN = '#25D366';

/** Taps and key presses here must never also open the card or row they sit in. */
const stop = (event) => event.stopPropagation();

/**
 * Round call + WhatsApp icons for a customer. Always call first, then
 * WhatsApp; each icon only shows when it has a number to use.
 *   Call:     one number -> opens the dialler; two -> a small menu to pick.
 *   WhatsApp: opens a chat with the number marked for WhatsApp (wa.me link,
 *             no WhatsApp API needed). Hidden when none is marked.
 * size: "md" (cards, 40px) or "sm" (tables, 30px).
 * fixedWidth: keep room for both icons so table columns line up.
 */
export default function ContactActions({ phone, alternatePhone, whatsappOn, name = 'customer', size = 'md', fixedWidth = false }) {
  const numbers = [phone, alternatePhone].filter(Boolean);
  const whatsapp = whatsappNumber({ phone, alternatePhone, whatsappOn });
  const box = size === 'sm' ? 30 : 40;
  if (!numbers.length) return fixedWidth ? <div style={{ width: box * 2 + 8, flexShrink: 0 }} /> : null;

  const icon = size === 'sm' ? 16 : 20;
  const callIcon = (props) => (
    <ActionIcon variant="light" color="green" radius="xl" size={box} style={{ border: '1px solid var(--mantine-color-green-3)' }} {...props}>
      <IconPhone size={icon} stroke={1.8} />
    </ActionIcon>
  );

  return (
    <Group gap={8} wrap="nowrap" onClick={stop} onKeyDown={stop} style={{ flexShrink: 0, ...(fixedWidth && { width: box * 2 + 8 }) }}>
      {numbers.length === 1 ? (
        <Tooltip label={`Call ${displayPhone(numbers[0])}`} withArrow openDelay={400}>
          {callIcon({ component: 'a', href: telHref(numbers[0]), 'aria-label': `Call ${name}` })}
        </Tooltip>
      ) : (
        <Menu position="bottom-end" shadow="md" withinPortal zIndex={400}>
          <Menu.Target>{callIcon({ 'aria-label': `Call ${name}: choose a number` })}</Menu.Target>
          <Menu.Dropdown onClick={stop}>
            {numbers.map((number, index) => (
              <Fragment key={number}>
                {index > 0 && <Menu.Divider />}
                <Menu.Item component="a" href={telHref(number)} leftSection={<IconPhone size={16} />}>
                  {displayPhone(number)}
                </Menu.Item>
              </Fragment>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
      {whatsapp && (
        <Tooltip label={`WhatsApp ${displayPhone(whatsapp)}`} withArrow openDelay={400}>
          <ActionIcon
            component="a"
            href={whatsappHref(whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            radius="xl"
            size={box}
            variant="filled"
            color={WHATSAPP_GREEN}
            aria-label={`WhatsApp ${name}`}
          >
            <IconBrandWhatsapp size={icon} stroke={1.8} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

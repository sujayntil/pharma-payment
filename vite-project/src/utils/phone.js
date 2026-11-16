/*
 * Links for the call and WhatsApp icons. Numbers arrive as the backend
 * stores them: a mobile as 10 digits ("9876543210"), a landline with its
 * area code as typed ("080-12345678").
 */

const digitsOf = (value) => (value || '').replace(/\D/g, '');
const isMobile = (digits) => /^[6-9]\d{9}$/.test(digits);

/** Number in international form without "+": 919876543210 / 918012345678. */
function internationalDigits(value) {
  const digits = digitsOf(value);
  if (isMobile(digits)) return `91${digits}`;
  if (/^0\d{10}$/.test(digits)) return `91${digits.slice(1)}`;
  return digits;
}

/** tel: link that opens the dialler with the number filled in. */
export function telHref(value) {
  const digits = digitsOf(value);
  return isMobile(digits) ? `tel:+91${digits}` : `tel:${digits}`;
}

/** wa.me link: opens a WhatsApp chat with this number (no API needed). */
export function whatsappHref(value) {
  return `https://wa.me/${internationalDigits(value)}`;
}

/** The number the customer marked for WhatsApp, or null. */
export function whatsappNumber({ phone, alternatePhone, whatsappOn }) {
  if (whatsappOn === 'main') return phone || null;
  if (whatsappOn === 'alternate') return alternatePhone || null;
  return null;
}

/**
 * Turns a PhoneFields value into what the API expects: trimmed numbers, and a
 * WhatsApp choice only when that number is filled in.
 */
export function phonePayload({ phone = '', alternate_phone: alternate = '', whatsapp_on: whatsappOn = '' }) {
  const numbers = { main: phone.trim(), alternate: alternate.trim() };
  return {
    phone: numbers.main,
    alternate_phone: numbers.alternate,
    whatsapp_on: whatsappOn && numbers[whatsappOn] ? whatsappOn : '',
  };
}

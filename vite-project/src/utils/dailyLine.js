/**
 * One short, positive line a day for each person: the same all day, a new one
 * tomorrow, and different people usually get different lines on the same day.
 * Never about targets or amounts.
 */
const LINES = [
  'Every visit counts.',
  'Small steps, big month.',
  'Your customers trust you.',
  'Keep showing up. It works.',
  'Aaj ka din aapka hai.',
  'Mehnat kabhi bekaar nahi jaati.',
  'One call at a time.',
  'You make it happen.',
  'Chalo, aaj kuch bada karte hain.',
  'Good work builds good name.',
  'Smile — it opens doors.',
  'Har din ek naya mauka.',
  'Consistency beats luck.',
  'Aap pe bharosa hai.',
  'Today is a fresh start.',
  'Thoda aur, bas thoda aur.',
  'Great teams start with you.',
  'Josh high rakho!',
  'Doctors remember good people.',
  'Be proud of today.',
  'Ek ek visit se banta hai mahina.',
  'You are the face of the company.',
  'Shuruaat achhi, toh din achha.',
  'Steady hands, strong results.',
  'Aapka kaam, aapki pehchaan.',
  'Make today count.',
  'Small wins add up.',
  'Kal se behtar, aaj.',
];

const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function todayKey(date = new Date()) {
  return dayKey(date);
}

export function dailyLine(userId, date = new Date()) {
  const day = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000);
  const seed = Number(userId) || 0;
  return LINES[(((day + seed * 7) % LINES.length) + LINES.length) % LINES.length];
}

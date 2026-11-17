/** King (👑, default) or Queen (👸), set per user in Admin → Users. */
export const isQueen = (user) => String(user?.title || '').toUpperCase() === 'QUEEN';
export const crownFor = (user) => (isQueen(user) ? '👸' : '👑');
/** "Sales King" → "Sales Queen" for a Queen. */
export const royalWords = (text, user) => (isQueen(user) ? String(text).replace(/\bKing\b/g, 'Queen') : text);

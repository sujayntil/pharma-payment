/** Lists sit in a bordered panel on desktop; on phones the cards stand on their own. */
export const listPaperProps = (isMobile) => (isMobile ? { p: 0, bg: 'transparent' } : { withBorder: true, p: 'md' });

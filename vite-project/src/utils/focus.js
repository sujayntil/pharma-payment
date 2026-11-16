/**
 * Forms put the cursor in their first box only on a laptop (mouse or
 * trackpad). On phones and tablets that would pop the keyboard up before the
 * user taps anything, so there nothing is focused until they tap a box.
 * Use as: <TextInput data-autofocus={autoFocusOnLaptop()} />
 */
export function autoFocusOnLaptop() {
  if (typeof window === 'undefined' || !window.matchMedia) return undefined;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches ? true : undefined;
}

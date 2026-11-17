/**
 * Things that must finish before the "Update available" screen may appear:
 * an open Collect sheet, an Undo bar still counting. Each holds the gate
 * while it is on screen.
 */
let holds = 0;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener(holds > 0));

/** Hold the gate; call the returned function to let go (safe to call twice). */
export function holdUpdate() {
  holds += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    // A short grace period: the next step (celebration → Undo bar) takes over
    // the hold before the update screen could flash in between.
    setTimeout(() => { holds = Math.max(holds - 1, 0); notify(); }, 500);
  };
}

export function isUpdateHeld() {
  return holds > 0;
}

export function onUpdateHoldChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

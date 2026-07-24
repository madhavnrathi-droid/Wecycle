/* Ref-counted body scroll lock.
 *
 * Multiple layered surfaces (Modal + a full-page builder above it, stacked
 * desktop detail modals, …) each want the body locked. Naïve per-surface
 * save/restore breaks when two locks release in mount order — the second
 * restore writes back the 'hidden' it captured from the first, wedging the
 * body locked for the rest of the session. Counting fixes it: the FIRST lock
 * captures the true original, the LAST release restores it.
 */

let count = 0;
let original = '';

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (count === 0) {
    original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count -= 1;
    if (count === 0) document.body.style.overflow = original;
  };
}

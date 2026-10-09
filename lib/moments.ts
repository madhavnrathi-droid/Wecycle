'use client';

/* ── Moments: motion, touch and sound, decided once ────────────────────────
 *
 * A "moment" is something the member did that changed the world: a save, a
 * post going live, an item sold. Each one is felt three ways at once — a
 * movement, a haptic, sometimes a sound — and those three have to agree, or the
 * phone feels like three different products arguing.
 *
 * So call sites name the moment (`moments.saved(button)`), and this file owns
 * the choreography. Retuning how "sold" feels is a change here, not a hunt
 * through components. The rhythm is iOS's: the haptic and the visual peak land
 * together, the sound a beat after, never before.
 *
 * Restraint is the brief. Most moments are silent; the ones that make a sound
 * are the endings (live, sold) and a reply in an open chat. A burst of dots
 * happens on the FIRST save of a session only — special because it is rare.
 */
import { haptics } from './haptics';
import { burst, land, play, DUR, SPRING } from './motion';
import { sfxSave, sfxLive, sfxSold, sfxError, sfxReceive } from './sfx';
import { getSettings } from './settings';

let savedThisSession = false;

export const moments = {
  /** A heart filled. The CSS pop runs on [data-saved]; this adds the touch,
   *  and on the first save of the session, a small burst and a tick. */
  saved(anchor?: Element | null) {
    haptics.favorite(true);
    /* The pop is scripted rather than keyed to [data-saved], because that
       attribute is also there on first paint for everything already saved —
       a CSS animation on it made every saved heart on the page jump at once. */
    const glyph = anchor?.querySelector('svg') ?? anchor;
    play(glyph, [{ transform: 'scale(0.62)' }, { transform: 'scale(1)' }],
      { duration: DUR[4], easing: SPRING.bouncy });
    if (!savedThisSession) {
      savedThisSession = true;
      burst(anchor, { count: 6 });
      sfxSave();
    }
  },
  /** A heart emptied — quieter than filling it, by design. */
  unsaved() {
    haptics.favorite(false);
  },
  /** A post went up. `el` is the thing that now represents it (the new card,
   *  the detail hero) — it lands and rings once. */
  postLive(el?: Element | null, { haptic = true }: { haptic?: boolean } = {}) {
    if (haptic) haptics.success();
    if (el) land(el, { ring: true });
    setTimeout(sfxLive, 40);
  },
  /** An item marked sold — the stamp's own CSS drops it; this is the rest. */
  sold() {
    haptics.success();
    setTimeout(sfxSold, 120);
  },
  /** A reply arrived in the chat that is open. */
  replyReceived() {
    haptics.light();
    let chime = false;
    try { chime = getSettings().notifications.channels.sound; } catch { /* default off */ }
    sfxReceive(chime);
  },
  /** Something the member asked for failed. Felt and heard, never alarming. */
  failed(el?: Element | null) {
    haptics.error();
    sfxError();
    if (el) {
      play(el, [
        { transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
        { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' },
        { transform: 'translateX(0)' },
      ], { duration: DUR[4], easing: SPRING.snappy });
    }
  },
};

/* ── "You just posted this" ──
 * The form knows a post went up; the detail screen that opens next is where
 * the celebration belongs, because that is where the member's eyes are. The
 * form marks the id, the screen consumes it once — so reopening the same post
 * later never replays the moment. */
const justPosted = new Set<string>();
export function markJustPosted(id: string) { justPosted.add(id); }
export function consumeJustPosted(id: string): boolean {
  if (!justPosted.has(id)) return false;
  justPosted.delete(id);
  return true;
}

/* ── "You just sold this" ──
 * Same idea for the stamp: a card that is ALREADY sold when a screen loads
 * shows its stamp still; only the one the member just marked drops in. The
 * stamp reads (not consumes) on render — React may render twice — and clears
 * itself once its animation has run. */
const justSold = new Set<string>();
export function markJustSold(id: string) { justSold.add(id); }
export function isJustSold(id: string): boolean { return justSold.has(id); }
export function clearJustSold(id: string) { justSold.delete(id); }

/* ── Stacking order, in one place ────────────────────────────────────────────
 *
 * Before this existed, four different overlays all sat at z-index 100/101:
 * the dialog backdrop (.modal), the desktop detail theatre, the Lost & Found
 * sheet and the report sheet. Whenever two were open at once, the winner was
 * whichever happened to render later in the DOM — which is how the sign-in
 * dialog ended up BEHIND an open product on desktop.
 *
 * The bands are 100 apart so a new surface can slot between two of them
 * without renumbering anything. The rule that matters:
 *
 *     CONTENT sits below DIALOGS, and a dialog opened FROM a dialog sits
 *     above the one that opened it.
 *
 * globals.css mirrors these numbers for the class-based surfaces
 * (.modal-backdrop / .modal / .bottom-sheet-overlay / .ss-overlay); grep for
 * Z_LAYER there before changing either side, and keep the two in step.
 */
export const Z_LAYER = {
  /** Bottom navigation dock — above the page, below everything modal. */
  nav: 40,
  /** Bottom sheets that don't block the whole screen. */
  sheet: 50,
  /** Saved-search / filter overlay. */
  filters: 90,
  /** Content overlays: the desktop detail theatre and the L&F sheet. These
   *  present a POST, so they're content — dialogs go over them. */
  content: 100,
  /** Slide-in navigation drawer. Above content (you can open it over a post),
   *  below dialogs. */
  drawer: 200,
  /** Full-page takeovers (form builder / registration) — content, but owns
   *  the whole viewport, so above the theatre it was launched from. */
  fullPage: 240,
  /** Dialogs: sign-in, post composers, alert form. Above all content, because
   *  a dialog is always an interruption of whatever is behind it. */
  dialog: 300,
  /** A dialog opened from inside a dialog (photo editor from a post form). */
  dialogNested: 400,
  /** Share-card preview — the last thing you open, over everything. */
  shareCard: 500,
} as const;

/** Backdrops sit at the band, the panel one above it. */
export const zPanel = (layer: number) => layer + 1;

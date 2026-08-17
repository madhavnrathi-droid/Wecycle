/* Shared WhatsApp button colours — see the note below. */
/* WhatsApp CTA colours.
 *
 * White label, which forces the fill. White on WhatsApp's brand #25D366 is
 * 1.98:1 — not readable text by any standard. #00863C is the brightest colour
 * at WhatsApp's own hue (142deg) that carries white at 4.69:1, so the button
 * still reads as WhatsApp (helped by the glyph and the word) while the label is
 * legible.
 *
 * Exported from one place because this pairing previously existed as four
 * separate copies of the same two hexes, which is how they all ended up wrong
 * together. */
export const WA_FILL = '#00863C';
export const WA_INK = '#FFFFFF';

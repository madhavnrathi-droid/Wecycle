/* ── Objectionable-content filter ──────────────────────────────────────────
 *
 * App Review guideline 1.2 requires apps with user-generated content to have
 * "a method for filtering objectionable content". Wecycle had the other two
 * precautions — flagging and blocking — but nothing stopped the content going
 * up in the first place, which is the one Apple names first.
 *
 * WHAT THIS IS NOT. It is not a moderation system and it does not pretend to
 * understand meaning. It refuses a specific, narrow class of terms — slurs and
 * explicit sexual content — at the moment of posting, so the obvious cases
 * never reach a feed. Everything subtler stays the job of the report button and
 * a human reading it.
 *
 * NORMALISATION IS THE WHOLE TRICK. A literal word list catches nothing: the
 * first person to write "f u c k" or "sh1t" walks straight past it. So the text
 * is folded — accents stripped, digit and symbol substitutions undone, runs of
 * a repeated letter collapsed, separators removed — and matched on word
 * boundaries against the folded list. Word boundaries matter: without them
 * "class" and "Scunthorpe" are casualties, which is how naive filters end up
 * more annoying than useful.
 *
 * Enforced again in the database (see the reject_objectionable_content trigger)
 * because this file runs on the client, and the client is not a boundary.
 */

/** Slurs and explicit terms. Kept deliberately short and specific: every entry
 *  should be indefensible in context, because anything ambiguous belongs to the
 *  report flow, not to an automatic refusal. */
const BLOCKED = [
  'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'asshole', 'dickhead',
  'nigger', 'nigga', 'faggot', 'retard', 'tranny', 'chink', 'spic', 'kike',
  'whore', 'slut', 'rape', 'paedophile', 'pedophile', 'childporn',
  'randi', 'chutiya', 'madarchod', 'behenchod', 'bhosdike', 'gaand', 'lund',
];

/** Digit/symbol substitutions people use to dodge a literal match. */
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
};

/** Fold text to the form the list is matched against. */
function normalize(input: string): string {
  let s = input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[0134578@$!|+]/g, c => LEET[c] ?? c);
  /* Separators inserted between letters: f.u.c.k, f-u-c-k, f u c k */
  s = s.replace(/[^a-z\s]/g, '');
  s = s.replace(/\b(?:[a-z]\s){2,}[a-z]\b/g, m => m.replace(/\s/g, ''));
  /* Padded repeats: fuuuuck -> fuck, sooo -> so. Collapsed to a SINGLE
     character rather than two, because the list is folded the same way and any
     other floor leaves a gap — at two, "fuuuuck" folds to "fuuck" and matches
     nothing. Collapsing both sides identically is what makes the comparison
     total. Real words fold too ("class" -> "clas"), which is harmless because
     nothing in the list folds onto them. */
  s = s.replace(/([a-z])\1+/g, '$1');
  return s;
}

/* The list, folded by exactly the same function the input goes through. */
const FOLDED = BLOCKED.map(normalize);
const PATTERNS = FOLDED.map(w => new RegExp(`\\b${w}s?\\b`, 'i'));

/** The first blocked term found, or null. Returned rather than a boolean so the
 *  caller can say WHICH word — a refusal that will not say what it objected to
 *  is one the writer cannot act on. */
export function findObjectionable(text: string): string | null {
  if (!text) return null;
  const folded = normalize(text);
  for (let i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i].test(folded)) return BLOCKED[i];
  }
  return null;
}

export function isObjectionable(text: string): boolean {
  return findObjectionable(text) !== null;
}

/** Message shown when a post is refused. Names the term, because "that contains
 *  objectionable content" against a 500-word description is a puzzle. */
export function objectionableMessage(term: string): string {
  return `Please reword this — “${term}” isn’t allowed on Wecycle.`;
}

/* ── One guard for every write path ────────────────────────────────────────
 *
 * Called from the data layer rather than from each form, because the filter
 * being wired into ONE form is exactly how this shipped incomplete the first
 * time: listings were checked and comments, requests, events and lost-and-found
 * were not. A choke point cannot be forgotten by the next screen someone adds.
 *
 * Throws rather than returning a flag so a caller cannot accidentally ignore
 * it; every create path already surfaces thrown errors to the user. */
export class ObjectionableContentError extends Error {
  readonly term: string;
  constructor(term: string) {
    super(objectionableMessage(term));
    this.name = 'ObjectionableContentError';
    this.term = term;
  }
}

/** Check every user-written field going into one post. */
export function assertClean(fields: Array<string | null | undefined>): void {
  for (const f of fields) {
    const hit = f ? findObjectionable(f) : null;
    if (hit) throw new ObjectionableContentError(hit);
  }
}

/** Turn the database's refusal into the same sentence the client would have
 *  shown, so a post blocked server-side does not surface raw Postgres text. */
export function isServerModerationError(e: unknown): boolean {
  const msg = (e as { message?: string } | null)?.message ?? '';
  return /isn.t allowed on Wecycle|blocked term/i.test(msg);
}

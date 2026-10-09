/* The embed half of a PostgREST select string, for the Appwrite query builder.
 *
 * Its own module, free of the SDK, so it can be tested on its own — this is
 * the parser that silently dropped every `profiles!…_fkey` join for three
 * weeks, and nothing noticed because nothing could load it. */

export type Embed = { key: string; table: string; fk: string; children: Embed[] };

/* Split on the commas that are not inside a nested embed's parentheses. */
function topLevelItems(sel: string): string[] {
  const items: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { items.push(sel.slice(start, i)); start = i + 1; }
  }
  items.push(sel.slice(start));
  return items.map(s => s.trim()).filter(Boolean);
}

/** The column on `source` rows that holds the embedded row's id.
 *
 *  listing:listings(*) means "the row in `listings` whose id is my listing_id";
 *  singularising the table is how PostgREST infers it too. That guess is wrong
 *  whenever the column is not named after the table — user_id, organizer_id,
 *  actor_id all point at `profiles` — which is why those joins carry a
 *  constraint hint: profiles!listings_user_id_fkey names the constraint
 *  `<source>_<column>_fkey`, so the column is the hint between the two. */
export function embedColumn(source: string, table: string, hint?: string): string {
  if (hint) {
    const c = hint.replace(/_fkey$/, '');
    return c.startsWith(`${source}_`) ? c.slice(source.length + 1) : c;
  }
  return `${table.replace(/ies$/, 'y').replace(/s$/, '')}_id`;
}

/** `select('*, user:profiles!listings_user_id_fkey(*), listing:listings(*, …)')`
 *  -> the embeds, nested ones included.
 *
 *  This was a single regex that did not know the `!hint` form, so every join
 *  written that way — the poster on every listing, request, event and lost-and-
 *  found report, comment authors, notification actors — came back empty from
 *  the Appwrite cutover on, and every one of those people was shown as "Wecycle
 *  member". It did not know nesting either, so Saved (saves → listing → poster)
 *  lost its listings. */
export function parseSelect(sel: string, source: string): { embeds: Embed[] } {
  const embeds: Embed[] = [];
  for (const item of topLevelItems(sel)) {
    const m = /^(?:([a-z_]+)\s*:\s*)?([a-z_]+)(?:!([a-z_]+))?\s*\(([\s\S]*)\)$/i.exec(item);
    if (!m) continue;
    const [, alias, table, hint, inner] = m;
    embeds.push({
      key: alias ?? table,
      table,
      fk: embedColumn(source, table, hint),
      children: parseSelect(inner, table).embeds,
    });
  }
  return { embeds };
}

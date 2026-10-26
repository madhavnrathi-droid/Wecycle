'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2, Plus, X } from '@/lib/icons';
import { LinkGlyph } from '../PostLink';
import { normalizeLink, linkName, MAX_LINKS, MAX_LINK_LABEL, type PostLink } from '../../lib/postLink';

/* ── Links on a post: the form half ───────────────────────────────────────
 *
 * Up to three, on every kind of post. The field is built around how links
 * actually arrive — pasted, from another app — so:
 *
 *   • it opens as ONE empty row, not three, and offers the next only once the
 *     last one is a real link (nobody faces three blank boxes);
 *   • the row's mark turns into Instagram, a form, a map as soon as the paste
 *     is recognised, which is the confirmation that it was understood;
 *   • a name is optional and offered only once there is something to name.
 *     Its placeholder is the name the post will show if it is left alone
 *     ("Form", "Instagram", or the site), so the default is visible rather
 *     than a surprise;
 *   • pasting several links at once fills several rows;
 *   • a row that isn't a link says so under itself after the person leaves
 *     it, never while they are still typing.
 *
 * The rows share one soft fill with hairlines between them rather than being
 * three boxes, and the whole group lifts to white on focus like every other
 * field in the Light system.
 */

export interface LinkDraft { url: string; label: string }

export function linkDraftsOf(links: readonly PostLink[] | undefined): LinkDraft[] {
  return (links ?? []).map(l => ({ url: l.url, label: l.label ?? '' }));
}

/** The rows that are links, ready to store. Blank rows are simply not links. */
export function linksFromDrafts(drafts: readonly LinkDraft[]): PostLink[] {
  const out: PostLink[] = [];
  for (const d of drafts) {
    const url = normalizeLink(d.url);
    if (!url) continue;
    const label = d.label.replace(/\s+/g, ' ').trim();
    out.push(label ? { url, label } : { url });
  }
  return out.slice(0, MAX_LINKS);
}

const NOT_A_LINK = 'That doesn’t look like a web address. Try example.com/page';

/** Why a row can't be saved, or null. An empty row is fine — it's ignored. */
export function linkDraftError(d: LinkDraft): string | null {
  return d.url.trim() && !normalizeLink(d.url) ? NOT_A_LINK : null;
}

/** The first problem with any row, for a form's submit check. */
export function linksError(drafts: readonly LinkDraft[]): string | null {
  for (const d of drafts) {
    const e = linkDraftError(d);
    if (e) return e;
  }
  return null;
}

/** Same rows, same order — what an auto-saving editor compares against. */
export function linkDraftsKey(drafts: readonly LinkDraft[]): string {
  return JSON.stringify(linksFromDrafts(drafts));
}

interface LinksFieldProps {
  id: string;
  value: LinkDraft[];
  onChange: (next: LinkDraft[]) => void;
  /** Field heading; omit with `bare` when a row label already names it. */
  label?: string;
  /** Says what links are FOR on this kind of post. */
  hint?: string;
  /** Set once a submit has been refused, so untouched rows show errors too. */
  showErrors?: boolean;
  bare?: boolean;
}

export default function LinksField({ id, value, onChange, label = 'Links', hint, showErrors, bare }: LinksFieldProps) {
  /* Always at least one row to type into. */
  const rows = value.length ? value : [{ url: '', label: '' }];
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusNext = useRef<number | null>(null);

  useEffect(() => {
    if (focusNext.current == null) return;
    inputs.current[focusNext.current]?.focus();
    focusNext.current = null;
  });

  const set = (i: number, patch: Partial<LinkDraft>) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    onChange(next);
    setTouched(new Set());
    focusNext.current = Math.max(0, Math.min(i, next.length - 1));
  };

  const add = () => {
    if (rows.length >= MAX_LINKS) return;
    focusNext.current = rows.length;
    onChange([...rows, { url: '', label: '' }]);
  };

  /* Several links pasted at once — a list copied out of a chat — land in
     several rows instead of one row that can't be saved. */
  const onPaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const found = text.split(/\s+/).map(t => normalizeLink(t)).filter((u): u is string => !!u);
    if (found.length < 2) return;
    e.preventDefault();
    const next = rows.slice();
    let at = i;
    for (const url of found) {
      if (at >= MAX_LINKS) break;
      next[at] = { url, label: next[at]?.label ?? '' };
      at++;
    }
    onChange(next);
  };

  const last = rows[rows.length - 1];
  const canAdd = rows.length < MAX_LINKS && !!normalizeLink(last.url);
  const left = MAX_LINKS - rows.length;

  return (
    <div className="field linksf-field" style={bare ? { marginBottom: 0 } : undefined}>
      {!bare && (
        <label htmlFor={`${id}-0`} className="field-label linksf-head">
          <span>{label}</span>
          <span className="linksf-count">Optional · up to {MAX_LINKS}</span>
        </label>
      )}
      <div className="linksf">
        {rows.map((r, i) => {
          const url = normalizeLink(r.url);
          const err = (touched.has(i) || showErrors) ? linkDraftError(r) : null;
          const removable = rows.length > 1 || r.url.trim() !== '' || r.label.trim() !== '';
          return (
            <div key={i} className="linksf-row" data-valid={url ? '' : undefined}>
              <span className="linksf-glyph" aria-hidden="true">
                {url ? <LinkGlyph url={url} size={18} /> : <Link2 size={18} />}
              </span>
              <div className="linksf-main">
                <input
                  id={`${id}-${i}`}
                  ref={el => { inputs.current[i] = el; }}
                  className="linksf-url"
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                  enterKeyHint={canAdd && i === rows.length - 1 ? 'next' : 'done'}
                  placeholder={i === 0 ? 'Paste a link' : 'Paste another link'}
                  aria-label={rows.length > 1 ? `Link ${i + 1}` : 'Link'}
                  aria-invalid={!!err}
                  aria-describedby={err ? `${id}-${i}-err` : undefined}
                  maxLength={500}
                  value={r.url}
                  onChange={e => set(i, { url: e.target.value })}
                  onBlur={() => setTouched(t => (t.has(i) ? t : new Set(t).add(i)))}
                  onPaste={e => onPaste(i, e)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); if (canAdd && i === rows.length - 1) add(); }
                  }}
                />
                {url && (
                  <label className="linksf-name">
                    <span>Shows as</span>
                    <input
                      type="text"
                      value={r.label}
                      maxLength={MAX_LINK_LABEL}
                      placeholder={linkName(url)}
                      aria-label={`Name for link ${i + 1} (optional)`}
                      enterKeyHint="done"
                      onChange={e => set(i, { label: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                    />
                  </label>
                )}
                {err && <span id={`${id}-${i}-err`} className="field-error linksf-err">{err}</span>}
              </div>
              {removable && (
                <button type="button" className="linksf-remove" onClick={() => remove(i)} aria-label={`Remove link ${i + 1}`}>
                  <X size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {canAdd && (
        <button type="button" className="linksf-add" onClick={add}>
          <Plus size={15} aria-hidden="true" />
          Add another link
          <span className="linksf-left">{left} left</span>
        </button>
      )}
      {hint && !bare && <span className="field-hint">{hint}</span>}
    </div>
  );
}

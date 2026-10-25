'use client';

/* ── Pick the categories a post shows up under ──────────────────────────────
 *
 * Replaces a one-answer <select>. The select made the poster guess which filter
 * their buyer would open — a camera is Electronics to one person and Hobbies to
 * the next — and hid all twelve answers behind a tap, so most people took the
 * first plausible one.
 *
 * Chips instead: every category on screen at once (recognition, not recall),
 * the same one-word names as the filter strip on Home, so what you tick here is
 * literally the filter you will be found under. Up to MAX_CATEGORIES; the
 * first one ticked is the MAIN category (where the post is listed and what its
 * header says) and is marked as such in words, not only by position. The line
 * underneath says the consequence in plain language — "Listed in Electronics ·
 * also shows under Hobbies" — because that is the thing the poster is actually
 * deciding.
 *
 * At the limit, the remaining chips stay focusable and say why they will not
 * take a fourth, rather than going silently dead.
 */

import { useId, useState } from 'react';
import { Check } from '@/lib/icons';
import { CATEGORIES, MAX_CATEGORIES, categoryLabel } from '../../lib/categories';
import { haptics } from '../../lib/haptics';

interface CategoryPickerProps {
  /** Category ids, main first. */
  value: string[];
  onChange: (next: string[]) => void;
  /** The visible field label. */
  label?: string;
  max?: number;
  /** id for the group, so an outer <label htmlFor> can point at it. */
  id?: string;
  error?: string;
  /** No visible label — the caller already labels the field (the post editor's
   *  mono field rows). The group keeps an accessible name. */
  bare?: boolean;
}

function joinLabels(ids: string[]): string {
  const names = ids.map(categoryLabel);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function CategoryPicker({
  value, onChange, label = 'Category', max = MAX_CATEGORIES, id, error, bare,
}: CategoryPickerProps) {
  const autoId = useId();
  const groupId = id ?? `catpick-${autoId}`;
  const labelId = `${groupId}-label`;
  const noteId = `${groupId}-note`;
  /* A refused fourth pick says so in the note for a moment, then the note goes
     back to describing the selection. */
  const [refused, setRefused] = useState(false);
  const atMax = value.length >= max;

  const toggle = (catId: string) => {
    if (value.includes(catId)) {
      haptics.selection();
      setRefused(false);
      onChange(value.filter(v => v !== catId));
      return;
    }
    if (atMax) {
      haptics.warning();
      setRefused(true);
      return;
    }
    haptics.selection();
    setRefused(false);
    onChange([...value, catId]);
  };

  const [main, ...rest] = value;
  const note = refused
    ? `That’s ${max} — tap one you’ve picked to swap it out.`
    : !main
      ? `Pick up to ${max}. The first is where it’s listed; the others help it show up in more filters.`
      : rest.length === 0
        ? `Listed in ${categoryLabel(main)}. Add ${max - 1 === 1 ? 'one more' : `up to ${max - 1} more`} if it fits another filter too.`
        : `Listed in ${categoryLabel(main)} · also shows under ${joinLabels(rest)}.`;

  return (
    <div className="field catpick-field" data-bare={bare || undefined}>
      <span id={labelId} className={bare ? 'sr-only' : 'field-label'}>
        {label}
        {value.length > 0 && <span className="catpick-count">{value.length} of {max}</span>}
      </span>
      <div
        id={groupId}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={noteId}
        className="catpick"
      >
        {CATEGORIES.map(c => {
          const picked = value.includes(c.id);
          const isMain = picked && value[0] === c.id;
          const blocked = !picked && atMax;
          return (
            <button
              key={c.id}
              type="button"
              className="catpick-chip"
              aria-pressed={picked}
              aria-disabled={blocked || undefined}
              aria-label={`${c.label}${isMain ? ', main category' : ''}`}
              title={c.examples}
              data-main={isMain || undefined}
              onClick={() => toggle(c.id)}
            >
              {picked && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
              <span>{c.short}</span>
              {isMain && value.length > 1 && <span className="catpick-main" aria-hidden="true">Main</span>}
            </button>
          );
        })}
      </div>
      <span
        id={noteId}
        className={error ? 'field-error' : 'field-hint'}
        aria-live="polite"
      >
        {error ?? note}
      </span>
    </div>
  );
}

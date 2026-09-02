'use client';

/* Saved-search / "notify me" bar for the Requests tab.
 *
 * Built on Radix Dialog (accessible focus-trapped modal — Esc to close, aria
 * wired, scroll-locked) so the manager is keyboard- and screen-reader-friendly
 * out of the box (WCAG 2.1). Visual styling matches the app's lime/black
 * system rather than a generic component-library look.
 *
 * What it does:
 *  - "Notify me" pill → opens a manager to add keywords ("cycle", "iphone
 *    charger", "physics textbook"). Pre-fills whatever's in the search box.
 *  - Shows a live banner when currently-open requests match a saved keyword,
 *    so the user sees value immediately (no push backend required yet).
 */

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Bell, BellPlus, X, Plus, Sparkles } from 'lucide-react';
import {
  getSavedSearches, addSavedSearch, removeSavedSearch, onSavedSearchesChange,
  matchesAnySavedSearch, syncSavedSearches, type SavedSearch,
} from '../lib/savedSearches';
import type { MarketplaceItem } from '../lib/mockData';
import { track, EVT } from '../lib/analytics';

interface Props {
  /** Current open requests — used to compute the live match banner. */
  requests: MarketplaceItem[];
  /** Whatever's typed in the feed search box, to pre-fill the add field. */
  currentQuery?: string;
  /** Jump the feed to a keyword when a match chip is tapped. */
  onRunSearch?: (q: string) => void;
}

export default function SavedSearchBar({ requests, currentQuery = '', onRunSearch }: Props) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');

  useEffect(() => {
    setSearches(getSavedSearches());
    /* Reconcile local mirror ↔ DB: pushes pre-sign-in keywords up so the
       push-fanout Edge Function can match them, then pulls the server list. */
    void syncSavedSearches();
    return onSavedSearchesChange(() => setSearches(getSavedSearches()));
  }, []);

  /* Pre-fill the add field with the active search query each time the manager
     opens — turns "I searched cycle, found nothing" into a one-tap alert. */
  useEffect(() => {
    if (open) setInput(currentQuery.trim());
  }, [open, currentQuery]);

  const matches = useMemo(() => {
    if (!searches.length) return [];
    return requests.filter(r =>
      matchesAnySavedSearch(`${r.title} ${r.description}`, searches),
    );
  }, [requests, searches]);

  const add = () => {
    const q = input.trim();
    if (!q) return;
    setSearches(addSavedSearch(q));
    track(EVT.saved_search_added, { query_len: q.length });
    setInput('');
  };

  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="ss-trigger"
              aria-label="Set up an alert for new requests"
            >
              <BellPlus size={15} strokeWidth={2} />
              {searches.length ? `${searches.length} alert${searches.length > 1 ? 's' : ''} on` : 'Notify me'}
            </button>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay className="ss-overlay" />
            <Dialog.Content className="ss-content" aria-describedby="ss-desc">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Bell size={16} strokeWidth={2} style={{ color: 'var(--accent-lime-dim)' }} />
                <Dialog.Title style={{ fontSize: 'calc(17px * var(--text-scale))', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                  Notify me about…
                </Dialog.Title>
                <span style={{ flex: 1 }} />
                <Dialog.Close asChild>
                  <button className="ss-close" aria-label="Close">
                    <X size={18} strokeWidth={1.8} />
                  </button>
                </Dialog.Close>
              </div>
              <Dialog.Description id="ss-desc" style={{ fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
                Add a keyword and we&rsquo;ll flag it the moment someone posts a matching request — no more refreshing the board.
              </Dialog.Description>

              <form
                onSubmit={e => { e.preventDefault(); add(); }}
                style={{ display: 'flex', gap: 8, marginBottom: 14 }}
              >
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="e.g. cycle, lab coat, charger"
                  aria-label="Keyword to be notified about"
                  className="ss-input"
                  autoFocus
                />
                <button type="submit" className="ss-add" aria-label="Add alert" disabled={!input.trim()}>
                  <Plus size={16} strokeWidth={2.4} />
                </button>
              </form>

              {searches.length === 0 ? (
                <p style={{ fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0 4px' }}>
                  No alerts yet — add your first keyword above.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {searches.map(s => (
                    <li key={s.id}>
                      <span className="ss-chip">
                        {s.query}
                        <button
                          onClick={() => setSearches(removeSavedSearch(s.id))}
                          aria-label={`Remove alert for ${s.query}`}
                          className="ss-chip-x"
                        >
                          <X size={13} strokeWidth={2.2} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <VisuallyHidden>End of alerts manager</VisuallyHidden>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {matches.length > 0 && (
          <span className="ss-match" role="status">
            <Sparkles size={13} strokeWidth={2} />
            {matches.length} open match{matches.length > 1 ? 'es' : ''} your alert{searches.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {matches.length > 0 && onRunSearch && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {[...new Set(matches.map(m => m.title))].slice(0, 4).map(title => (
            <button key={title} className="ss-match-chip" onClick={() => onRunSearch(title)}>
              {title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

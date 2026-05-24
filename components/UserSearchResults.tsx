'use client';

/* UserSearchResults — horizontal preview row shown above the masonry feed
 * whenever the search query yields one or more user matches.
 *
 * Layout per card (matches the spec — pro/scalable look):
 *
 *   ┌──────────────────────────────────────────┐
 *   │  ●●●  Madhav Rathi                ›      │   ← biggest: name
 *   │       madhav@learner.manipal.edu         │   ← email
 *   │       245310174 · SMI                    │   ← smallest: ID + dept
 *   └──────────────────────────────────────────┘
 *
 *   - Avatar is a 44 px circle on the left
 *   - Name is 14 px / 600, full color
 *   - Email is 12 px / 500, secondary color
 *   - ID + department row is 11 px / 500, muted
 *   - Chevron on the right hints at tap-to-navigate
 *
 * The row is a horizontal scroll-snap on mobile (cards ~280 px wide) and
 * a 2-up grid at desktop widths so multiple matches read at a glance.
 */

import { ChevronRight, Users } from 'lucide-react';
import { getAvatar } from '../lib/photos';
import OnlineBadge from './OnlineBadge';
import type { UserSearchHit } from '../lib/liveData';

interface UserSearchResultsProps {
  results: UserSearchHit[];
  query: string;
  loading?: boolean;
  onPick: (hit: UserSearchHit) => void;
}

export default function UserSearchResults({
  results, query, loading, onPick,
}: UserSearchResultsProps) {
  if (!query.trim()) return null;
  /* When loading shows no results yet, render a quiet placeholder so the
     section doesn't pop in and out as the user types. */
  if (loading && results.length === 0) {
    return (
      <section className="user-search-results" aria-busy="true">
        <SectionHeader query={query} loading />
      </section>
    );
  }
  if (results.length === 0) return null;

  return (
    <section className="user-search-results" aria-label="People matching your search">
      <SectionHeader query={query} count={results.length} />
      <div className="user-search-track">
        {results.map(hit => (
          <UserPreviewCard key={hit.id} hit={hit} onClick={() => onPick(hit)} />
        ))}
      </div>
    </section>
  );
}

function SectionHeader({
  query, count, loading,
}: { query: string; count?: number; loading?: boolean }) {
  return (
    <header className="user-search-header">
      <Users size={13} strokeWidth={1.8} />
      <span className="user-search-header-title">
        People
        {loading
          ? <> · searching…</>
          : count !== undefined && (
            <span style={{ opacity: 0.65 }}> · {count} {count === 1 ? 'match' : 'matches'} for “{query}”</span>
          )}
      </span>
    </header>
  );
}

function UserPreviewCard({
  hit, onClick,
}: { hit: UserSearchHit; onClick: () => void }) {
  /* Secondary row: prefer "ID · department" if both exist, else whichever
     is present, else fall back to the user's role. Keeps the card tidy
     instead of dropping a blank line. */
  const idAndDept = [hit.collegeId, hit.department?.toUpperCase()].filter(Boolean).join(' · ');
  const secondary = idAndDept || hit.role || '';

  return (
    <button
      type="button"
      onClick={onClick}
      className="user-search-card"
      aria-label={`Open ${hit.name}'s storefront`}
    >
      <span className="user-search-avatar" style={{ background: hit.avatarColor }}>
        <img
          src={getAvatar(hit.id)}
          alt=""
          width={44} height={44}
          draggable={false}
        />
      </span>
      <span className="user-search-text">
        <span className="user-search-name">
          {hit.name}
          <OnlineBadge isOnline={hit.isOnline} />
        </span>
        {hit.email && (
          <span className="user-search-email">{hit.email}</span>
        )}
        {secondary && (
          <span className="user-search-meta">{secondary}</span>
        )}
      </span>
      <ChevronRight size={16} strokeWidth={1.8} className="user-search-chevron" />
    </button>
  );
}

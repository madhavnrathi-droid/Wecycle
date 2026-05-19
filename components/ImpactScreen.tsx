'use client';

import { useState } from 'react';
import {
  Settings, Share2, TrendingUp, Award, ArrowUpRight,
  Plus,
} from 'lucide-react';
import {
  IMPACT_METRICS, PERSONAL_IMPACT, LEADERBOARD, INVENTORY_ITEMS,
  CURRENT_USER, type ImpactMetric,
} from '../lib/mockData';

type Tab = 'personal' | 'community' | 'inventory';

const BADGE_CONFIG: Record<string, { emoji: string; color: string }> = {
  'Pioneer':       { emoji: '🚀', color: '#A8DD00' },
  'Top Sharer':    { emoji: '🎁', color: '#FF9A40' },
  'Green Star':    { emoji: '🌿', color: '#22C55E' },
  'Impact Leader': { emoji: '⚡', color: '#3DD6F5' },
  'Community Hero':{ emoji: '🏆', color: '#A855F7' },
  'Repair Hero':   { emoji: '🔧', color: '#A855F7' },
  'Connector':     { emoji: '🔗', color: '#6C63FF' },
  'Lab Connector': { emoji: '🧪', color: '#3DD6F5' },
  'Space Maker':   { emoji: '🏠', color: '#FF6B80' },
  'Fixer':         { emoji: '🛠️', color: '#A855F7' },
  'Newcomer':      { emoji: '👋', color: '#9A9892' },
};

export default function ImpactScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('personal');

  return (
    <div className="screen-transition" style={{ paddingBottom: 100, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── PROFILE — full bleed editorial ── */}
      <div style={{ position: 'relative' }}>

        {/* Top controls */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 4,
          padding: '12px 12px 0',
        }}>
          <button className="theme-toggle" aria-label="Share">
            <Share2 size={16} strokeWidth={2} />
          </button>
          <button className="theme-toggle" aria-label="Settings">
            <Settings size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Profile block */}
        <div style={{ padding: '4px 18px 0' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 22 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 76, height: 76, borderRadius: '50%',
                background: CURRENT_USER.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em',
              }}>
                {CURRENT_USER.initials}
              </div>
              <div style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 14, height: 14, borderRadius: '50%',
                background: '#22C55E', border: '2.5px solid var(--bg-base)',
              }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{
                margin: '0 0 3px', fontSize: 26, fontWeight: 900,
                letterSpacing: '-0.04em', color: 'var(--text-primary)',
                lineHeight: 1.05,
              }}>
                {CURRENT_USER.name}
              </h1>
              <p style={{ margin: '0 0 1px', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                {CURRENT_USER.role} · {CURRENT_USER.community}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                Member for {CURRENT_USER.joinedDaysAgo} days
              </p>
            </div>
          </div>

          {/* Inline stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            marginBottom: 4,
          }}>
            {[
              { value: CURRENT_USER.itemsShared, label: 'Shared' },
              { value: CURRENT_USER.itemsReceived, label: 'Received' },
              { value: CURRENT_USER.impactScore, label: 'Impact' },
            ].map(({ value, label }, i) => (
              <div key={label} style={{
                paddingRight: i < 2 ? 12 : 0,
                borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <p style={{
                  margin: '0 0 2px', fontSize: 22, fontWeight: 700,
                  letterSpacing: '-0.025em',
                  color: 'var(--text-primary)',
                  lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
                }}>
                  {value.toLocaleString()}
                </p>
                <p style={{
                  margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 500,
                }}>
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderTop: '1px solid var(--border-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
          marginTop: 20,
          background: 'var(--bg-base)',
        }}>
          {([
            { id: 'personal', label: 'My Impact' },
            { id: 'community', label: 'Community' },
            { id: 'inventory', label: 'Inventory' },
          ] as { id: Tab; label: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                padding: '14px 8px',
                fontSize: 12, fontWeight: 800, letterSpacing: '0.02em',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent-lime)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'personal' && <PersonalImpactTab />}
      {activeTab === 'community' && <CommunityImpactTab />}
      {activeTab === 'inventory' && <InventoryTab />}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   PERSONAL IMPACT
══════════════════════════════════════════════════ */

function PersonalImpactTab() {
  return (
    <div>

      {/* RANK — quiet confidence */}
      <div style={{
        padding: '24px 18px 22px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <p style={{
          margin: '0 0 6px', fontSize: 11, fontWeight: 600,
          color: 'var(--accent-lime-dim)',
        }}>
          Your rank
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <span style={{
            fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em',
            color: 'var(--text-primary)', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            #{PERSONAL_IMPACT.rank}
          </span>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            color: '#16A34A',
            fontSize: 12, fontWeight: 600,
          }}>
            <TrendingUp size={12} strokeWidth={2} />
            +3 this week
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Top {100 - PERSONAL_IMPACT.percentile}% of {PERSONAL_IMPACT.totalMembers.toLocaleString()} members
        </p>
      </div>

      {/* Metrics — quiet rows */}
      <div>
        {[
          { label: 'CO₂ saved',    value: `${PERSONAL_IMPACT.co2Saved}`,                  unit: 'kg',     icon: '🌿' },
          { label: 'Items moved',  value: `${PERSONAL_IMPACT.itemsCirculated}`,           unit: 'items',  icon: '♻️' },
          { label: 'Money saved',  value: `₹${(PERSONAL_IMPACT.moneySaved/1000).toFixed(1)}k`, unit: '',  icon: '💰' },
          { label: 'Repairs',      value: `${PERSONAL_IMPACT.repairsHelped}`,             unit: 'fixed',  icon: '🔧' },
        ].map(({ label, value, unit, icon }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '16px 18px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ fontSize: 24, width: 36, textAlign: 'center', flexShrink: 0 }}>
              {icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0, fontSize: 13, fontWeight: 500,
                color: 'var(--text-secondary)',
              }}>
                {label}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{
                  fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em',
                  color: 'var(--text-primary)', lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {value}
                </span>
                {unit && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {unit}
                  </span>
                )}
              </div>
            </div>
            <ArrowUpRight size={16} strokeWidth={1.8} style={{ color: 'var(--text-muted)' }} />
          </div>
        ))}
      </div>

      {/* Badges */}
      <div style={{ padding: '24px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{
            fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
          }}>
            Badges
          </span>
          <Award size={14} style={{ color: 'var(--text-muted)' }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CURRENT_USER.badges.map(badge => {
            const cfg = BADGE_CONFIG[badge];
            if (!cfg) return null;
            return (
              <div key={badge} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-pill)', padding: '5px 12px 5px 5px',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: `${cfg.color}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12,
                }}>
                  {cfg.emoji}
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)' }}>{badge}</span>
              </div>
            );
          })}
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'transparent', border: '1px dashed var(--border-default)',
            borderRadius: 'var(--radius-pill)', padding: '5px 14px',
            cursor: 'pointer',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
              +{12 - CURRENT_USER.badges.length} more
            </span>
          </div>
        </div>
      </div>

      {/* Activity */}
      <div style={{ padding: '24px 0 0' }}>
        <p style={{
          margin: '0 18px 12px', fontSize: 14, fontWeight: 600,
          letterSpacing: '-0.01em', color: 'var(--text-primary)',
        }}>
          Recent activity
        </p>
        {[
          { action: 'Request fulfilled', detail: 'Someone lent their Sony WH-1000XM4', time: '2h ago', icon: '🎧' },
          { action: 'Item shared',       detail: 'Posted IKEA chair to marketplace',     time: '1d ago', icon: '🪑' },
          { action: 'Borrowed',          detail: 'Canon EOS 200D for the weekend',        time: '3d ago', icon: '📷' },
          { action: 'Repair helped',     detail: "Fixed Priya's broken fan",              time: '1w ago', icon: '🔧' },
        ].map(({ action, detail, time, icon }, i) => (
          <div key={i} style={{
            display: 'flex', gap: 14, padding: '14px 18px',
            borderTop: '1px solid var(--border-subtle)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--bg-inset)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>
              {icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: '0 0 1px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                {action}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{detail}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   COMMUNITY IMPACT
══════════════════════════════════════════════════ */

function CommunityImpactTab() {
  return (
    <div>
      {/* Community banner — full bleed */}
      <div style={{
        padding: '20px 18px',
        display: 'flex', gap: 14, alignItems: 'center',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: 'var(--bg-inset)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, flexShrink: 0,
        }}>
          🏛️
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 1px', fontSize: 16, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>
            BITS Pilani Goa
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            1,847 members · since 2023
          </p>
        </div>
      </div>

      {/* Big metrics */}
      <div>
        {IMPACT_METRICS.map(metric => (
          <CommunityMetricRow key={metric.label} metric={metric} />
        ))}
      </div>

      {/* Leaderboard */}
      <div style={{ padding: '28px 0 0' }}>
        <p style={{
          margin: '0 18px 14px', fontSize: 14, fontWeight: 600,
          letterSpacing: '-0.01em', color: 'var(--text-primary)',
        }}>
          Leaderboard
        </p>
        <div>
          {LEADERBOARD.slice(0, 6).map((user, i) => {
            const isMe = user.id === CURRENT_USER.id;
            return (
              <div
                key={user.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 18px',
                  background: isMe ? 'rgba(168,221,0,0.06)' : 'transparent',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{
                  width: 26, textAlign: 'center', flexShrink: 0,
                  fontSize: i < 3 ? 18 : 13, fontWeight: 600,
                  color: i < 3 ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                </div>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: user.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#fff',
                }}>
                  {user.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {user.name.split(' ')[0]}
                    {isMe && <span style={{
                      fontSize: 11, color: 'var(--accent-lime-dim)', fontWeight: 500,
                    }}>· you</span>}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{user.role}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{
                    margin: 0, fontSize: 16, fontWeight: 600,
                    letterSpacing: '-0.02em', color: 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                  }}>
                    {user.impactScore.toLocaleString()}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>pts</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CommunityMetricRow({ metric }: { metric: ImpactMetric }) {
  const icons: Record<string, string> = {
    'CO₂ Prevented': '🌿', 'Items Circulated': '♻️', 'Money Saved': '💰',
    'Landfill Diverted': '🗑️', 'Repairs Completed': '🔧', 'Active Members': '👥',
  };
  const formatValue = (v: number, label: string) => {
    if (label === 'Money Saved') return `₹${(v / 1000).toFixed(0)}k`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return v.toLocaleString();
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 18px',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ fontSize: 24, width: 36, textAlign: 'center', flexShrink: 0 }}>
        {icons[metric.label] || '📊'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {metric.label}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em',
            color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
          }}>
            {formatValue(metric.value, metric.label)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {metric.unit}
          </span>
        </div>
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        color: '#16A34A',
        fontSize: 12, fontWeight: 500,
      }}>
        <ArrowUpRight size={12} strokeWidth={2} />
        +{metric.change}%
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   INVENTORY
══════════════════════════════════════════════════ */

function InventoryTab() {
  const STATUS_CONFIG = {
    available:   { label: 'Available',   color: '#22C55E' },
    borrowed:    { label: 'Borrowed',    color: 'var(--accent-amber)' },
    maintenance: { label: 'Service',     color: 'var(--accent-rose)' },
  };

  const counts = {
    available: INVENTORY_ITEMS.filter(i => i.status === 'available').length,
    borrowed:  INVENTORY_ITEMS.filter(i => i.status === 'borrowed').length,
    maint:     INVENTORY_ITEMS.filter(i => i.status === 'maintenance').length,
  };

  return (
    <div>
      {/* Status summary — inline editorial */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        padding: '24px 18px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {[
          { label: 'Available', value: counts.available, color: '#22C55E' },
          { label: 'Borrowed',  value: counts.borrowed,  color: 'var(--accent-amber)' },
          { label: 'Service',   value: counts.maint,     color: 'var(--accent-rose)' },
        ].map(({ label, value }, i) => (
          <div key={label} style={{
            paddingRight: i < 2 ? 12 : 0,
            borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none',
          }}>
            <p style={{
              margin: '0 0 2px', fontSize: 22, fontWeight: 700,
              letterSpacing: '-0.025em', color: 'var(--text-primary)',
              lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
            }}>
              {value}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* List */}
      <div>
        {INVENTORY_ITEMS.map(item => {
          const sc = STATUS_CONFIG[item.status];
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
              borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 12,
                background: item.photoColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, flexShrink: 0,
              }}>
                {item.photoIcon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <p style={{
                    margin: 0, fontSize: 14, fontWeight: 600,
                    color: 'var(--text-primary)', flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.title}
                  </p>
                  <span style={{
                    color: sc.color,
                    fontSize: 11, fontWeight: 500, flexShrink: 0,
                  }}>
                    {sc.label}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                  {item.owner}
                  {item.borrowedBy && ` · ${item.borrowedBy}`}
                  {item.dueDate && ` · due ${item.dueDate}`}
                </p>
              </div>
              {item.status === 'available' && (
                <button style={{
                  background: 'var(--text-primary)', color: 'var(--bg-base)',
                  border: 'none', padding: '7px 14px',
                  borderRadius: 999,
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                }}>
                  Borrow
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add to inventory */}
      <div style={{ padding: '24px 18px' }}>
        <div style={{
          border: '1.5px dashed var(--border-default)', borderRadius: 'var(--radius-xl)',
          padding: '20px', textAlign: 'center', cursor: 'pointer',
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>
            Add to community inventory
          </p>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)' }}>
            Share resources your community can borrow
          </p>
          <button style={{
            background: 'transparent', border: '1px solid var(--border-default)',
            borderRadius: 999, padding: '8px 16px',
            fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <Plus size={13} strokeWidth={1.8} /> Add item
          </button>
        </div>
      </div>
    </div>
  );
}

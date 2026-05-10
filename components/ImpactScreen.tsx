'use client';

import { useState } from 'react';
import {
  Leaf, Package, DollarSign, Trash2, Wrench, Users,
  TrendingUp, Award, Settings, ChevronRight, Share2,
  Star, ShieldCheck, BarChart3, ArrowUpRight, Crown,
} from 'lucide-react';
import {
  IMPACT_METRICS, PERSONAL_IMPACT, LEADERBOARD, INVENTORY_ITEMS,
  CURRENT_USER, type ImpactMetric,
} from '../lib/mockData';

type Tab = 'personal' | 'community' | 'inventory';

const METRIC_ICONS: Record<string, React.ReactNode> = {
  'CO₂ Prevented': <Leaf size={16} strokeWidth={2} />,
  'Items Circulated': <Package size={16} strokeWidth={2} />,
  'Money Saved': <DollarSign size={16} strokeWidth={2} />,
  'Landfill Diverted': <Trash2 size={16} strokeWidth={2} />,
  'Repairs Completed': <Wrench size={16} strokeWidth={2} />,
  'Active Members': <Users size={16} strokeWidth={2} />,
};

const BADGE_CONFIG: Record<string, { emoji: string; color: string; desc: string }> = {
  'Pioneer': { emoji: '🚀', color: '#C8FF4D', desc: 'Early community member' },
  'Top Sharer': { emoji: '🎁', color: '#FF9A40', desc: 'Shared 20+ items' },
  'Green Star': { emoji: '🌿', color: '#22C55E', desc: '50kg+ CO₂ prevented' },
  'Impact Leader': { emoji: '⚡', color: '#3DD6F5', desc: 'Top 1% impact score' },
  'Community Hero': { emoji: '🏆', color: '#A855F7', desc: 'Helped 50+ people' },
  'Repair Hero': { emoji: '🔧', color: '#A855F7', desc: '10+ successful repairs' },
  'Connector': { emoji: '🔗', color: '#6C63FF', desc: 'Made 30+ connections' },
  'Lab Connector': { emoji: '🧪', color: '#3DD6F5', desc: 'Connected 20+ lab items' },
  'Space Maker': { emoji: '🏠', color: '#FF6B80', desc: 'Cleared space for others' },
  'Fixer': { emoji: '🛠️', color: '#A855F7', desc: 'Fixed 5+ items' },
  'Newcomer': { emoji: '👋', color: '#9A9892', desc: 'Recently joined' },
};

export default function ImpactScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('personal');

  return (
    <div className="screen-transition" style={{ paddingBottom: 100 }}>
      {/* ── HEADER (Profile) ── */}
      <div style={{
        background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-base) 100%)',
        padding: '24px 20px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {/* Top controls */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
          <button className="btn-icon" style={{ borderRadius: 'var(--radius-md)' }}>
            <Share2 size={16} strokeWidth={2} />
          </button>
          <button className="btn-icon" style={{ borderRadius: 'var(--radius-md)' }}>
            <Settings size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Avatar + identity */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: CURRENT_USER.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 900, color: '#fff',
              letterSpacing: '-0.02em',
            }}>
              {CURRENT_USER.initials}
            </div>
            {/* Online dot */}
            <div style={{
              position: 'absolute', bottom: 3, right: 3,
              width: 14, height: 14, borderRadius: '50%',
              background: '#22C55E', border: '2.5px solid var(--bg-base)',
            }} />
            {/* Rank badge */}
            <div style={{
              position: 'absolute', top: -4, right: -4,
              background: 'var(--accent-amber)', color: 'var(--text-on-accent)',
              fontSize: 9, fontWeight: 800, padding: '2px 5px',
              borderRadius: 'var(--radius-pill)',
              border: '2px solid var(--bg-base)',
            }}>
              #{PERSONAL_IMPACT.rank}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <h1 style={{
              margin: '0 0 2px', fontSize: 'var(--text-xl)', fontWeight: 800,
              letterSpacing: '-0.02em', color: 'var(--text-primary)',
            }}>
              {CURRENT_USER.name}
            </h1>
            <p style={{ margin: '0 0 4px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {CURRENT_USER.role} · {CURRENT_USER.community}
            </p>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Member for {CURRENT_USER.joinedDaysAgo} days
            </p>
          </div>
        </div>

        {/* Personal stats strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          borderTop: '1px solid var(--border-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
          margin: '0 -20px',
        }}>
          {[
            { value: CURRENT_USER.itemsShared, label: 'Shared' },
            { value: CURRENT_USER.itemsReceived, label: 'Received' },
            { value: CURRENT_USER.impactScore, label: 'Impact Pts' },
          ].map(({ value, label }, i) => (
            <div key={label} style={{
              textAlign: 'center', padding: '12px 8px',
              borderRight: i < 2 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <p style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                {value.toLocaleString()}
              </p>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', marginTop: 0 }}>
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
                padding: '12px 8px',
                fontSize: 'var(--text-xs)', fontWeight: 700,
                color: activeTab === tab.id ? 'var(--accent-lime)' : 'var(--text-muted)',
                borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent-lime)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      {activeTab === 'personal' && <PersonalImpactTab />}
      {activeTab === 'community' && <CommunityImpactTab />}
      {activeTab === 'inventory' && <InventoryTab />}
    </div>
  );
}

/* ══ PERSONAL IMPACT ════════════════════════════ */

function PersonalImpactTab() {
  return (
    <div style={{ padding: '16px' }}>
      {/* Rank card */}
      <div style={{
        background: 'linear-gradient(135deg, var(--accent-lime-surface), var(--bg-card))',
        border: '1.5px solid var(--accent-lime)30',
        borderRadius: 'var(--radius-xl)',
        padding: '16px',
        marginBottom: 16,
        display: 'flex', gap: 14, alignItems: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 'var(--radius-md)',
          background: 'var(--accent-lime)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Crown size={28} style={{ color: 'var(--text-on-accent)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 2px', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--accent-lime-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Your Rank
          </p>
          <p style={{ margin: '0 0 2px', fontSize: 'var(--text-2xl)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            #{PERSONAL_IMPACT.rank}
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Top {100 - PERSONAL_IMPACT.percentile}% of {PERSONAL_IMPACT.totalMembers.toLocaleString()} members
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <TrendingUp size={20} style={{ color: 'var(--accent-lime-dim)' }} />
        </div>
      </div>

      {/* Personal metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'CO₂ Saved', value: `${PERSONAL_IMPACT.co2Saved} kg`, icon: '🌿', color: 'var(--color-donate)', bg: 'rgba(34,197,94,0.08)' },
          { label: 'Items Moved', value: `${PERSONAL_IMPACT.itemsCirculated}`, icon: '♻️', color: 'var(--accent-cyan)', bg: 'rgba(61,214,245,0.08)' },
          { label: 'Saved', value: `₹${(PERSONAL_IMPACT.moneySaved / 1000).toFixed(1)}k`, icon: '💰', color: 'var(--accent-amber)', bg: 'rgba(255,154,64,0.08)' },
          { label: 'Repairs', value: `${PERSONAL_IMPACT.repairsHelped}`, icon: '🔧', color: 'var(--color-repair)', bg: 'rgba(168,85,247,0.08)' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} style={{
            background: bg, border: `1px solid ${color}20`,
            borderRadius: 'var(--radius-lg)', padding: '14px',
          }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
            <p style={{ margin: '0 0 2px', fontSize: 'var(--text-lg)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              {value}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Badges */}
      <div style={{ marginBottom: 16 }}>
        <div className="section-header" style={{ padding: 0, marginBottom: 12 }}>
          <span className="section-title" style={{ fontSize: 'var(--text-md)' }}>Your Badges</span>
          <Award size={16} style={{ color: 'var(--text-muted)' }} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CURRENT_USER.badges.map(badge => {
            const cfg = BADGE_CONFIG[badge];
            if (!cfg) return null;
            return (
              <div
                key={badge}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--bg-card)', border: '1.5px solid var(--border-default)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '6px 12px 6px 8px',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: `${cfg.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14,
                }}>
                  {cfg.emoji}
                </div>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {badge}
                </span>
              </div>
            );
          })}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'var(--bg-inset)', border: '1.5px dashed var(--border-default)',
            borderRadius: 'var(--radius-pill)', padding: '6px 12px',
            cursor: 'pointer',
          }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
              +{12 - CURRENT_USER.badges.length} to earn
            </span>
          </div>
        </div>
      </div>

      {/* Activity timeline */}
      <div>
        <div className="section-header" style={{ padding: 0, marginBottom: 12 }}>
          <span className="section-title" style={{ fontSize: 'var(--text-md)' }}>Recent Activity</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { action: 'Saved a community', detail: 'Sony WH-1000XM4 request fulfilled', time: '2h ago', icon: '🎧', color: 'var(--accent-cyan)' },
            { action: 'Item shared', detail: 'Posted IKEA chair to marketplace', time: '1d ago', icon: '🪑', color: 'var(--color-donate)' },
            { action: 'Borrowed', detail: 'Canon EOS 200D for the weekend', time: '3d ago', icon: '📷', color: 'var(--color-exchange)' },
            { action: 'Repair helped', detail: 'Fixed Priya\'s broken fan', time: '1w ago', icon: '🔧', color: 'var(--color-repair)' },
          ].map(({ action, detail, time, icon, color }, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '12px 0',
              borderBottom: i < 3 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                background: `${color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>
                {icon}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 1px', fontSize: 'var(--text-xs)', fontWeight: 700, color: color }}>
                  {action}
                </p>
                <p style={{ margin: '0 0 1px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {detail}
                </p>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>{time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══ COMMUNITY IMPACT ═══════════════════════════ */

function CommunityImpactTab() {
  return (
    <div style={{ padding: '16px' }}>
      {/* Community header */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-xl)',
        padding: '16px',
        marginBottom: 16,
        display: 'flex', gap: 12, alignItems: 'center',
      }}>
        <div style={{ fontSize: 36 }}>🏛️</div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 2px', fontSize: 'var(--text-md)', fontWeight: 800, color: 'var(--text-primary)' }}>
            BITS Pilani Goa
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            1,847 members · Active since 2023
          </p>
        </div>
        <div style={{
          background: 'var(--accent-lime-surface)', border: '1px solid var(--accent-lime)30',
          borderRadius: 'var(--radius-pill)', padding: '4px 10px',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-lime-dim)' }}>Campus</span>
        </div>
      </div>

      {/* Big metrics */}
      <div style={{ marginBottom: 16 }}>
        {IMPACT_METRICS.map(metric => (
          <CommunityMetricRow key={metric.label} metric={metric} />
        ))}
      </div>

      {/* Leaderboard */}
      <div>
        <div className="section-header" style={{ padding: 0, marginBottom: 12 }}>
          <span className="section-title" style={{ fontSize: 'var(--text-md)' }}>Leaderboard</span>
          <span className="section-action">This Month</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LEADERBOARD.slice(0, 6).map((user, i) => (
            <div
              key={user.id}
              className={`card ${user.id === CURRENT_USER.id ? '' : ''}`}
              style={{
                padding: '12px',
                display: 'flex', alignItems: 'center', gap: 12,
                border: user.id === CURRENT_USER.id ? '1.5px solid var(--accent-lime)40' : undefined,
                background: user.id === CURRENT_USER.id ? 'var(--accent-lime-surface)' : undefined,
              }}
            >
              {/* Rank */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: i < 3 ? ['var(--accent-lime)', 'var(--accent-cyan)', 'var(--accent-amber)'][i] : 'var(--bg-inset)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 900,
                color: i < 3 ? 'var(--text-on-accent)' : 'var(--text-muted)',
                flexShrink: 0,
              }}>
                {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
              </div>

              {/* Avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: user.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>
                {user.initials}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: '0 0 1px', fontSize: 'var(--text-sm)', fontWeight: 700,
                  color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {user.name.split(' ')[0]}
                  {user.id === CURRENT_USER.id && (
                    <span style={{ fontSize: 10, color: 'var(--accent-lime-dim)', fontWeight: 700 }}>· You</span>
                  )}
                </p>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                  {user.role}
                </p>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ margin: '0 0 1px', fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {user.impactScore.toLocaleString()}
                </p>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>pts</p>
              </div>
            </div>
          ))}
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
      padding: '12px 0',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ fontSize: 22, width: 36, textAlign: 'center' }}>
        {icons[metric.label] || '📊'}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 1px', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)' }}>
          {metric.label}
        </p>
        <p style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          {formatValue(metric.value, metric.label)}
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 4 }}>
            {metric.unit}
          </span>
        </p>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        background: 'rgba(34,197,94,0.12)', color: '#22C55E',
        fontSize: 11, fontWeight: 700, padding: '3px 8px',
        borderRadius: 'var(--radius-pill)',
      }}>
        <ArrowUpRight size={11} />
        +{metric.change}%
      </div>
    </div>
  );
}

/* ══ INVENTORY TAB ══════════════════════════════ */

function InventoryTab() {
  const STATUS_CONFIG = {
    available: { label: 'Available', color: 'var(--color-donate)', bg: 'rgba(34,197,94,0.12)' },
    borrowed: { label: 'Borrowed', color: 'var(--accent-amber)', bg: 'rgba(255,154,64,0.12)' },
    maintenance: { label: 'Maintenance', color: 'var(--accent-rose)', bg: 'rgba(255,107,128,0.12)' },
  };

  return (
    <div style={{ padding: '16px' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Available', value: INVENTORY_ITEMS.filter(i => i.status === 'available').length, color: 'var(--color-donate)' },
          { label: 'Borrowed', value: INVENTORY_ITEMS.filter(i => i.status === 'borrowed').length, color: 'var(--accent-amber)' },
          { label: 'Service', value: INVENTORY_ITEMS.filter(i => i.status === 'maintenance').length, color: 'var(--accent-rose)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', padding: '12px', textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 2px', fontSize: 'var(--text-xl)', fontWeight: 800, color }}>
              {value}
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {INVENTORY_ITEMS.map(item => {
          const sc = STATUS_CONFIG[item.status];
          return (
            <div
              key={item.id}
              className="card"
              style={{ padding: '12px', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 'var(--radius-md)',
                background: item.photoColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, flexShrink: 0,
              }}>
                {item.photoIcon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{
                    margin: '0 0 1px', fontSize: 'var(--text-sm)', fontWeight: 700,
                    color: 'var(--text-primary)', flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.title}
                  </p>
                  <span style={{
                    background: sc.bg, color: sc.color,
                    fontSize: 10, fontWeight: 700,
                    padding: '2px 7px', borderRadius: 'var(--radius-pill)', flexShrink: 0,
                  }}>
                    {sc.label}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {item.owner}
                  {item.borrowedBy && ` · Borrowed by ${item.borrowedBy}`}
                  {item.dueDate && ` · Due ${item.dueDate}`}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <BarChart3 size={10} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {item.totalBorrows}x borrowed
                  </span>
                </div>
              </div>

              {item.status === 'available' && (
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flexShrink: 0, padding: '6px 12px', fontSize: 11 }}
                >
                  Borrow
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add to inventory CTA */}
      <div style={{ marginTop: 16 }}>
        <div style={{
          background: 'var(--bg-card)', border: '1.5px dashed var(--border-default)',
          borderRadius: 'var(--radius-xl)', padding: '16px', textAlign: 'center', cursor: 'pointer',
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
            Add to Community Inventory
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Share resources your community can borrow
          </p>
          <button className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            <BarChart3 size={14} /> Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

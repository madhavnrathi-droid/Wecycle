'use client';

import { getActiveRoom } from '../lib/rooms';
import { useState } from 'react';
import {
  Settings, Share2, TrendingUp, Award, ArrowUpRight, Plus,
  Rocket, Gift, Leaf, Lightning, Trophy, Wrench, Link2, Flask, Home, Hammer, HandWaving,
  Recycle, PiggyBank, TrashSimple, Users, BarChart3, Headphones, Armchair, Camera,
  Building2, ProjectorScreen, Plug, ClipboardList, Guitar, Package,
  type LucideIcon,
} from '@/lib/icons';
import { useGlide } from '../lib/useGlide';
import {
  IMPACT_METRICS, PERSONAL_IMPACT, LEADERBOARD, INVENTORY_ITEMS,
  CURRENT_USER, type ImpactMetric,
} from '../lib/mockData';

type Tab = 'personal' | 'community' | 'inventory';

/* Each badge is named by a thin glyph. They used to be emoji on a tinted disc
   in the badge's own colour — eleven colours for eleven badges, none of them
   meaning anything the word beside it didn't already say. */
const BADGE_GLYPH: Record<string, LucideIcon> = {
  'Pioneer':        Rocket,
  'Top Sharer':     Gift,
  'Green Star':     Leaf,
  'Impact Leader':  Lightning,
  'Community Hero': Trophy,
  'Repair Hero':    Wrench,
  'Connector':      Link2,
  'Lab Connector':  Flask,
  'Space Maker':    Home,
  'Fixer':          Hammer,
  'Newcomer':       HandWaving,
};

/* Section heading: Title 3, the size the home rails use. */
const SECTION_TITLE: React.CSSProperties = {
  margin: 0, fontSize: 'calc(20px * var(--text-scale))', fontWeight: 600,
  letterSpacing: '-0.022em', lineHeight: 1.25, color: 'var(--text-primary)',
};

const HAIRLINE = '0.5px solid var(--hairline)';

export default function ImpactScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('personal');
  const tabsGlideRef = useGlide(activeTab);

  return (
    <div className="screen-transition" style={{ paddingBottom: 100, background: 'var(--bg-base)', minHeight: '100%' }}>

      {/* ── PROFILE ── */}
      <div style={{ position: 'relative' }}>

        {/* Top controls */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 4,
          padding: '12px 12px 0',
        }}>
          <button className="theme-toggle" aria-label="Share">
            <Share2 size={20} />
          </button>
          <button className="theme-toggle" aria-label="Settings">
            <Settings size={20} />
          </button>
        </div>

        {/* Profile block */}
        <div style={{ padding: '4px 20px 0' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 76, height: 76, borderRadius: '50%',
                background: CURRENT_USER.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'calc(26px * var(--text-scale))', fontWeight: 500, color: '#fff', letterSpacing: '-0.02em',
              }}>
                {CURRENT_USER.initials}
              </div>
              <div style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 14, height: 14, borderRadius: '50%',
                background: 'var(--brand)', border: '2.5px solid var(--bg-base)',
              }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="t-title1" style={{ margin: '0 0 4px', color: 'var(--text-primary)' }}>
                {CURRENT_USER.name}
              </h1>
              <p style={{ margin: 0, fontSize: 'calc(15px * var(--text-scale))', color: 'var(--text-secondary)', letterSpacing: '-0.015em' }}>
                {CURRENT_USER.role} · {CURRENT_USER.community}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)' }}>
                Member for {CURRENT_USER.joinedDaysAgo} days
              </p>
            </div>
          </div>

          {/* Inline stats — three light figures; spacing groups them */}
          <FigureRow items={[
            { value: CURRENT_USER.itemsShared.toLocaleString(), label: 'Shared' },
            { value: CURRENT_USER.itemsReceived.toLocaleString(), label: 'Received' },
            { value: CURRENT_USER.impactScore.toLocaleString(), label: 'Impact' },
          ]} />
        </div>

        {/* Tabs — the app's segmented control */}
        <div style={{ padding: '24px 16px 4px' }}>
          <div className="segmented" ref={tabsGlideRef}>
            {([
              { id: 'personal', label: 'My Impact' },
              { id: 'community', label: 'Community' },
              { id: 'inventory', label: 'Inventory' },
            ] as { id: Tab; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
                data-active={activeTab === tab.id || undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'personal' && <PersonalImpactTab />}
      {activeTab === 'community' && <CommunityImpactTab />}
      {activeTab === 'inventory' && <InventoryTab />}
    </div>
  );
}

/* A row of light figures over quiet words — Apple's widget register. */
function FigureRow({ items }: { items: { value: string | number; label: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 12 }}>
      {items.map(({ value, label }) => (
        <div key={label}>
          <p className="t-figure" style={{
            margin: '0 0 2px', fontSize: 'calc(28px * var(--text-scale))',
            color: 'var(--text-primary)', lineHeight: 1.1,
          }}>
            {value}
          </p>
          <p style={{ margin: 0, fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)' }}>
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

/* A glyph, a label, a figure — one line of a list. No tile behind the glyph. */
function MetricRow({ icon: Icon, label, value, unit, trend }: {
  icon: LucideIcon; label: string; value: string; unit?: string; trend?: number;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 20px',
      borderBottom: HAIRLINE,
    }}>
      <Icon size={26} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-primary)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-secondary)' }}>
          {label}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span className="t-figure" style={{
            fontSize: 'calc(26px * var(--text-scale))', color: 'var(--text-primary)', lineHeight: 1.15,
          }}>
            {value}
          </span>
          {unit && (
            <span style={{ fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)' }}>
              {unit}
            </span>
          )}
        </div>
      </div>
      {trend != null ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          color: 'var(--brand-ink)',
          fontSize: 'calc(13px * var(--text-scale))', fontWeight: 500, fontVariantNumeric: 'tabular-nums',
        }}>
          <ArrowUpRight size={14} />
          +{trend}%
        </span>
      ) : (
        <ArrowUpRight size={18} style={{ color: 'var(--text-muted)' }} />
      )}
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
      <div style={{ padding: '24px 20px 22px', borderBottom: HAIRLINE }}>
        <p className="t-label" style={{ margin: '0 0 6px' }}>
          Your rank
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
          <span className="t-figure" style={{
            fontSize: 'calc(56px * var(--text-scale))', letterSpacing: '-0.035em',
            color: 'var(--text-primary)', lineHeight: 1,
          }}>
            #{PERSONAL_IMPACT.rank}
          </span>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: 'var(--brand-ink)',
            fontSize: 'calc(13px * var(--text-scale))', fontWeight: 500,
          }}>
            <TrendingUp size={16} />
            +3 this week
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 'calc(15px * var(--text-scale))', color: 'var(--text-secondary)', letterSpacing: '-0.015em' }}>
          Top {100 - PERSONAL_IMPACT.percentile}% of {PERSONAL_IMPACT.totalMembers.toLocaleString()} members
        </p>
      </div>

      {/* Metrics — quiet rows */}
      <div>
        <MetricRow icon={Leaf} label="CO₂ saved" value={`${PERSONAL_IMPACT.co2Saved}`} unit="kg" />
        <MetricRow icon={Recycle} label="Items moved" value={`${PERSONAL_IMPACT.itemsCirculated}`} unit="items" />
        <MetricRow icon={PiggyBank} label="Money saved" value={`₹${(PERSONAL_IMPACT.moneySaved / 1000).toFixed(1)}k`} />
        <MetricRow icon={Wrench} label="Repairs" value={`${PERSONAL_IMPACT.repairsHelped}`} unit="fixed" />
      </div>

      {/* Badges */}
      <div style={{ padding: '32px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={SECTION_TITLE}>Badges</h2>
          <Award size={20} style={{ color: 'var(--text-muted)' }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CURRENT_USER.badges.map(badge => {
            const Glyph = BADGE_GLYPH[badge];
            if (!Glyph) return null;
            return (
              <div key={badge} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: 'var(--bg-inset)',
                borderRadius: 'var(--radius-pill)', padding: '7px 14px 7px 11px',
              }}>
                <Glyph size={18} aria-hidden="true" style={{ color: 'var(--text-primary)' }} />
                <span style={{ fontSize: 'calc(13px * var(--text-scale))', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.006em' }}>
                  {badge}
                </span>
              </div>
            );
          })}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '7px 6px', cursor: 'pointer',
          }}>
            <span style={{ fontSize: 'calc(13px * var(--text-scale))', color: 'var(--brand-ink)', fontWeight: 500 }}>
              +{12 - CURRENT_USER.badges.length} more
            </span>
          </div>
        </div>
      </div>

      {/* Activity */}
      <div style={{ padding: '32px 0 0' }}>
        <h2 style={{ ...SECTION_TITLE, margin: '0 20px 8px' }}>
          Recent activity
        </h2>
        {([
          { action: 'Request fulfilled', detail: 'Someone lent their Sony WH-1000XM4', time: '2h ago', icon: Headphones },
          { action: 'Item shared',       detail: 'Posted IKEA chair to marketplace',     time: '1d ago', icon: Armchair },
          { action: 'Borrowed',          detail: 'Canon EOS 200D for the weekend',        time: '3d ago', icon: Camera },
          { action: 'Repair helped',     detail: "Fixed Priya's broken fan",              time: '1w ago', icon: Wrench },
        ] as { action: string; detail: string; time: string; icon: LucideIcon }[]).map(({ action, detail, time, icon: Icon }, i) => (
          <div key={i} style={{
            display: 'flex', gap: 16, padding: '14px 20px',
            borderTop: i === 0 ? 'none' : HAIRLINE,
          }}>
            <Icon size={24} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-primary)', marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 'calc(15px * var(--text-scale))', color: 'var(--text-primary)', fontWeight: 500, letterSpacing: '-0.015em' }}>
                {action}
              </p>
              <p style={{ margin: '1px 0 0', fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-secondary)' }}>{detail}</p>
              <p style={{ margin: '3px 0 0', fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)' }}>{time}</p>
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

const COMMUNITY_GLYPH: Record<string, LucideIcon> = {
  'CO₂ Prevented': Leaf, 'Items Circulated': Recycle, 'Money Saved': PiggyBank,
  'Landfill Diverted': TrashSimple, 'Repairs Completed': Wrench, 'Active Members': Users,
};

function CommunityImpactTab() {
  return (
    <div>
      {/* Community — a glyph, a name, a line */}
      <div style={{
        padding: '20px 20px',
        display: 'flex', gap: 16, alignItems: 'center',
        borderBottom: HAIRLINE,
      }}>
        <Building2 size={32} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-primary)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 1px', fontSize: 'calc(17px * var(--text-scale))', fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
            {getActiveRoom().university === 'NMIMS' ? getActiveRoom().name : 'Manipal Academy of Higher Education'}
          </p>
          <p style={{ margin: 0, fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)' }}>
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
      <div style={{ padding: '32px 0 0' }}>
        <h2 style={{ ...SECTION_TITLE, margin: '0 20px 8px' }}>
          Leaderboard
        </h2>
        <div>
          {LEADERBOARD.slice(0, 6).map((user, i) => {
            const isMe = user.id === CURRENT_USER.id;
            return (
              <div
                key={user.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 20px',
                  borderTop: i === 0 ? 'none' : HAIRLINE,
                }}
              >
                {/* The rank is the number. Medals said 1-2-3 in three colours
                    of sticker; the figure says it in the type. */}
                <div className="t-figure" style={{
                  width: 26, textAlign: 'center', flexShrink: 0,
                  fontSize: `calc(${i < 3 ? 22 : 17}px * var(--text-scale))`,
                  fontWeight: i < 3 ? 400 : 300,
                  color: i < 3 ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
                  {i + 1}
                </div>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: user.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'calc(13px * var(--text-scale))', fontWeight: 500, color: '#fff',
                }}>
                  {user.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 'calc(15px * var(--text-scale))', fontWeight: 500, letterSpacing: '-0.015em', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {user.name.split(' ')[0]}
                    {isMe && <span style={{
                      fontSize: 'calc(13px * var(--text-scale))', color: 'var(--brand-ink)', fontWeight: 400,
                    }}>· you</span>}
                  </p>
                  <p style={{ margin: 0, fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)' }}>{user.role}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="t-figure" style={{
                    margin: 0, fontSize: 'calc(20px * var(--text-scale))', fontWeight: 400,
                    color: 'var(--text-primary)', lineHeight: 1,
                  }}>
                    {user.impactScore.toLocaleString()}
                  </p>
                  <p className="t-label" style={{ margin: '3px 0 0', fontSize: 'calc(10px * var(--text-scale))', color: 'var(--text-muted)' }}>pts</p>
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
  const formatValue = (v: number, label: string) => {
    if (label === 'Money Saved') return `₹${(v / 1000).toFixed(0)}k`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return v.toLocaleString();
  };
  return (
    <MetricRow
      icon={COMMUNITY_GLYPH[metric.label] ?? BarChart3}
      label={metric.label}
      value={formatValue(metric.value, metric.label)}
      unit={metric.unit === '₹' ? undefined : metric.unit}
      trend={metric.change}
    />
  );
}

/* ══════════════════════════════════════════════════
   INVENTORY
══════════════════════════════════════════════════ */

/* The shared kit, drawn by what it is. The mock data's emoji "photos" sat on
   dark tiles in the item's colour; a thin glyph on the control fill reads as
   "no photo yet" instead of as clip-art. */
const INVENTORY_GLYPH: Record<string, LucideIcon> = {
  Camera, AV: ProjectorScreen, Electrical: Plug, Tools: Wrench,
  Stationery: ClipboardList, Music: Guitar,
};

function InventoryTab() {
  const STATUS_CONFIG = {
    available:   { label: 'Available', color: 'var(--brand-ink)' },
    borrowed:    { label: 'Borrowed',  color: 'var(--accent-amber-ink)' },
    maintenance: { label: 'Service',   color: 'var(--accent-rose-ink)' },
  };

  const counts = {
    available: INVENTORY_ITEMS.filter(i => i.status === 'available').length,
    borrowed:  INVENTORY_ITEMS.filter(i => i.status === 'borrowed').length,
    maint:     INVENTORY_ITEMS.filter(i => i.status === 'maintenance').length,
  };

  return (
    <div>
      {/* Status summary */}
      <div style={{ padding: '24px 20px', borderBottom: HAIRLINE }}>
        <FigureRow items={[
          { value: counts.available, label: 'Available' },
          { value: counts.borrowed,  label: 'Borrowed' },
          { value: counts.maint,     label: 'Service' },
        ]} />
      </div>

      {/* List */}
      <div>
        {INVENTORY_ITEMS.map(item => {
          const sc = STATUS_CONFIG[item.status];
          const Glyph = INVENTORY_GLYPH[item.category] ?? Package;
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
              borderBottom: HAIRLINE, cursor: 'pointer',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 12,
                background: 'var(--bg-inset)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)', flexShrink: 0,
              }}>
                <Glyph size={24} aria-hidden="true" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <p style={{
                    margin: 0, fontSize: 'calc(15px * var(--text-scale))', fontWeight: 500, letterSpacing: '-0.015em',
                    color: 'var(--text-primary)', flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.title}
                  </p>
                </div>
                <p style={{ margin: 0, fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)' }}>
                  <span style={{ color: sc.color }}>{sc.label}</span>
                  {' · '}{item.owner}
                  {item.borrowedBy && ` · ${item.borrowedBy}`}
                  {item.dueDate && ` · due ${item.dueDate}`}
                </p>
              </div>
              {item.status === 'available' && (
                <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
                  Borrow
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add to inventory — a soft fill, not a dashed frame */}
      <div style={{ padding: '24px 20px' }}>
        <div style={{
          background: 'var(--bg-inset)', borderRadius: 18,
          padding: '20px', textAlign: 'center', cursor: 'pointer',
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 'calc(17px * var(--text-scale))', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
            Add to community inventory
          </p>
          <p style={{ margin: '0 0 14px', fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-muted)' }}>
            Share resources your community can borrow
          </p>
          <button style={{
            background: '#FFFFFF', border: 'none',
            borderRadius: 999, padding: '9px 16px',
            fontSize: 'calc(15px * var(--text-scale))', fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--text-primary)',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Plus size={16} /> Add item
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

/* ── Registration-form BUILDER (Google-Forms-style) ────────────────────────
 * Used by FormBuilderScreen (the dedicated full-page builder). Pure
 * controlled component: renders `fields`, emits every mutation via
 * `onChange`.
 *
 * Visual language: soft white pills on the cream base — no bordered boxes,
 * ghost icon buttons, tonal inputs, hairline separation. Reordering uses
 * up/down arrows (reliable on touch; matches the app's no-drag convention).
 */

import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus, X } from 'lucide-react';
import {
  FIELD_TYPE_META, FIELD_TYPE_ORDER, newField,
  type FormField, type FormFieldType,
} from '../../lib/eventForms';
import { haptics } from '../../lib/haptics';

/* Soft elevation used by every floating pill in the builder. */
const PILL_SHADOW = '0 1px 2px rgba(28,28,26,0.04), 0 6px 20px rgba(28,28,26,0.06)';

interface FormBuilderProps {
  fields: FormField[];
  onChange: (next: FormField[]) => void;
}

export default function FormBuilder({ fields, onChange }: FormBuilderProps) {
  const [paletteOpen, setPaletteOpen] = useState(fields.length === 0);

  const patch = (id: string, p: Partial<FormField>) =>
    onChange(fields.map(f => (f.id === id ? { ...f, ...p } : f)));

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[idx], next[j]] = [next[j], next[idx]];
    haptics.selection();
    onChange(next);
  };

  const remove = (id: string) => {
    haptics.selection();
    onChange(fields.filter(f => f.id !== id));
  };

  const add = (type: FormFieldType) => {
    haptics.selection();
    onChange([...fields, newField(type)]);
    setPaletteOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fields.map((f, idx) => (
        <FieldCard
          key={f.id}
          field={f}
          index={idx}
          count={fields.length}
          onPatch={p => patch(f.id, p)}
          onMoveUp={() => move(idx, -1)}
          onMoveDown={() => move(idx, 1)}
          onRemove={() => remove(f.id)}
        />
      ))}

      {/* ── Add-question palette — soft pill sheet, no dashed frame ── */}
      {paletteOpen ? (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 20, padding: '14px 14px 12px',
          boxShadow: PILL_SHADOW,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
            }}>
              Add a question
            </span>
            {fields.length > 0 && (
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                aria-label="Close question palette"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'inline-flex' }}
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {FIELD_TYPE_ORDER.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => add(t)}
                className="press-scale"
                title={FIELD_TYPE_META[t].hint}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '9px 14px',
                  background: 'var(--bg-inset)',
                  border: 'none', borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 13 }}>{FIELD_TYPE_META[t].icon}</span>
                {FIELD_TYPE_META[t].label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="press-scale"
          style={{
            alignSelf: 'center',
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '11px 20px',
            background: 'var(--bg-card)',
            border: 'none', borderRadius: 999,
            boxShadow: PILL_SHADOW,
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)', fontFamily: 'inherit',
          }}
        >
          <Plus size={15} strokeWidth={2.2} /> Add question
        </button>
      )}
    </div>
  );
}

/* ── One editable question — a floating white pill ── */

function FieldCard({
  field, index, count, onPatch, onMoveUp, onMoveDown, onRemove,
}: {
  field: FormField;
  index: number;
  count: number;
  onPatch: (p: Partial<FormField>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const meta = FIELD_TYPE_META[field.type];
  const options = field.options ?? [];

  /* Tonal, borderless input used throughout the card. */
  const tonalInput: React.CSSProperties = {
    border: 'none',
    background: 'var(--bg-inset)',
    borderRadius: 12,
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 20,
      padding: '14px 16px 14px',
      boxShadow: PILL_SHADOW,
    }}>
      {/* Row 1: quiet type label + ghost controls, split by a hairline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}>
          <span aria-hidden="true" style={{ fontSize: 12 }}>{meta.icon}</span> {meta.label}
        </span>
        <span style={{ flex: 1 }} />
        <GhostBtn label={`Move question ${index + 1} up`} disabled={index === 0} onClick={onMoveUp}>
          <ChevronUp size={15} strokeWidth={2} />
        </GhostBtn>
        <GhostBtn label={`Move question ${index + 1} down`} disabled={index === count - 1} onClick={onMoveDown}>
          <ChevronDown size={15} strokeWidth={2} />
        </GhostBtn>
        <span aria-hidden="true" style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />
        <GhostBtn label={`Delete question ${index + 1}`} onClick={onRemove} danger>
          <Trash2 size={14} strokeWidth={2} />
        </GhostBtn>
      </div>

      {/* Row 2: the question label */}
      <input
        className="form-input"
        style={{ ...tonalInput, marginBottom: meta.hasOptions ? 8 : 0 }}
        placeholder={
          field.type === 'file' ? 'e.g. Upload your ID card / poster (PDF or image)'
          : meta.hasOptions ? 'e.g. Which slot works for you?'
          : `Question label — ${meta.hint.toLowerCase()}`
        }
        value={field.label}
        onChange={e => onPatch({ label: e.target.value })}
        aria-label={`Question ${index + 1} label`}
      />

      {/* Row 3: options (choice types only) */}
      {meta.hasOptions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((opt, oi) => (
            <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: 12, width: 18, textAlign: 'center', flexShrink: 0 }}>
                {field.type === 'checkboxes' ? '☐' : field.type === 'dropdown' ? `${oi + 1}.` : '○'}
              </span>
              <input
                className="form-input"
                style={{ ...tonalInput, flex: 1 }}
                value={opt}
                placeholder={`Option ${oi + 1}`}
                onChange={e => {
                  const next = [...options];
                  next[oi] = e.target.value;
                  onPatch({ options: next });
                }}
                aria-label={`Question ${index + 1} option ${oi + 1}`}
              />
              <GhostBtn
                label={`Remove option ${oi + 1}`}
                disabled={options.length <= 1}
                onClick={() => onPatch({ options: options.filter((_, i) => i !== oi) })}
              >
                <X size={13} strokeWidth={2} />
              </GhostBtn>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onPatch({ options: [...options, ''] })}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', padding: '4px 2px 0 24px',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: 'var(--text-secondary)', fontFamily: 'inherit',
            }}
          >
            <Plus size={12} strokeWidth={2.2} /> Add option
          </button>
        </div>
      )}

      {/* Row 4: required — quiet pill switch. The checkbox overlays the whole
          switch (full-size, focusable, AT-visible); the focus ring draws on
          the track via .pill-switch CSS. */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 12, cursor: 'pointer', userSelect: 'none',
        fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)',
      }}>
        <span className="pill-switch" style={{ width: 34, height: 20 }}>
          <input
            type="checkbox"
            checked={field.required}
            onChange={e => onPatch({ required: e.target.checked })}
            aria-label={`Question ${index + 1} required`}
          />
          <span className="pill-switch-track" aria-hidden="true" style={{
            position: 'absolute', inset: 0, borderRadius: 999,
            background: field.required ? 'var(--text-primary)' : 'var(--bg-inset)',
            transition: 'background 180ms',
            pointerEvents: 'none',
          }} />
          <span aria-hidden="true" style={{
            position: 'absolute', top: 3, left: field.required ? 17 : 3,
            width: 14, height: 14, borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            transition: 'left 180ms cubic-bezier(.2,.8,.2,1)',
            pointerEvents: 'none',
          }} />
        </span>
        Required
      </label>
    </div>
  );
}

/* Ghost icon button — no box, just the glyph with a hover-friendly hit area. */
function GhostBtn({
  children, label, onClick, disabled, danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30,
        background: 'transparent', border: 'none',
        borderRadius: 999, cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--border-strong)' : danger ? 'var(--accent-rose)' : 'var(--text-muted)',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

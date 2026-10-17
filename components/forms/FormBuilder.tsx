'use client';

/* ── Registration-form BUILDER (Google-Forms-style) ────────────────────────
 * Used by FormBuilderScreen (the dedicated full-page builder). Pure
 * controlled component: renders `fields`, emits every mutation via
 * `onChange`.
 *
 * Visual language: the Light system — a question is its words and its
 * fields, separated from the next by space and one hairline, not a floating
 * card. Fields are soft fills, icon buttons are ghosts, and each type is
 * named by a thin glyph (FieldTypeGlyph), not an emoji. Reordering uses
 * up/down arrows (reliable on touch; matches the app's no-drag convention).
 */

import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus, X, CheckSquare, RadioButton } from '@/lib/icons';
import {
  FIELD_TYPE_META, FIELD_TYPE_ORDER, newField,
  type FormField, type FormFieldType,
} from '../../lib/eventForms';
import { haptics } from '../../lib/haptics';
import FieldTypeGlyph from './FieldTypeGlyph';

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
    <div style={{ display: 'flex', flexDirection: 'column' }}>
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

      {/* ── Add-question palette — a label and a wrap of soft chips ── */}
      {paletteOpen ? (
        <div style={{
          padding: fields.length ? '18px 0 4px' : '4px 0',
          borderTop: fields.length ? '0.5px solid var(--hairline)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="t-label">
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
                  padding: '9px 14px 9px 12px',
                  background: 'var(--bg-inset)',
                  border: 'none', borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 'calc(13px * var(--text-scale))', fontWeight: 500, color: 'var(--text-primary)',
                  letterSpacing: '-0.006em', fontFamily: 'inherit',
                }}
              >
                <FieldTypeGlyph type={t} size={16} />
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
            alignSelf: 'center', marginTop: 18,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '11px 20px',
            background: 'var(--bg-inset)',
            border: 'none', borderRadius: 999,
            cursor: 'pointer', fontSize: 'calc(15px * var(--text-scale))', fontWeight: 600,
            letterSpacing: '-0.015em', color: 'var(--text-primary)', fontFamily: 'inherit',
          }}
        >
          <Plus size={16} /> Add question
        </button>
      )}
    </div>
  );
}

/* ── One editable question — words and fields, a hairline above ── */

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
      padding: index === 0 ? '2px 0 18px' : '16px 0 18px',
      borderTop: index === 0 ? 'none' : '0.5px solid var(--hairline)',
    }}>
      {/* Row 1: the type in the mono voice + ghost controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <span className="t-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FieldTypeGlyph type={field.type} size={14} /> {meta.label}
        </span>
        <span style={{ flex: 1 }} />
        <GhostBtn label={`Move question ${index + 1} up`} disabled={index === 0} onClick={onMoveUp}>
          <ChevronUp size={16} />
        </GhostBtn>
        <GhostBtn label={`Move question ${index + 1} down`} disabled={index === count - 1} onClick={onMoveDown}>
          <ChevronDown size={16} />
        </GhostBtn>
        <GhostBtn label={`Delete question ${index + 1}`} onClick={onRemove} danger>
          <Trash2 size={16} />
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
              <span aria-hidden="true" style={{
                color: 'var(--text-muted)', fontSize: 'calc(12px * var(--text-scale))', width: 18, flexShrink: 0,
                display: 'inline-flex', justifyContent: 'center', fontVariantNumeric: 'tabular-nums',
              }}>
                {field.type === 'checkboxes' ? <CheckSquare size={16} />
                  : field.type === 'dropdown' ? `${oi + 1}.`
                  : <RadioButton size={16} />}
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
                <X size={14} />
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
              cursor: 'pointer', fontSize: 'calc(13px * var(--text-scale))', fontWeight: 500,
              color: 'var(--brand-ink)', fontFamily: 'inherit',
            }}
          >
            <Plus size={13} /> Add option
          </button>
        </div>
      )}

      {/* Row 4: required — quiet pill switch. The checkbox overlays the whole
          switch (full-size, focusable, AT-visible); the focus ring draws on
          the track via .pill-switch CSS. */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 12, cursor: 'pointer', userSelect: 'none',
        fontSize: 'calc(13px * var(--text-scale))', fontWeight: 400, color: 'var(--text-secondary)',
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
            background: field.required ? 'var(--ink)' : 'var(--border-default)',
            transition: 'background-color var(--dur-2) var(--ease-standard)',
            pointerEvents: 'none',
          }} />
          <span aria-hidden="true" style={{
            position: 'absolute', top: 3, left: field.required ? 17 : 3,
            width: 14, height: 14, borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            transition: 'left var(--dur-2) var(--ease-standard)',
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
        color: disabled ? 'var(--border-strong)' : danger ? 'var(--accent-rose-ink)' : 'var(--text-secondary)',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

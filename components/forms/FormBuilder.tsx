'use client';

/* ── Registration-form BUILDER (Google-Forms-style) ────────────────────────
 * Used inline in SubmitEventModal (create) and in the owner's "Registration
 * form" manager on EventDetailScreen (edit). Pure controlled component:
 * renders `fields`, emits every mutation through `onChange`.
 *
 * Deliberately no drag-and-drop — up/down arrows are reliable on touch and
 * keyboards alike, and match the app's no-dnd convention.
 */

import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus, X } from 'lucide-react';
import {
  FIELD_TYPE_META, FIELD_TYPE_ORDER, newField,
  type FormField, type FormFieldType,
} from '../../lib/eventForms';
import { haptics } from '../../lib/haptics';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

      {/* ── Add-question palette ── */}
      {paletteOpen ? (
        <div style={{
          border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-lg)', padding: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="field-label" style={{ margin: 0 }}>Add a question</span>
            {fields.length > 0 && (
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                aria-label="Close question palette"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 6 }}>
            {FIELD_TYPE_ORDER.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => add(t)}
                className="press-scale"
                title={FIELD_TYPE_META[t].hint}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '9px 10px',
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', textAlign: 'left',
                  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{FIELD_TYPE_META[t].icon}</span>
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
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 12px',
            background: 'var(--bg-inset)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)', fontFamily: 'inherit',
          }}
        >
          <Plus size={14} strokeWidth={2.2} /> Add question
        </button>
      )}
    </div>
  );
}

/* ── One editable question card ───────────────────── */

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

  return (
    <div style={{
      background: 'var(--bg-inset)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 12,
    }}>
      {/* Row 1: type chip + reorder/delete controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          padding: '3px 8px', borderRadius: 999,
        }}>
          <span aria-hidden="true">{meta.icon}</span> {meta.label}
        </span>
        <span style={{ flex: 1 }} />
        <IconBtn label={`Move question ${index + 1} up`} disabled={index === 0} onClick={onMoveUp}>
          <ChevronUp size={14} strokeWidth={2} />
        </IconBtn>
        <IconBtn label={`Move question ${index + 1} down`} disabled={index === count - 1} onClick={onMoveDown}>
          <ChevronDown size={14} strokeWidth={2} />
        </IconBtn>
        <IconBtn label={`Delete question ${index + 1}`} onClick={onRemove} danger>
          <Trash2 size={13} strokeWidth={2} />
        </IconBtn>
      </div>

      {/* Row 2: the question label */}
      <input
        className="form-input"
        placeholder={
          field.type === 'file' ? 'e.g. Upload your ID card / poster (PDF or image)'
          : meta.hasOptions ? 'e.g. Which slot works for you?'
          : `Question label — ${meta.hint.toLowerCase()}`
        }
        value={field.label}
        onChange={e => onPatch({ label: e.target.value })}
        aria-label={`Question ${index + 1} label`}
        style={{ marginBottom: meta.hasOptions ? 8 : 0 }}
      />

      {/* Row 3: options (choice types only) */}
      {meta.hasOptions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((opt, oi) => (
            <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: 12, width: 16, textAlign: 'center' }}>
                {field.type === 'checkboxes' ? '☐' : field.type === 'dropdown' ? `${oi + 1}.` : '○'}
              </span>
              <input
                className="form-input"
                style={{ flex: 1 }}
                value={opt}
                placeholder={`Option ${oi + 1}`}
                onChange={e => {
                  const next = [...options];
                  next[oi] = e.target.value;
                  onPatch({ options: next });
                }}
                aria-label={`Question ${index + 1} option ${oi + 1}`}
              />
              <IconBtn
                label={`Remove option ${oi + 1}`}
                disabled={options.length <= 1}
                onClick={() => onPatch({ options: options.filter((_, i) => i !== oi) })}
              >
                <X size={13} strokeWidth={2} />
              </IconBtn>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onPatch({ options: [...options, ''] })}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', padding: '4px 2px',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: 'var(--text-secondary)', fontFamily: 'inherit',
            }}
          >
            <Plus size={12} strokeWidth={2.2} /> Add option
          </button>
        </div>
      )}

      {/* Row 4: required toggle */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 10, cursor: 'pointer', userSelect: 'none',
        fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)',
      }}>
        <input
          type="checkbox"
          checked={field.required}
          onChange={e => onPatch({ required: e.target.checked })}
          style={{ width: 15, height: 15, accentColor: 'var(--text-primary)' }}
        />
        Required
      </label>
    </div>
  );
}

function IconBtn({
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
        width: 28, height: 28,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--border-strong)' : danger ? 'var(--accent-rose)' : 'var(--text-secondary)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

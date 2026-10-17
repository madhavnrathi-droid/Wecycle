'use client';

/* The glyph for a registration-form question type.
 *
 * FIELD_TYPE_META (lib/eventForms.ts) still carries the emoji each type was
 * written with; it is data, read by tests and exports. Every screen that
 * draws a type — the builder's palette, a question's header, the insights
 * summary — draws this thin glyph instead, so the forms speak in the same
 * line weight as the rest of the app. */

import {
  TextT, TextAlignLeft, RadioButton, CheckSquare, CaretCircleDown, IdCard,
  Mail, Phone, Hash, Paperclip, type LucideIcon, type IconComponentProps,
} from '@/lib/icons';
import type { FormFieldType } from '../../lib/eventForms';

const GLYPH: Record<FormFieldType, LucideIcon> = {
  short_text: TextT,
  long_text: TextAlignLeft,
  mcq: RadioButton,
  checkboxes: CheckSquare,
  dropdown: CaretCircleDown,
  name: IdCard,
  email: Mail,
  phone: Phone,
  number: Hash,
  file: Paperclip,
};

export default function FieldTypeGlyph({ type, size = 16, ...rest }: { type: FormFieldType } & IconComponentProps) {
  const G = GLYPH[type];
  return <G size={size} aria-hidden="true" {...rest} />;
}

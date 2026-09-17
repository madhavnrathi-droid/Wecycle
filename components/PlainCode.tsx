'use client';

/* ── A discount code, shown outright ───────────────────────────────────────
 *
 * The revealed state of ScratchCode without the foil: same .scratch classes, so
 * it reads as the same object, and the same Copy button beside it. Used during
 * the outage, when the members' 25% code is shown to everyone and there is
 * nothing to earn by scratching — the brief was to just show it.
 *
 * The copy falls back to selecting the text rather than pretending, same as
 * ScratchCode: a clipboard can be refused in an insecure context or by a
 * permission prompt, and "Copied" over a clipboard that holds nothing is the
 * worst answer available.
 */

import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { haptics } from '../lib/haptics';

export interface PlainCodeProps {
  code: string;
  label: string;
  onCopy?: () => void;
}

export default function PlainCode({ code, label, onCopy }: PlainCodeProps) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      haptics.success();
      onCopy?.();
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = codeRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <div className="scratch-row">
      <div className="scratch" data-revealed>
        <div ref={codeRef} className="scratch-code">
          <span className="scratch-label">{label}</span>
          <span className="scratch-value">{code}</span>
        </div>
      </div>
      <button type="button" className="scratch-btn" onClick={copy}
        aria-label={`Copy discount code ${code}`}>
        {copied ? <Check size={15} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}

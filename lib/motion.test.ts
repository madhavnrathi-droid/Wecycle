import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DUR, EASE } from './motion';

/* The motion system only stays a system if nothing picks its own number.
   These two checks are what stop it drifting back to fifteen durations. */

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

/* Ambient loops keep their own long periods on purpose — they are atmosphere,
   not responses (see the note on the tokens in globals.css). */
const AMBIENT = /\b(shimmer|ticker-scroll|mb-drift\d|mb-twinkle|mb-illu-float|spin|spin-loader|pulse-dot|pulse-glow|lost-scroll|dm-shimmer)\b|infinite/;

test('no transition or one-shot animation hard-codes a response duration', () => {
  const offenders: string[] = [];
  const decl = /(?<![\w-])((?:-webkit-)?(?:transition|animation)(?:-duration)?)\s*:\s*([^;{}]+);/g;
  for (const m of css.matchAll(decl)) {
    const value = m[2];
    for (const item of value.split(/,(?![^(]*\))/)) {
      if (AMBIENT.test(item)) continue;
      /* Duration already a token: any literal left in the item is its delay. */
      if (/var\(--dur-/.test(item)) continue;
      /* The first time in an item is its duration; a second is a delay. */
      const t = /(?<![\w.-])(\d*\.?\d+)(ms|s)(?![\w-])/.exec(item.replace(/\([^)]*\)/g, ''));
      if (!t) continue;
      const ms = parseFloat(t[1]) * (t[2] === 's' ? 1000 : 1);
      if (ms > 0 && ms <= 800) offenders.push(`${m[1]}: ${item.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], 'use var(--dur-1…5) instead of a literal duration');
});

test('the JS tokens are the CSS tokens', () => {
  for (const [k, ms] of Object.entries(DUR)) {
    assert.match(css, new RegExp(`--dur-${k}:\\s*${ms}ms;`), `--dur-${k}`);
  }
  const ease = (name: string) => (css.match(new RegExp(`--ease-${name}:\\s*([^;]+);`)) ?? [])[1]?.replace(/\s+/g, '');
  assert.equal(ease('standard'), EASE.standard.replace(/\s+/g, ''));
  assert.equal(ease('enter'), EASE.enter.replace(/\s+/g, ''));
  assert.equal(ease('exit'), EASE.exit.replace(/\s+/g, ''));
});

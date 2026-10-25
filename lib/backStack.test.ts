import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addBackLayer, goBack, installBackStack, __backStackForTests } from './backStack';

/* A browser history small enough to reason about: entries, an index, and a
   popstate that arrives a task later, as it does in a real browser. */
function fakeBrowser(startUrl = '/') {
  const entries: { state: unknown; url: string }[] = [{ state: null, url: startUrl }];
  let index = 0;
  const listeners: ((e: unknown) => void)[] = [];
  const here = () => new URL(entries[index].url, 'http://localhost');
  const history = {
    get state() { return entries[index].state; },
    pushState(state: unknown, _t: string, url?: string) {
      entries.splice(index + 1);
      entries.push({ state: structuredClone(state), url: url ?? entries[index].url });
      index++;
    },
    replaceState(state: unknown, _t: string, url?: string) {
      entries[index] = { state: structuredClone(state), url: url ?? entries[index].url };
    },
    go(n: number) {
      setTimeout(() => {
        const next = Math.max(0, Math.min(entries.length - 1, index + n));
        if (next === index) return;
        index = next;
        const ev = { state: entries[index].state, stopImmediatePropagation() {} };
        listeners.forEach(l => l(ev));
      }, 0);
    },
    back() { history.go(-1); },
  };
  (globalThis as { window?: unknown }).window = {
    history,
    location: {
      get pathname() { return here().pathname; },
      get search() { return here().search; },
      get hash() { return here().hash; },
    },
    addEventListener: (type: string, fn: (e: unknown) => void) => { if (type === 'popstate') listeners.push(fn); },
  };
  return {
    urls: () => entries.map(e => e.url),
    url: () => entries[index].url,
    get index() { return index; },
    back: () => history.back(),
    go: (n: number) => history.go(n),
  };
}

/* Let every queued popstate and reconcile run. */
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); };

let browser: ReturnType<typeof fakeBrowser>;
beforeEach(async () => {
  await settle();
  __backStackForTests.reset();
  browser = fakeBrowser('/?demo=1');
  installBackStack();
});

/** A layer that closes the way the app's screens do: by taking itself off. */
function screen(url?: string, log?: string[], name = url ?? '?') {
  let remove = () => {};
  const close = () => { log?.push(name); remove(); };
  remove = addBackLayer(close, () => url);
  return { close, remove };
}

test('each open screen is one history entry, and the address bar names the top one', async () => {
  screen('/?p=m1');
  screen('/?u=u2');
  await settle();
  assert.deepEqual(browser.urls(), ['/?demo=1', '/?p=m1', '/?u=u2']);
  assert.equal(browser.index, 2);
});

test('the browser\'s back closes only the top screen', async () => {
  const log: string[] = [];
  screen('/?p=m1', log);
  screen('/?u=u2', log);
  await settle();
  browser.back();
  await settle();
  assert.deepEqual(log, ['/?u=u2']);
  assert.equal(__backStackForTests.layers.length, 1);
  assert.equal(browser.url(), '/?p=m1');
});

test('closing a screen from its own button takes its entry back off, and nothing else closes', async () => {
  const log: string[] = [];
  screen('/?p=m1', log);
  const profile = screen('/?u=u2', log);
  await settle();
  profile.remove();
  await settle();
  assert.deepEqual(log, [], 'the post underneath must not be closed by our own history.go');
  assert.equal(__backStackForTests.layers.length, 1);
  assert.equal(browser.index, 1);
  assert.equal(browser.url(), '/?p=m1');
});

test('a screen that refuses to close (unsaved changes) keeps its entry, so the next back asks again', async () => {
  screen('/?p=m1');
  addBackLayer(() => { /* "Discard your changes?" — stays open */ }, () => '/?edit=1');
  await settle();
  browser.back();
  await settle();
  assert.equal(__backStackForTests.layers.length, 2);
  assert.equal(browser.index, 2);
  assert.equal(browser.url(), '/?edit=1');
});

test('closing one screen and opening another in the same moment is a replace, not back-then-push', async () => {
  const drawer = screen('/?demo=1');
  await settle();
  drawer.remove();
  screen('/?s=settings');
  await settle();
  assert.deepEqual(browser.urls(), ['/?demo=1', '/?s=settings']);
  assert.equal(browser.index, 1);
});

test('going back two steps at once (the long-press history menu) closes both, top first', async () => {
  const log: string[] = [];
  screen('/?tab=events', log);
  screen('/?p=e2', log);
  screen('/?r=e2', log);
  await settle();
  browser.go(-2);
  await settle();
  assert.deepEqual(log, ['/?r=e2', '/?p=e2']);
  assert.equal(__backStackForTests.layers.length, 1);
  assert.equal(browser.url(), '/?tab=events');
});

test('a layer without a URL keeps the one below it in the address bar', async () => {
  screen('/?p=m1');
  addBackLayer(() => {}, () => null); /* a sheet over the post */
  await settle();
  assert.deepEqual(browser.urls(), ['/?demo=1', '/?p=m1', '/?p=m1']);
});

test('goBack reports false at the root, so Android can background the app', async () => {
  assert.equal(goBack(), false);
  const log: string[] = [];
  screen('/?p=m1', log);
  await settle();
  assert.equal(goBack(), true);
  await settle();
  assert.deepEqual(log, ['/?p=m1']);
  assert.equal(browser.index, 0);
});

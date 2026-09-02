import type { Metadata } from 'next';
import BackToApp from '../../components/BackToApp';

/* Server-rendered mission page — same self-contained styling as
 * /privacy and /terms so it reads cleanly regardless of the app's
 * theme state and Google's review bot can fetch it directly. */

export const metadata: Metadata = {
  title: 'Our mission — Wecycle',
  description:
    'Wecycle exists to circulate what already exists. Less buying, more sharing — on campus, between neighbours.',
  robots: { index: true, follow: true },
};

const UPDATED = 'June 12, 2026';
const CONTACT = 'wecycle.page@gmail.com';

export default function MissionPage() {
  return (
    <main style={page}>
      <div style={wrap}>
        <BackToApp />
        <h1 style={h1}>Our mission</h1>
        <p style={meta}>Last updated: {UPDATED}</p>

        <p style={lede}>
          Most things on a college campus get used a few times and then sit in
          a corner. A coffee maker. A spare keyboard. A pair of shoes that
          almost fit. A drill someone borrowed once, in 2023. Wecycle exists
          to put those things back in motion.
        </p>

        <h2 style={h2}>What we believe</h2>
        <p style={p}>
          <strong>The cheapest, kindest, most planet-friendly version of
          anything is the one that already exists in someone else&rsquo;s
          drawer.</strong> A working chair, a half-used roll of tape, a
          textbook that opened twice — they have value the moment someone in
          the same building needs them. Distance is the only thing standing
          between an idle object and a useful one.
        </p>
        <p style={p}>
          Wecycle&rsquo;s job is to make that distance disappear. A photo, a
          name, a price (or free), and a neighbour who finds it in minutes.
          No drop-shipped boxes. No new plastic. No landfill at the end.
        </p>

        <h2 style={h2}>Three things we&rsquo;re building toward</h2>
        <ul style={ul}>
          <li style={li}>
            <strong>The first reflex when you need something is to ask.</strong>{' '}
            Before opening Amazon, before opening the wallet — open Wecycle and
            see who already has one. Requests get answered in hours, not days,
            because the community is small enough to care.
          </li>
          <li style={li}>
            <strong>Nothing on campus ends up in a bin without a second
            chance.</strong> Graduating? Moving rooms? Cleaning out? One photo
            and the right person picks it up. Free, sold, lent, or swapped —
            whatever moves it on.
          </li>
          <li style={li}>
            <strong>Helping a neighbour is the easiest thing in the app.</strong>{' '}
            Lost a wallet? Found a keyring? A second board next to the
            marketplace, verified by the same community, makes returning what
            you found as quick as posting what you lost.
          </li>
        </ul>

        <h2 style={h2}>Why we started this</h2>
        <p style={p}>
          We watched a hostel block move out at the end of a semester. The
          dumpster outside filled within an hour — fans, kettles, lamps,
          textbooks, a guitar with one string. Most of it worked. Most of it
          had a new owner standing 50 metres away who didn&rsquo;t know it was
          there.
        </p>
        <p style={p}>
          That gap — between someone&rsquo;s &ldquo;I don&rsquo;t need this
          anymore&rdquo; and someone else&rsquo;s &ldquo;I&rsquo;d use this
          tomorrow&rdquo; — is the entire product. Everything Wecycle does is
          some version of closing it.
        </p>

        <h2 style={h2}>How we make decisions</h2>
        <ul style={ul}>
          <li style={li}>
            <strong>Does it move more stuff between more people?</strong> If a
            feature doesn&rsquo;t, it doesn&rsquo;t ship. We&rsquo;d rather have
            three things that work perfectly than ten that don&rsquo;t.
          </li>
          <li style={li}>
            <strong>Is it safe by default?</strong> Personal phone numbers stay
            private unless the owner explicitly turns them on. Reports get
            reviewed within 24 hours. The block button is a sentence away.
          </li>
          <li style={li}>
            <strong>Is it honest?</strong> Sold items stay visible (dimmed),
            never silently deleted. Counts are real counts. Sponsored slots
            are labelled sponsored. A community runs on trust or it
            doesn&rsquo;t run.
          </li>
        </ul>

        <h2 style={h2}>What success looks like</h2>
        <p style={p}>
          A Wecycle that&rsquo;s working is a campus where the first answer to{' '}
          <em>&ldquo;does anyone have a &hellip;?&rdquo;</em> is a photo, a
          name, and a meeting place ten minutes from now. Where the dumpster
          on move-out day is half-empty because the things in it all found
          homes the week before. Where a stranger&rsquo;s lost AirPods make it
          back to them by lunch.
        </p>
        <p style={p}>
          We&rsquo;re building toward that, one listing at a time. If you have
          something to share, a need to post, or a thought on what we should
          build next, write to us — we read everything.
        </p>

        <p style={foot}>
          Get in touch: <a style={link} href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </div>
    </main>
  );
}

/* ── self-contained styles (theme-independent, mirrors privacy.tsx) ── */
const page: React.CSSProperties = {
  background: '#FAFAF6', color: '#1A1A17', minHeight: '100dvh',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  /* Safe-area insets, not a flat 32px. The root layout ships
     viewport-fit=cover with a black-translucent status bar, so this page really
     does extend behind the clock on a notched iPhone — and 32px put the back
     link directly underneath it: unreadable, and untappable, because the status
     bar takes the touch first. The left/right max() covers the same overlap in
     landscape, where the notch eats one margin. */
  paddingTop: 'calc(24px + env(safe-area-inset-top))',
  paddingRight: 'max(20px, env(safe-area-inset-right))',
  paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
  paddingLeft: 'max(20px, env(safe-area-inset-left))',
  lineHeight: 1.6,
};
const wrap: React.CSSProperties = { maxWidth: 720, margin: '0 auto' };
const h1: React.CSSProperties = { fontSize: 'calc(36px * var(--text-scale))', fontWeight: 700, letterSpacing: '-0.025em', margin: '20px 0 4px' };
const meta: React.CSSProperties = { color: '#6B6B63', fontSize: 'calc(13px * var(--text-scale))', margin: '0 0 24px' };
const lede: React.CSSProperties = { fontSize: 'calc(18px * var(--text-scale))', lineHeight: 1.55, margin: '0 0 28px', color: '#2A2A24' };
const h2: React.CSSProperties = { fontSize: 'calc(20px * var(--text-scale))', fontWeight: 700, letterSpacing: '-0.015em', margin: '32px 0 10px' };
const p: React.CSSProperties = { fontSize: 'calc(15.5px * var(--text-scale))', margin: '0 0 14px', color: '#2A2A24' };
const ul: React.CSSProperties = { margin: '0 0 14px', paddingLeft: 22 };
const li: React.CSSProperties = { fontSize: 'calc(15.5px * var(--text-scale))', margin: '0 0 10px', color: '#2A2A24', lineHeight: 1.6 };
const link: React.CSSProperties = { color: '#5C7A00', textDecoration: 'underline' };
const foot: React.CSSProperties = { marginTop: 40, paddingTop: 20, borderTop: '1px solid #E5E5DD', color: '#6B6B63', fontSize: 'calc(14px * var(--text-scale))' };

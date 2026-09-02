import type { Metadata } from 'next';
import BackToApp from '../../components/BackToApp';

/* Support page — the URL App Store Connect and Google Play both require.
 *
 * Server-rendered and self-contained (no app JS, no theme dependency) for the
 * same reason /privacy is: a store review bot has to be able to fetch it cold
 * and find a real human contact route. Apple rejects Support URLs that just
 * redirect to a marketing splash with no way to reach anyone, so the contact
 * address is the first thing on the page, in text, not behind a form. */

export const metadata: Metadata = {
  title: 'Support — Wecycle',
  description:
    'Get help with Wecycle: contact us, report a listing or a person, recover your account, or delete it.',
  robots: { index: true, follow: true },
};

const CONTACT = 'wecycle.page@gmail.com';
const UPDATED = 'August 11, 2026';

const link: React.CSSProperties = { color: '#5C7A00', textDecoration: 'underline' };

/* Kept short and answerable. Every entry here is something the app actually
 * does — nothing aspirational, because a support page that promises a feature
 * the build doesn't have is worse than no support page. */
const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'I never got my sign-in email.',
    a: (
      <>
        Check spam first — it arrives from a no-reply address. University inboxes
        sometimes hold mail from new senders for a few minutes. If nothing lands
        within ten minutes, email us and we&apos;ll confirm the account by hand.
      </>
    ),
  },
  {
    q: 'How do I report a listing, a comment, or a person?',
    a: (
      <>
        Every listing, comment, and profile has a <strong>Report</strong> action
        behind its ⋯ menu. Pick a reason and it reaches us immediately. You can
        also <strong>Block</strong> someone from the same menu — blocking hides
        their posts and comments from you and stops them contacting you. Urgent
        safety issues: email <a href={`mailto:${CONTACT}`} style={link}>{CONTACT}</a>{' '}
        with &quot;URGENT&quot; in the subject.
      </>
    ),
  },
  {
    q: 'Someone did not show up, or the item was not as described.',
    a: (
      <>
        Wecycle introduces people; it does not hold money or ship anything, so we
        can&apos;t reverse a handover. Report the person so it counts against
        their account — repeat reports get accounts removed. Meet in a public
        campus spot and check the item before you pay.
      </>
    ),
  },
  {
    q: 'How do I delete my account and my data?',
    a: (
      <>
        In the app: <strong>Menu → Settings → Delete account</strong>. Or use the{' '}
        <a href="/delete-account" style={link}>account deletion page</a>. Deletion
        removes your profile, listings, and messages. It cannot be undone.
      </>
    ),
  },
  {
    q: 'Is Wecycle free?',
    a: (
      <>
        Yes. There are no fees, no commission, and no ads. Wecycle takes no cut of
        anything you sell, lend, or give away.
      </>
    ),
  },
  {
    q: 'Who can join?',
    a: (
      <>
        Wecycle is built for verified members of the campus communities it serves.
        Sign up with your university address to get the verified tick.
      </>
    ),
  },
];

export default function Support() {
  return (
    <main style={page}>
      <div style={wrap}>
        <BackToApp />
        <h1 style={h1}>Support</h1>
        <p style={meta}>Last updated: {UPDATED}</p>

        {/* Contact first, above everything. This is what a reviewer looks for. */}
        <div style={card}>
          <p style={cardLabel}>Contact us</p>
          <p style={cardMail}>
            <a href={`mailto:${CONTACT}`} style={mailLink}>{CONTACT}</a>
          </p>
          <p style={cardNote}>
            We read every message and reply within two working days. Include your
            account email and, if it helps, a screenshot.
          </p>
        </div>

        <h2 style={h2}>Common questions</h2>
        {FAQ.map(({ q, a }) => (
          <div key={q} style={{ margin: '0 0 18px' }}>
            <p style={qStyle}>{q}</p>
            <p style={p}>{a}</p>
          </div>
        ))}

        <h2 style={h2}>Safety on campus</h2>
        <ul style={ul}>
          <li style={li}>Meet in a public place — a hostel lobby, a café, the library steps.</li>
          <li style={li}>Inspect anything electronic before money changes hands.</li>
          <li style={li}>Keep the conversation in the app so there is a record.</li>
          <li style={li}>Never share an OTP, a password, or a bank detail with another member.</li>
        </ul>

        <h2 style={h2}>More</h2>
        <ul style={ul}>
          <li style={li}><a href="/privacy" style={link}>Privacy Policy</a> — what we collect and why</li>
          <li style={li}><a href="/terms" style={link}>Terms of Service</a> — the rules for using Wecycle</li>
          <li style={li}><a href="/copyright" style={link}>Copyright &amp; IP</a> — ownership and how to report infringement</li>
          <li style={li}><a href="/mission" style={link}>Our mission</a> — why Wecycle exists</li>
          <li style={li}><a href="/delete-account" style={link}>Delete your account</a></li>
        </ul>

        <div style={foot}>
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} Wecycle. All rights reserved.</p>
          <p style={{ margin: '6px 0 0' }}>
            Wecycle is a free community platform for sharing, lending, and
            rehoming what already exists.
          </p>
        </div>
      </div>
    </main>
  );
}

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
const h1: React.CSSProperties = { fontSize: 'calc(32px * var(--text-scale))', fontWeight: 700, letterSpacing: '-0.02em', margin: '20px 0 4px' };
const meta: React.CSSProperties = { color: '#6B6B63', fontSize: 'calc(13px * var(--text-scale))', margin: '0 0 24px' };
const h2: React.CSSProperties = { fontSize: 'calc(19px * var(--text-scale))', fontWeight: 700, letterSpacing: '-0.01em', margin: '30px 0 12px' };
const p: React.CSSProperties = { fontSize: 'calc(15px * var(--text-scale))', margin: '0 0 12px', color: '#2A2A24' };
const qStyle: React.CSSProperties = { fontSize: 'calc(15px * var(--text-scale))', fontWeight: 700, margin: '0 0 4px', color: '#1A1A17' };
const ul: React.CSSProperties = { margin: '0 0 12px', paddingLeft: 22 };
const li: React.CSSProperties = { fontSize: 'calc(15px * var(--text-scale))', margin: '0 0 6px', color: '#2A2A24' };
const foot: React.CSSProperties = { marginTop: 40, paddingTop: 20, borderTop: '1px solid #E5E5DD', color: '#6B6B63', fontSize: 'calc(13px * var(--text-scale))' };

/* Contact block — a soft fill and a hairline, no bordered box. */
const card: React.CSSProperties = {
  background: '#F2F5E6', borderRadius: 16, padding: '18px 20px', margin: '0 0 8px',
};
const cardLabel: React.CSSProperties = {
  margin: 0, fontSize: 'calc(11px * var(--text-scale))', fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: '#5C7A00',
};
const cardMail: React.CSSProperties = { margin: '6px 0 0', fontSize: 'calc(20px * var(--text-scale))', fontWeight: 700 };
const mailLink: React.CSSProperties = { color: '#1A1A17', textDecoration: 'none' };
const cardNote: React.CSSProperties = { margin: '8px 0 0', fontSize: 'calc(14px * var(--text-scale))', color: '#4A4A42' };

import type { Metadata } from 'next';
import BackToApp from '../../components/BackToApp';

/* Copyright & intellectual property page.
 *
 * Apple's Copyright entry in App Store Connect is a plain TEXT field, not a URL
 * — the literal string it wants is at the top of this page so it can be copied
 * straight across. The page itself exists for App Store Review Guideline 5.2
 * (Intellectual Property): a user-generated-content app is expected to offer a
 * named route for rights holders to report infringement. Google Play's User
 * Generated Content policy asks for the same thing.
 *
 * Server-rendered and self-contained like /privacy and /support so a review bot
 * can fetch it cold. */

export const metadata: Metadata = {
  title: 'Copyright & IP — Wecycle',
  description:
    'Copyright ownership, who owns the content members post, how to report infringement, and third-party attributions.',
  robots: { index: true, follow: true },
};

const CONTACT = 'wecycle.page@gmail.com';
const UPDATED = 'August 12, 2026';
const HOLDER = 'Wecycle';
const YEAR = 2026;

const link: React.CSSProperties = { color: '#5C7A00', textDecoration: 'underline' };

export default function Copyright() {
  return (
    <main style={page}>
      <div style={wrap}>
        <BackToApp />
        <h1 style={h1}>Copyright &amp; intellectual property</h1>
        <p style={meta}>Last updated: {UPDATED}</p>

        {/* The exact string App Store Connect's Copyright field wants. */}
        <div style={card}>
          <p style={cardLabel}>Copyright notice</p>
          <p style={cardValue}>{YEAR} {HOLDER}</p>
          <p style={cardNote}>
            This is the value for the <strong>Copyright</strong> field in App Store
            Connect and Google Play. Apple asks for the year the rights were first
            asserted followed by the rights holder, with no © symbol — Apple adds
            the symbol itself.
          </p>
        </div>

        <h2 style={h2}>The app</h2>
        <p style={p}>
          Wecycle, its name, logo, wordmark, interface, design, and code are
          © {YEAR} {HOLDER}. All rights reserved. You may not copy, redistribute,
          reverse engineer, or create derivative works from the app except where
          that right cannot be excluded by law.
        </p>

        <h2 style={h2}>Content members post</h2>
        <p style={p}>
          You keep ownership of everything you post — your photos, descriptions,
          listings, and comments remain yours. By posting on Wecycle you grant us
          a non-exclusive, worldwide, royalty-free licence to host, store, resize,
          and display that content for the purpose of running the service, and to
          render it into the share cards the app generates. That licence ends when
          you delete the content or your account, except for copies already shared
          outside the app by other people.
        </p>
        <p style={p}>
          Only post photos you took or otherwise have the right to use. Do not
          upload images taken from a manufacturer&apos;s website, a stock library,
          or someone else&apos;s listing.
        </p>

        <h2 style={h2}>Reporting infringement</h2>
        <p style={p}>
          If you own rights in something posted on Wecycle and believe it was used
          without permission, email{' '}
          <a href={`mailto:${CONTACT}`} style={link}>{CONTACT}</a> with{' '}
          <strong>COPYRIGHT</strong> in the subject line. Please include:
        </p>
        <ul style={ul}>
          <li style={li}>a link to the listing, comment, or profile in question;</li>
          <li style={li}>a description of the work you say it infringes;</li>
          <li style={li}>proof you own the rights, or authority to act for the owner;</li>
          <li style={li}>your name and contact details;</li>
          <li style={li}>
            a statement that you believe in good faith the use is not authorised,
            and that the information you have given is accurate.
          </li>
        </ul>
        <p style={p}>
          We acknowledge reports within two working days. Content we judge
          infringing is removed, and accounts that repeatedly infringe are closed.
          If your content was removed and you think that was wrong, reply to the
          same thread and we will review it.
        </p>

        <h2 style={h2}>Trademarks</h2>
        <p style={p}>
          Brand names, logos, and product names that appear in listings belong to
          their respective owners. They are used by members to describe items, and
          their appearance in the app does not imply any endorsement of Wecycle by
          those owners, or any affiliation with them.
        </p>
        <p style={p}>
          Wecycle is not affiliated with, endorsed by, or sponsored by any
          university, college, or institution whose members use it.
        </p>

        <h2 style={h2}>Third-party software</h2>
        <p style={p}>
          Wecycle is built on open-source software used under its respective
          licences, including React and Next.js (MIT), Capacitor (MIT), Supabase
          client libraries (MIT), and Lucide icons (ISC). Copyright in those
          components stays with their authors. Full licence texts are available
          from each project; email us if you would like the list for a specific
          release.
        </p>

        <h2 style={h2}>More</h2>
        <ul style={ul}>
          <li style={li}><a href="/terms" style={link}>Terms of Service</a></li>
          <li style={li}><a href="/privacy" style={link}>Privacy Policy</a></li>
          <li style={li}><a href="/support" style={link}>Support</a></li>
        </ul>

        <div style={foot}>
          <p style={{ margin: 0 }}>© {YEAR} {HOLDER}. All rights reserved.</p>
          <p style={{ margin: '6px 0 0' }}>
            Questions about anything on this page:{' '}
            <a href={`mailto:${CONTACT}`} style={link}>{CONTACT}</a>
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
const h2: React.CSSProperties = { fontSize: 'calc(19px * var(--text-scale))', fontWeight: 700, letterSpacing: '-0.01em', margin: '30px 0 8px' };
const p: React.CSSProperties = { fontSize: 'calc(15px * var(--text-scale))', margin: '0 0 12px', color: '#2A2A24' };
const ul: React.CSSProperties = { margin: '0 0 12px', paddingLeft: 22 };
const li: React.CSSProperties = { fontSize: 'calc(15px * var(--text-scale))', margin: '0 0 6px', color: '#2A2A24' };
const foot: React.CSSProperties = { marginTop: 40, paddingTop: 20, borderTop: '1px solid #E5E5DD', color: '#6B6B63', fontSize: 'calc(13px * var(--text-scale))' };

/* Soft fill, hairline, no bordered box — same as /support. */
const card: React.CSSProperties = {
  background: '#F2F5E6', borderRadius: 16, padding: '18px 20px', margin: '0 0 8px',
};
const cardLabel: React.CSSProperties = {
  margin: 0, fontSize: 'calc(11px * var(--text-scale))', fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: '#5C7A00',
};
const cardValue: React.CSSProperties = { margin: '6px 0 0', fontSize: 'calc(22px * var(--text-scale))', fontWeight: 700 };
const cardNote: React.CSSProperties = { margin: '8px 0 0', fontSize: 'calc(14px * var(--text-scale))', color: '#4A4A42' };

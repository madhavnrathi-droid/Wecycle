import type { Metadata } from 'next';
import BackToApp from '../../components/BackToApp';

/* Account & data deletion page — the URL Google Play's Data Safety form
 * requires for apps that let users create an account. Reachable without
 * installing the app, in English, describing exactly what is deleted.
 * Also satisfies Apple App Store §5.1.1(v) account-deletion requirement. */

export const metadata: Metadata = {
  title: 'Delete Your Account — Wecycle',
  description: 'How to delete your Wecycle account and all associated data.',
  robots: { index: true, follow: true },
};

const UPDATED = 'June 2026';
const CONTACT = 'wecycle.page@gmail.com';

export default function DeleteAccount() {
  const mailtoSubject = 'Account%20Deletion%20Request';
  const mailtoBody = 'Please%20delete%20the%20Wecycle%20account%20associated%20with%20this%20email%20address.';

  return (
    <main style={page}>
      <div style={wrap}>
        <BackToApp />
        <h1 style={h1}>Delete your Wecycle account</h1>
        <p style={meta}>Wecycle · developer contact: {CONTACT}</p>

        <p style={p}>
          You can permanently delete your Wecycle account and all data associated
          with it at any time, using either method below.
        </p>

        <h2 style={h2}>Delete in the app (instant)</h2>
        <p style={p}>
          If you can sign in to your account, the fastest way to delete it is
          directly in the app:
        </p>
        <ol style={ol}>
          <li style={li}>Open Wecycle and sign in.</li>
          <li style={li}>Tap the menu and go to <strong>Settings</strong>.</li>
          <li style={li}>Scroll to the <strong>Account</strong> section.</li>
          <li style={li}>Tap <strong>Delete account</strong> and follow the confirmation prompts.</li>
        </ol>
        <p style={p}>
          Deletion is immediate — your session ends right away and all your data
          is removed from our servers as described below.
        </p>

        <h2 style={h2}>Can&apos;t sign in? Delete by email</h2>
        <p style={p}>
          If you no longer have access to your account, send a deletion request
          from the email address tied to your Wecycle account:{' '}
          <a
            href={`mailto:${CONTACT}?subject=${mailtoSubject}&body=${mailtoBody}`}
            style={link}
          >
            {CONTACT}
          </a>
          . We will verify the request and complete deletion within{' '}
          <strong>7 days</strong>.
        </p>

        <h2 style={h2}>What gets deleted</h2>
        <p style={p}>
          Deleting your account permanently removes all of the following:
        </p>
        <ul style={ul}>
          <li style={li}>Your profile (name, email, phone, avatar, college, course, department, residence).</li>
          <li style={li}>All item listings and marketplace posts you created.</li>
          <li style={li}>All requests you posted.</li>
          <li style={li}>All lost &amp; found reports you submitted.</li>
          <li style={li}>Your comments on any post.</li>
          <li style={li}>Your messages and conversation history.</li>
          <li style={li}>Your saved searches and search alerts.</li>
          <li style={li}>Your push notification subscriptions.</li>
          <li style={li}>Your event RSVPs.</li>
          <li style={li}>Your saved items.</li>
          <li style={li}>Your authentication record.</li>
        </ul>

        <h2 style={h2}>What may be retained</h2>
        <ul style={ul}>
          <li style={li}>
            Deletion is <strong>immediate</strong> — there is no soft-delete or
            grace period. Once confirmed, your account and data are gone.
          </li>
          <li style={li}>
            Anonymized analytics logs (e.g., aggregate usage counts) that cannot
            identify you may persist for <strong>up to 30 days</strong> before
            rolling off our systems.
          </li>
          <li style={li}>
            Records we are legally required to keep (e.g., to resolve active
            disputes or prevent abuse) are retained only as long as required by
            law, then deleted.
          </li>
        </ul>

        <p style={p}>
          Deletion is permanent and cannot be undone. You may create a new
          Wecycle account with the same email address at any time after deletion.
        </p>

        <p style={p}>
          Questions? Email{' '}
          <a href={`mailto:${CONTACT}`} style={link}>{CONTACT}</a> or see our{' '}
          <a href="/privacy" style={link}>Privacy Policy</a>.
        </p>

        <footer style={foot}>Last updated: {UPDATED} · © {new Date().getFullYear()} Wecycle</footer>
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
const ol: React.CSSProperties = { margin: '0 0 12px', paddingLeft: 22 };
const li: React.CSSProperties = { fontSize: 'calc(15px * var(--text-scale))', margin: '0 0 6px', color: '#2A2A24' };
const link: React.CSSProperties = { color: '#5C7A00', textDecoration: 'underline' };
const foot: React.CSSProperties = { marginTop: 40, paddingTop: 20, borderTop: '1px solid #E5E5DD', color: '#6B6B63', fontSize: 'calc(13px * var(--text-scale))' };

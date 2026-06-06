import type { Metadata } from 'next';

/* Account & data deletion page — the URL Google Play's Data Safety form
 * requires for apps that let users create an account. Reachable without
 * installing the app, in English, describing exactly what is deleted. */

export const metadata: Metadata = {
  title: 'Delete Your Account — Wecycle',
  description: 'How to delete your Wecycle account and all associated data.',
  robots: { index: true, follow: true },
};

const CONTACT = 'wecycle.page@gmail.com';

export default function DeleteAccount() {
  const subject = encodeURIComponent('Wecycle — Account deletion request');
  const body = encodeURIComponent(
    'Please delete my Wecycle account and all associated data.\n\n' +
    'Account email (the one I sign in with): \n' +
    'Display name (if known): \n',
  );

  return (
    <main style={page}>
      <div style={wrap}>
        <a href="/" style={back}>← Back to Wecycle</a>
        <h1 style={h1}>Delete your account &amp; data</h1>
        <p style={meta}>Wecycle · developer contact: {CONTACT}</p>

        <p style={p}>
          You can permanently delete your Wecycle account and the data associated
          with it at any time, using either method below.
        </p>

        <h2 style={h2}>Option 1 — In the app (instant)</h2>
        <ol style={ol}>
          <li style={li}>Open Wecycle and sign in.</li>
          <li style={li}>Go to the menu → <strong>Settings</strong>.</li>
          <li style={li}>Scroll to <strong>Delete account</strong> and confirm.</li>
        </ol>
        <p style={p}>
          Your session ends immediately and your local data is cleared on the
          device. Server-side removal completes as described below.
        </p>

        <h2 style={h2}>Option 2 — By email</h2>
        <p style={p}>
          Send a deletion request from the email address tied to your account to{' '}
          <a href={`mailto:${CONTACT}?subject=${subject}&body=${body}`} style={link}>{CONTACT}</a>.
          We verify the request comes from your account email and complete deletion
          within 30 days (usually much sooner).
        </p>

        <h2 style={h2}>What gets deleted</h2>
        <ul style={ul}>
          <li style={li}>Your profile (name, email, phone, college ID, course/department, residence, avatar).</li>
          <li style={li}>Your item listings, requests, events, and lost &amp; found reports.</li>
          <li style={li}>Photos and videos you uploaded.</li>
          <li style={li}>Your comments and saved items.</li>
          <li style={li}>Your authentication record.</li>
        </ul>

        <h2 style={h2}>What may be retained, and for how long</h2>
        <ul style={ul}>
          <li style={li}>Encrypted backups are purged on a rolling basis and fully cleared <strong>within 30 days</strong>.</li>
          <li style={li}>Aggregated, anonymized analytics that cannot identify you may be retained.</li>
          <li style={li}>Records we are legally required to keep (e.g., to resolve disputes or prevent abuse) are kept only as long as required by law, then deleted.</li>
        </ul>

        <p style={p}>
          Deletion is permanent and cannot be undone. After deletion you can
          create a new account at any time with the same email.
        </p>

        <p style={p}>
          Questions? Email <a href={`mailto:${CONTACT}`} style={link}>{CONTACT}</a> or
          see our <a href="/privacy" style={link}>Privacy Policy</a>.
        </p>

        <footer style={foot}>© {new Date().getFullYear()} Wecycle</footer>
      </div>
    </main>
  );
}

const page: React.CSSProperties = {
  background: '#FAFAF6', color: '#1A1A17', minHeight: '100vh',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  padding: '32px 20px 64px', lineHeight: 1.6,
};
const wrap: React.CSSProperties = { maxWidth: 720, margin: '0 auto' };
const back: React.CSSProperties = { color: '#5C7A00', textDecoration: 'none', fontSize: 14, fontWeight: 600 };
const h1: React.CSSProperties = { fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', margin: '20px 0 4px' };
const meta: React.CSSProperties = { color: '#6B6B63', fontSize: 13, margin: '0 0 24px' };
const h2: React.CSSProperties = { fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', margin: '30px 0 8px' };
const p: React.CSSProperties = { fontSize: 15, margin: '0 0 12px', color: '#2A2A24' };
const ul: React.CSSProperties = { margin: '0 0 12px', paddingLeft: 22 };
const ol: React.CSSProperties = { margin: '0 0 12px', paddingLeft: 22 };
const li: React.CSSProperties = { fontSize: 15, margin: '0 0 6px', color: '#2A2A24' };
const link: React.CSSProperties = { color: '#5C7A00', textDecoration: 'underline' };
const foot: React.CSSProperties = { marginTop: 40, paddingTop: 20, borderTop: '1px solid #E5E5DD', color: '#6B6B63', fontSize: 13 };

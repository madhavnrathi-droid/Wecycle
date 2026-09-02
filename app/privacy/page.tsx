import type { Metadata } from 'next';
import BackToApp from '../../components/BackToApp';

/* Standalone, crawlable legal page (server-rendered, no app JS needed) so
 * Google Play's review bot can fetch it directly. Self-contained styling
 * keeps it readable regardless of the app's theme state. */

export const metadata: Metadata = {
  title: 'Privacy Policy — Wecycle',
  description: 'How Wecycle collects, uses, shares, and protects your data.',
  robots: { index: true, follow: true },
};

const UPDATED = 'June 6, 2026';
const CONTACT = 'wecycle.page@gmail.com';

export default function PrivacyPolicy() {
  return (
    <main style={page}>
      <div style={wrap}>
        <BackToApp />
        <h1 style={h1}>Privacy Policy</h1>
        <p style={meta}>Last updated: {UPDATED}</p>

        <p style={p}>
          Wecycle (&ldquo;Wecycle,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) is a
          community resource-circulation app for college campuses. Members share,
          request, lend, and find items, post and discover campus events, and
          report lost &amp; found belongings. This policy explains what data we
          collect, why, who we share it with, and the choices and rights you have.
          By using Wecycle you agree to this policy.
        </p>

        <h2 style={h2}>1. Information we collect</h2>
        <p style={p}><strong>Information you provide</strong></p>
        <ul style={ul}>
          <li style={li}><strong>Account &amp; profile:</strong> your Manipal email address and a password you choose (stored only as a salted hash — we never see it); a one-time code emailed to you confirms the address when you sign up and lets you reset a forgotten password. Plus your display name, and — only if you choose to add them — your college ID, phone number, course, department, graduating year, and residence type.</li>
          <li style={li}><strong>Content you post:</strong> item listings, requests, events, lost &amp; found reports, comments, and any photos or videos you upload.</li>
          <li style={li}><strong>Contact preferences:</strong> whether you allow others to reach you by email and/or WhatsApp about your posts.</li>
          <li style={li}><strong>Support messages:</strong> anything you send us via feedback or email.</li>
        </ul>
        <p style={p}><strong>Information collected automatically</strong></p>
        <ul style={ul}>
          <li style={li}><strong>Usage &amp; device data:</strong> pages and screens viewed, taps and interactions, approximate location inferred from IP address, device and browser type, and similar diagnostics — collected through Google Analytics 4, Google Tag Manager, and Microsoft Clarity.</li>
          <li style={li}><strong>Session recordings &amp; heatmaps:</strong> Microsoft Clarity may record anonymized interaction sessions (with text inputs masked) to help us improve usability.</li>
          <li style={li}><strong>Local storage:</strong> we store your sign-in session, app settings, and a first-run flag on your device.</li>
        </ul>
        <p style={p}>We do <strong>not</strong> collect financial or payment information — Wecycle takes no payments. We do not knowingly collect data from children under 16.</p>

        <h2 style={h2}>2. How we use your information</h2>
        <ul style={ul}>
          <li style={li}>To operate the marketplace, requests, events, and lost &amp; found features.</li>
          <li style={li}>To authenticate you and keep your account secure.</li>
          <li style={li}>To let other members contact you about your posts, using the channels you enabled.</li>
          <li style={li}>To understand usage and improve the product (analytics).</li>
          <li style={li}>To respond to your support requests and enforce our policies and safety rules.</li>
        </ul>

        <h2 style={h2}>3. What other members can see</h2>
        <p style={p}>
          Wecycle is a community network. By design, your <strong>display name,
          avatar, profile details you fill in, and the posts you create are
          visible to other members</strong>, along with the contact channels you
          turn on. Your email and phone are only shared with another member when
          you have explicitly enabled that contact channel; you can disable phone
          sharing and WhatsApp contact in Settings at any time.
        </p>

        <h2 style={h2}>4. Service providers we share data with</h2>
        <p style={p}>We use trusted processors who handle data on our behalf:</p>
        <ul style={ul}>
          <li style={li}><strong>Supabase</strong> — authentication, database, and file storage.</li>
          <li style={li}><strong>Vercel</strong> — application hosting and delivery.</li>
          <li style={li}><strong>Google</strong> (Analytics 4, Tag Manager) — usage analytics.</li>
          <li style={li}><strong>Microsoft</strong> (Clarity) — usability analytics and session replay.</li>
        </ul>
        <p style={p}>
          We do <strong>not sell your personal data</strong> and we do not share
          it for third-party advertising. We may disclose data if required by law
          or to protect the safety of our community.
        </p>

        <h2 style={h2}>5. Data retention &amp; deletion</h2>
        <p style={p}>
          We keep your data while your account is active. You can delete your
          account and associated data at any time from <strong>Settings →
          Delete account</strong> inside the app, or by following the steps at{' '}
          <a href="/delete-account" style={link}>wecycle&apos;s account-deletion page</a>.
          Deletion removes your profile and the posts tied to your account;
          backups are purged within 30 days. See the deletion page for full detail.
        </p>

        <h2 style={h2}>6. Your rights &amp; choices</h2>
        <ul style={ul}>
          <li style={li}>Access, correct, or update your profile information in the app at any time.</li>
          <li style={li}>Control who can contact you via the contact toggles in Settings.</li>
          <li style={li}>Delete your account and data (Section 5).</li>
          <li style={li}>Opt out of analytics cookies via your browser/OS settings; you can also use Google Analytics&apos; opt-out tools.</li>
        </ul>

        <h2 style={h2}>7. Security</h2>
        <p style={p}>
          We use industry-standard measures — encrypted transport (HTTPS),
          row-level security on our database, and scoped access keys — to protect
          your data. No method of transmission or storage is perfectly secure, but
          we work to safeguard your information.
        </p>

        <h2 style={h2}>8. Children</h2>
        <p style={p}>
          Wecycle is intended for users aged 16 and over and is not directed to
          children under 16. If you believe a minor under 16 has provided us data,
          contact us and we will delete it.
        </p>

        <h2 style={h2}>9. Changes to this policy</h2>
        <p style={p}>
          We may update this policy as the product evolves. We will revise the
          &ldquo;Last updated&rdquo; date above and, for material changes, notify
          you in the app.
        </p>

        <h2 style={h2}>10. Contact us</h2>
        <p style={p}>
          Questions or requests about your privacy? Email{' '}
          <a href={`mailto:${CONTACT}`} style={link}>{CONTACT}</a>.
        </p>

        <footer style={foot}>© {new Date().getFullYear()} Wecycle</footer>
      </div>
    </main>
  );
}

/* ── self-contained styles (theme-independent) ── */
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
const link: React.CSSProperties = { color: '#5C7A00', textDecoration: 'underline' };
const foot: React.CSSProperties = { marginTop: 40, paddingTop: 20, borderTop: '1px solid #E5E5DD', color: '#6B6B63', fontSize: 'calc(13px * var(--text-scale))' };

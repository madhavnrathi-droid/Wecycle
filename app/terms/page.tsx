import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Wecycle',
  description: 'The rules for using Wecycle.',
  robots: { index: true, follow: true },
};

const UPDATED = 'June 6, 2026';
const CONTACT = 'wecycle.page@gmail.com';

export default function Terms() {
  return (
    <main style={page}>
      <div style={wrap}>
        <a href="/" style={back}>← Back to Wecycle</a>
        <h1 style={h1}>Terms of Service</h1>
        <p style={meta}>Last updated: {UPDATED}</p>

        <p style={p}>
          Welcome to Wecycle. By creating an account or using the app you agree to
          these terms. Wecycle is a free community platform for sharing,
          requesting, lending, and finding items, posting campus events, and
          reporting lost &amp; found belongings.
        </p>

        <h2 style={h2}>1. Eligibility</h2>
        <p style={p}>You must be at least <strong>16 years old</strong> and a member of the community Wecycle serves to use the app. If you are under 16, do not create an account.</p>

        <h2 style={h2}>2. Your account</h2>
        <p style={p}>
          You are responsible for the activity on your account and for keeping
          your sign-in email secure. Provide accurate information and keep it
          current.
        </p>

        {/* Guideline 1.2 requires the terms to state plainly that objectionable
            content and abusive users are not tolerated. The old list implied it
            across several polite bullets; App Review asked for it said outright,
            so it is now the first thing in this section and unmissable. */}
        <h2 style={h2}>3. Zero tolerance for objectionable content and abusive behaviour</h2>
        <p style={{ ...p, fontWeight: 600 }}>
          Wecycle has no tolerance for objectionable content or abusive users.
          Content that breaks the rules below is removed, and the accounts
          responsible are suspended or permanently banned.
        </p>
        <p style={p}>By using Wecycle you agree never to post, send, or share:</p>
        <ul style={ul}>
          <li style={li}>Harassment, bullying, stalking, or targeted abuse of any person.</li>
          <li style={li}>Hate speech, slurs, or content attacking people for their race, caste, religion, sex, gender, sexuality, disability, or nationality.</li>
          <li style={li}>Threats of violence, or content encouraging self-harm or harm to others.</li>
          <li style={li}>Sexual or pornographic content, nudity, or any sexual content involving minors.</li>
          <li style={li}>Impersonation of another person, a business, or an institution.</li>
          <li style={li}>Spam, scams, phishing, or deliberately misleading listings.</li>
          <li style={li}>Anything illegal, or content that breaks someone else&apos;s copyright or trademark.</li>
        </ul>
        <p style={p}>
          We filter posts, comments, and profiles for prohibited wording as they
          are submitted, and content that gets through can be reported by any
          member from the ⋯ menu on it. Reports reach our moderators directly.
          You can also block any member, which removes their posts and comments
          from your view immediately and stops them contacting you.
        </p>
        <p style={p}>
          We remove violating content and we suspend or ban the accounts behind
          it. Serious cases — threats, sexual content involving minors, or
          anything illegal — are removed on sight and may be referred to the
          university or the police.
        </p>

        <h2 style={h2}>4. Acceptable use</h2>
        <ul style={ul}>
          <li style={li}>Don&apos;t post illegal, stolen, counterfeit, hazardous, or prohibited items.</li>
          <li style={li}>Don&apos;t post content you don&apos;t have the right to share.</li>
          <li style={li}>Transactions and exchanges happen directly between members. Wecycle is not a party to them and does not guarantee any item, price, or person. Meet safely and use your judgment.</li>
        </ul>

        <h2 style={h2}>5. Content</h2>
        <p style={p}>
          You keep ownership of what you post, and grant Wecycle a non-exclusive,
          royalty-free license to store, display, and distribute it within the app
          to operate the service. You are solely responsible for the accuracy and
          legality of your own posts. Wecycle is not responsible or liable for
          content posted by other users. We may remove content or suspend accounts
          that violate these terms or our community safety rules.
        </p>

        <h2 style={h2}>6. No warranty &amp; limitation of liability</h2>
        <p style={p}>
          Wecycle is provided &ldquo;as is,&rdquo; without warranties. To the
          extent permitted by law, Wecycle is not liable for (a) disputes, losses,
          or damages arising from member interactions or user-to-user transactions,
          (b) the accuracy, quality, or safety of items listed by other members,
          or (c) any harm resulting from content posted by users. Meet safely, use
          your judgment, and transact at your own risk.
        </p>

        <h2 style={h2}>7. Termination</h2>
        <p style={p}>
          You can delete your account at any time (see our{' '}
          <a href="/delete-account" style={link}>account deletion page</a>). We may
          suspend or terminate access for violations of these terms.
        </p>

        <h2 style={h2}>8. Changes &amp; contact</h2>
        <p style={p}>
          We may update these terms; we&apos;ll revise the date above for material
          changes. Questions? Email{' '}
          <a href={`mailto:${CONTACT}`} style={link}>{CONTACT}</a>. See also our{' '}
          <a href="/privacy" style={link}>Privacy Policy</a>.
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
const li: React.CSSProperties = { fontSize: 15, margin: '0 0 6px', color: '#2A2A24' };
const link: React.CSSProperties = { color: '#5C7A00', textDecoration: 'underline' };
const foot: React.CSSProperties = { marginTop: 40, paddingTop: 20, borderTop: '1px solid #E5E5DD', color: '#6B6B63', fontSize: 13 };

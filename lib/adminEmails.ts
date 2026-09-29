/* The admin accounts.
 *
 * In its own module, with no imports, so anything can read it — including a
 * server route. It used to live in AuthContext, which meant lib/emailDomain.ts
 * had to import a React client module (and through it the Supabase client,
 * Capacitor and analytics) just to read five strings, which made the Manipal
 * rule impossible to enforce on the server. These addresses are already public
 * by design: they are shown to members as the people who can help.
 */
export const ADMIN_EMAILS: ReadonlyArray<string> = [
  'wecycle.page@gmail.com',
  'madhav.n.rathi@gmail.com',
  'madhav.smiblr2024@learner.manipal.edu',   /* Madhav Rathi */
  'vidhi.smiblr2025@learner.manipal.edu',    /* Vidhi Nirzar Shah */
  'kshama.smiblr2024@learner.manipal.edu',   /* kshama */
] as const;

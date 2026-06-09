# App Store submission checklist

## Required configuration

### In Supabase
- [ ] Auth → Providers → Apple: enabled with Services ID, Team ID, Key ID, p8 private key
- [ ] Auth → Providers → Google: enabled with Web Client ID + secret
- [ ] Auth → URL Configuration → Redirect URLs: includes `https://wecycle-seven.vercel.app/**` and `wecycle://*` (deep link for future native build)

### In Apple Developer
- [ ] Sign in with Apple capability enabled on the App ID
- [ ] Services ID created with the Supabase callback URL as a return URL: `https://oxqnwqaumrqdiwrlvfel.supabase.co/auth/v1/callback`
- [ ] Mail private relay service domain verified (`oxqnwqaumrqdiwrlvfel.supabase.co`)

### App Store Connect — Required disclosures
- [ ] Privacy Policy URL: https://wecycle-seven.vercel.app/privacy
- [ ] Terms of Use URL: https://wecycle-seven.vercel.app/terms
- [ ] App Privacy → Data Collection: declare what we collect (email, name, college ID, posts, comments, messages) and that messaging data is linked to user identity but not shared with third parties
- [ ] Account Deletion: confirmed in-app via Settings → Account → Delete account; web URL: https://wecycle-seven.vercel.app/delete-account
- [ ] App Review → Contact Info: reviewer email + phone
- [ ] App Review → Demo Account: `playreview@wecycle.page` / code `REVIEW01` (built-in reviewer flow)
- [ ] App Review → Notes: mention "Wecycle is a campus marketplace. Use the Continue with Apple button on the sign-in screen, or paste playreview@wecycle.page in the email field and enter code REVIEW01."

### Required UGC moderation (Apple §1.2)
- [x] Report content button on listings, requests, lost & found, events, comments, messages, profiles
- [x] Block user (from ReportSheet)
- [x] Terms of Service forbid harassment, spam, illegal content
- [x] 24-hour review commitment in Report dialog
- [ ] Reviewer can find Report icon — verify in TestFlight before submission

### Final pre-submission
- [ ] TestFlight build approved by all internal testers
- [ ] Screenshots updated to show Continue with Apple button
- [ ] App description does NOT promise features not in this build (e.g., don't mention payments or location)

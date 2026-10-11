# Shops and brands

Two levels, on purpose:

| | Shop | Brand |
|---|---|---|
| Who turns it on | the member — at sign-up ("Joining as: A student business") or in Account → Your shop | the team, in `lib/brands.ts` |
| Stored | `profiles.role = 'Student business'`, `profiles.bio = <shop name>` | a registry entry + assets in `public/brands/<handle>/` |
| What changes | storefront titled with the shop name, "Run by <member>" | the storefront becomes the brand's store (`components/brand/BrandScreen.tsx`), a strip on each of its products, "More from <brand>", a home-feed spotlight, and a share link `wecycle.page/b/<handle>` |

A shop changes how an account looks and grants nothing else. A brand is
promotion, so it is not a profile field anyone can write.

## The brand page

`BrandScreen` opens instead of a storefront whenever `brandForUser(id)` finds
the member (decided in `StorefrontScreen`, the one door every route to a
profile goes through). Top to bottom: the canvas (brand colours, mascot,
wordmark, tagline), who runs it and what it costs, a sticky row of sections,
Picks, the range by collection, About.

- **Products are the owner's live listings.** Collections are regexes on the
  title (first match wins); anything unclaimed goes in "More from <brand>";
  sold things go in a last "Already sold" section.
- **Order** sits on every product, exactly when it would on the product page
  (orders table live, not the owner, item for sale).
- **Back** from a product returns to the store at the same scroll position.
- Messages and orders go to `ownerId` — the brand's member account.

## Motion

The canvas copies the brand's own animation: the next colour spreads from the
mascot as a disc (a transform), the field glows with the next brand colour,
the mascot squashes as each colour lands, and tapping it moves on. Letters of
the wordmark rise in one after another (smooth settle); only the mascot
bounces. It pauses off screen and in hidden tabs, and is a still gradient under
reduced motion. Promos outside the page hold still — the feed is not the place
for a colour cycle.

## Adding a brand

1. Assets in `public/brands/<handle>/`: `wordmark.svg` with letters as
   `<g class="l l-x">` (trace with `potrace`, see the Foku files),
   `mascot.svg` (white, face cut out), optional `art.webp`, `poster.webp`,
   `og.jpg` (1200×630).
2. An entry in `BRANDS` (`lib/brands.ts`): handle, name, `ownerId` (the
   member's profile id), palette (`ink` must reach 7:1 on every field),
   collections, picks.
3. Set the owner's profile to a shop (`role`, `bio`) so their name reads
   right everywhere the registry does not reach.
4. `npm test` — `lib/brands.test.ts` checks handles and owners are unique.

Brands ship with the web deploy; installed apps pick them up with the next
build.

Foku (`/b/foku`) is Karan Seth's brand.

# Orders

An order is a small agreement pinned to the chat between a buyer and a seller:
what was asked for, where it has got to, and how it ended. There is no
checkout and no payment — those are agreed in the chat.

## The flow, and why it is loose

`Requested → Confirmed → Making → Ready → Done` (or `Cancelled`).

- The seller can put an open order at **any** stage, forwards or back.
- **Either** side can finish it: the seller marks it handed over, or the buyer taps *Got it*.
- Either side can cancel an open order; the seller can **reopen** a finished or cancelled one.
- The **pickup code** (4 digits, buyer-only) is proof, never a gate. Entering it
  marks the handover as checked; finishing without it still finishes.

The rules live in one pure module, `lib/orders/model.ts`, used by the server to
validate and by the card to decide which buttons to show (`lib/orders/model.test.ts`).

## Ordering is messaging

Placing an order sends the seller a first message ("Hi Sanvi! I'd like to order…").
Every later step posts a one-line update from whoever took it. All of them go
through `postMessage` in `app/api/_lib/messaging.ts`, so blocks, rooms,
suspensions, "not taking messages" and the rate limits apply to orders exactly
as to chats. The chat is the order's notification (badge + inbox preview), its
history, and its fallback for app versions that predate orders — they see plain
sentences. New clients draw step messages as quiet one-line updates; the ids
come from each order's `history`.

## Where things are

| Piece | File |
|---|---|
| Rules, wording | `lib/orders/model.ts` |
| Server (create, step, pickup code) | `app/api/_lib/orders.ts` → `/api/rpc/order_create · order_update · order_code` |
| Client store, realtime, demo backend | `lib/orders/store.ts` |
| Order sheet | `components/orders/OrderSheet.tsx` |
| Card pinned in the chat | `components/orders/OrderCard.tsx` (in `ChatThread`) |
| Actions (shared by card, row, sheet) | `components/orders/OrderActions.tsx` |
| Full order sheet | `components/orders/OrderDetailSheet.tsx` |
| Inventory → Orders (the store's counter) | `components/orders/OrdersManager.tsx` |
| Pills / counts / labels that pop on change | `components/orders/Pop.tsx` |
| "Order" + Message · Email · WhatsApp on a listing | `components/ContactChannels.tsx` in `ItemDetailScreen` |

## The table

`orders` is defined in `db/appwrite/appwrite.json`. No table-level grants: only
the server writes, and each row carries exactly `read("user:buyer")` +
`read("user:seller")`. Create it with a key that has `tables.write`:

```
set -a && . db/appwrite/appwrite.env && set +a
node db/appwrite/tools/push-schema.mjs --only orders
```

Until the table exists the feature hides itself: the store sees `404
table_not_found`, and the Order button only appears once a member's orders have
loaded.

## Testing

`?demo=1` runs orders in memory: placing one gets a confirmation from the
"seller" a few seconds later, and Inventory → Orders has one incoming order to
try the seller's side. Against the real backend, use throwaway users and the
local dev server (see the probe pattern in HANDOFF.md → Messaging).

## The store's counter (Inventory → Orders)

Shown to anyone who sells something (so a student running a store sees where
orders will land before the first one) and to anyone who has ordered. Selling
and Buying sides; filters with live counts (New · In progress · Ready · Done ·
Cancelled); most urgent first — new requests, then ready ones awaiting
collection, then work in hand by ready-by date, oldest request first. Each row:
who, when it came in, total, status, ready-by (or pickup once ready, or
"Overdue"), and the next step plus a chat button right on the row. A tap opens
the full order sheet: placed date, quantity, total, note, ready-by, pickup,
handover proof, the full history, and every action. "Handed over" from a row
opens the sheet straight at the pickup-code field.

## Contact row on a listing

Always the same order, always all of them, labelled: **Order** (or the post's
own action) · **Message** · **Email** · **WhatsApp**. A channel the seller
hasn't shared stays visible but faded and explains itself when tapped
("Priya hasn't shared WhatsApp. Message them on Wecycle instead."). Signed
out, every channel leads to sign-in.

## Motion

After HyperFrames' press-release-spring, spring-pop-entrance, scale-swap and
waterfall rules, on Wecycle's tokens: presses squeeze linearly (`--dur-1`) and
spring back on `--spring-bouncy`; a status, count or label pops only when it
CHANGES (`Pop.tsx`), never on first paint; rows arrive on `--ease-enter` with a
45 ms stagger capped at 8; progress fills slide in from the left; a handover
stamps a lime check. Reduced motion turns all of it off.

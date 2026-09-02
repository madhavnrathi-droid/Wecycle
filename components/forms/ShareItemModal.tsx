'use client';

import { useRef, useState } from 'react';
import { normalizeLink, linkHost } from '../../lib/postLink';
import { findObjectionable, objectionableMessage } from '../../lib/contentFilter';
import { MapPin, Bell, Link2, ChevronRight } from 'lucide-react';
import Modal from '../Modal';
import PhotoPicker, { type PhotoPickerHandle } from '../PhotoPicker';
import { createListingWithMedia } from '../../lib/liveData';
import {
  COMP_META, COMP_OPTIONS, RATE_PERIODS, RATE_BASIS_OPTIONS,
  OPP_ROLE_META, OPP_ROLE_OPTIONS,
  compToListing, opportunityCompLabel,
  type Comp, type RatePeriod, type OppRole,
} from '../../lib/opportunity';
import { isDemoMode } from '../../lib/demoMode';
import { hasSupabaseEnv } from '../../lib/supabase';
import { track, EVT } from '../../lib/analytics';
import {
  DEAL_TYPES, RENT_PERIODS, DEFAULT_RENT_PERIOD, toListingType,
  type DealType, type RentPeriod,
} from '../../lib/dealTypes';
import { haptics } from '../../lib/haptics';

/* The taxonomy lives in lib/categories — one list for the chips, the rails and
   every post form. This file used to carry its own copy, which had already
   drifted from the chips, so a member could file a post under a category the
   feed had no way to show. */
import { CATEGORIES } from '../../lib/categories';

/* Condition slider — 5 stops with an animated emoji face per stop. Stored as
   one of the three Supabase enum values, but the user picks via a colorful
   left-to-right slider. The "worst" is just "fair" (not terrible) — by design
   we don't ask users to grade their own stuff harshly. */
const CONDITION_STOPS = [
  { value: 'fair',     emoji: '😅', label: 'Used',       color: '#F87171' },  // red
  { value: 'fair',     emoji: '🙂', label: 'OK',         color: '#FB923C' },  // orange
  { value: 'good',     emoji: '😊', label: 'Good',       color: '#FACC15' },  // yellow
  { value: 'good',     emoji: '😃', label: 'Great',      color: '#86EFAC' },  // mint
  { value: 'like_new', emoji: '🤩', label: 'Like new',   color: '#22C55E' },  // green
] as const;

interface ShareItemModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (data: ShareItemForm) => void;
  /* 'item' (default) = share a physical thing. 'service' = offer a service,
     which posts as an opportunity: no condition, pricing reads as a rate, and
     the category defaults to Services. Reuses this whole form + backend path. */
  mode?: 'item' | 'service';
}

export interface ShareItemForm {
  title: string;
  category: string;
  condition: string;
  description: string;
  location: string;
  /* How the thing changes hands. Replaces the old two-way free/sell toggle —
     the enum has carried swap and borrow all along, they were just unreachable. */
  deal: DealType;
  rentPeriod: RentPeriod;
  deposit?: number;
  swapFor: string;
  price?: number;
  photos: string[];
  /* Optional outbound link, exactly as typed. Normalised on submit, not on
     every keystroke — rewriting the box while someone is mid-URL is the same
     mistake the email field made. */
  link: string;
  linkOnPhoto: boolean;
  /* Service (opportunity) compensation — only used in mode="service".
     Every field below `comp` is optional: a paid gig can be posted with no
     amount, no range and no period, and reads as "Rate on ask". */
  comp: Comp;
  /* Which way round the post points — hiring someone, or offering yourself.
     Asked first, because it changes what everything below it means. */
  oppRole: OppRole;
  ratePeriod?: RatePeriod;
  /* Upper end of the rate range; `price` is the lower end. Both optional, and
     either alone is meaningful. The old four-bucket priceBand is retired —
     see the Rate block below. */
  priceMax?: number;
}

const MAX_PHOTOS = 3;

export default function ShareItemModal({ open, onClose, onSubmit, mode = 'item' }: ShareItemModalProps) {
  const isService = mode === 'service';
  const [form, setForm] = useState<ShareItemForm>({
    title: '', category: isService ? 'Services' : '', condition: '', description: '',
    link: '', linkOnPhoto: false,
    location: '', deal: 'free', rentPeriod: DEFAULT_RENT_PERIOD, swapFor: '',
    photos: [], comp: 'free', oppRole: 'offering',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ShareItemForm, string>>>({});
  const [notifyOnEngagement, setNotifyOnEngagement] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pickerRef = useRef<PhotoPickerHandle>(null);
  /* Host of the link as typed, or null while it isn't a link yet. Drives both
     the confirmation hint and whether the photo toggle is offered at all. */
  const normalizedLink = normalizeLink(form.link);
  const linkPreviewHost = normalizedLink ? linkHost(normalizedLink) : null;

  const update = <K extends keyof ShareItemForm>(key: K, value: ShareItemForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  /* The only invalid rate is a backwards one. Caught here so the DB's
     listings_price_max_check can never be what tells the user. */
  const rateRangeBackwards =
    typeof form.price === 'number' && typeof form.priceMax === 'number'
    && form.priceMax < form.price;

  const validate = () => {
    const e: typeof errors = {};
    if (rateRangeBackwards) e.priceMax = 'The second number should be the higher one.';
    if (!form.title.trim()) e.title = 'Required';
    /* Category and pickup location are no longer gates. Both are nullable in
       the database, both can be added by editing the post, and neither is
       something the poster is missing — they are things the FORM was insisting
       on before it would accept a photo and a name. Condition was already
       optional and defaults to 'good' on submit. */
    /* An unusable link is an error, never a silent drop. Posting without the
       link someone deliberately attached is worse than telling them it's wrong. */
    if (form.link.trim() && !normalizeLink(form.link)) {
      e.link = 'That doesn’t look like a web address. Try example.com/page';
    }
    /* Guideline 1.2 asks for a method of FILTERING objectionable content, not
       only for reporting it after the fact. Checked here so the refusal is
       attached to the field that caused it; enforced again by a database
       trigger, since this check runs on the client. */
    const badTitle = findObjectionable(form.title);
    if (badTitle) e.title = objectionableMessage(badTitle);
    const badDesc = findObjectionable(form.description);
    if (badDesc) e.description = objectionableMessage(badDesc);
    /* Price is now OPTIONAL even when listing as Sell — empty → "Selling" label. */
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const reset = () => {
    setForm({
      title: '', category: isService ? 'Services' : '', condition: '', description: '', link: '', linkOnPhoto: false, location: '', deal: 'free', rentPeriod: DEFAULT_RENT_PERIOD, swapFor: '', photos: [], comp: 'free', oppRole: 'offering',
    });
    setNotifyOnEngagement(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (hasSupabaseEnv && !isDemoMode()) {
        /* Real path: upload the picker's compressed blobs + insert the row.
           Default condition to 'good' when the user didn't slide. */
        /* Service posts derive listing_type/price from the compensation
           choice; item posts use the free/sell pricing toggle. */
        const svc = compToListing(form.comp, form.price);
        await createListingWithMedia({
          title: form.title,
          category: form.category,
          condition: (form.condition || 'good') as 'like_new' | 'good' | 'fair',
          description: form.description,
          location: form.location,
          listingType: isService ? svc.listingType : toListingType(form.deal),
          price: isService ? svc.price : form.price,
          ...(isService ? {} : {
            rentPeriod: form.deal === 'rent' ? form.rentPeriod : undefined,
            deposit:    form.deal === 'rent' ? form.deposit    : undefined,
            swapFor:    form.deal === 'swap' ? form.swapFor    : undefined,
          }),
          media: pickerRef.current?.getMedia() ?? [],
          linkUrl: normalizeLink(form.link),
          linkOnPhoto: form.linkOnPhoto,
          notifyOnEngagement,
          kind: isService ? 'opportunity' : 'item',
          ...(isService ? {
            comp: form.comp,
            oppRole: form.oppRole,
            ratePeriod: form.comp === 'paid' ? form.ratePeriod : undefined,
            priceMax:   form.comp === 'paid' ? form.priceMax   : undefined,
          } : {}),
        });
      } else {
        /* Demo path — no backend; just simulate latency. */
        await new Promise(r => setTimeout(r, 400));
      }
      haptics.success();
      track(EVT.post_form_submitted, {
        post_kind: isService ? 'service' : 'share',
        listing_type: isService ? (form.comp === 'paid' ? 'sell' : 'free') : toListingType(form.deal),
        ...(isService ? {} : { deal_type: form.deal }),
        ...(isService ? {
          comp: form.comp,
          opp_role: form.oppRole,
          rate_period: form.comp === 'paid' ? (form.ratePeriod ?? null) : null,
          has_rate_range: form.comp === 'paid' && typeof form.priceMax === 'number',
        } : {}),
        has_photos: form.photos.length > 0,
        photo_count: form.photos.length,
        has_price: isService
          ? (form.comp === 'paid' && typeof form.price === 'number')
          : ((form.deal === 'sell' || form.deal === 'rent') && typeof form.price === 'number'),
        ...(isService ? {} : {
          has_deposit: form.deal === 'rent' && typeof form.deposit === 'number',
          has_swap_ask: form.deal === 'swap' && form.swapFor.trim().length > 0,
        }),
        has_description: form.description.trim().length > 0,
        category: form.category,
      });
      onSubmit?.(form);
      pickerRef.current?.clear();
      reset();
      onClose();
    } catch (err) {
      haptics.error();
      track(EVT.post_form_failed, {
        post_kind: isService ? 'service' : 'share',
        reason: (err as Error).message?.slice(0, 80),
      });
      setSubmitError((err as Error).message || 'Could not post — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isService
          /* The heading has to follow the fork: calling a job ad "Offer a
             service" contradicts what the user just told us. */
          ? (form.oppRole === 'hiring' ? 'Post a job or gig' : 'Offer a service')
          : 'Share an item'
      }
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            type="submit" form="share-item-form"
            disabled={submitting}
            className="btn btn-gradient"
            style={{ flex: 2 }}
          >
            {submitting
              ? (isService ? 'Posting…' : 'Sharing…')
              : isService
                ? (form.oppRole === 'hiring' ? 'Post the job' : 'Post opportunity')
                : 'Share with community'}
          </button>
        </>
      }
    >
      <form id="share-item-form" onSubmit={handleSubmit} noValidate>

        {/* ── PHOTOS at top — visual content first ── */}
        <section style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>
              Photos <span className="field-hint" style={{ fontWeight: 400, marginLeft: 4 }}>({form.photos.length} / {MAX_PHOTOS})</span>
            </label>
            {form.photos.length === 0 && (
              <span className="field-hint">Optional — first is cover</span>
            )}
          </div>

          {/* PhotoPicker now shows its own large preview, so no separate
              carousel preview here (it was duplicating the image). */}
          <PhotoPicker
            ref={pickerRef}
            photos={form.photos}
            onChange={next => update('photos', next)}
            max={MAX_PHOTOS}
          />
        </section>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="si-title" className="field-label">
            Title <span className="required" aria-hidden="true">*</span>
          </label>
          <input
            id="si-title"
            className="form-input"
            placeholder={isService ? 'e.g. Physics Tutoring, Bicycle Repair' : 'e.g. Physics Textbook 12th Edition'}
            value={form.title}
            onChange={e => update('title', e.target.value)}
            aria-required="true"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'si-title-err' : undefined}
          />
          {errors.title && <span id="si-title-err" className="field-error">{errors.title}</span>}
        </div>


        {isService ? (
          /* ── Compensation: Volunteer / Free / Paid (+ price bands) ── */
          <>
          {/* ── Hiring, or offering? ──
              The board carries both directions and, until this existed, had no
              way to tell them apart — a post titled "Marketing Specialist
              Needed" was badged SERVICE because "service offered" was the only
              thing the data could express. Asked first because it reframes
              everything under it. */}
          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 14px' }}>
            <legend className="field-label" style={{ marginBottom: 8 }}>What kind of post is this?</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {OPP_ROLE_OPTIONS.map(r => (
                <button
                  key={r}
                  type="button"
                  className="option-card"
                  aria-pressed={form.oppRole === r}
                  onClick={() => update('oppRole', r)}
                >
                  <span style={{ fontSize: 'calc(20px * var(--text-scale))' }} aria-hidden="true">{OPP_ROLE_META[r].emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: 'calc(13px * var(--text-scale))' }}>{OPP_ROLE_META[r].label}</span>
                  <span style={{ fontSize: 'calc(10.5px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.3, textAlign: 'center' }}>
                    {OPP_ROLE_META[r].blurb}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 14px' }}>
            <legend className="field-label" style={{ marginBottom: 8 }}>
              {form.oppRole === 'hiring' ? 'What you’re paying' : 'Compensation'}
            </legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {COMP_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  className="option-card"
                  aria-pressed={form.comp === c}
                  onClick={() => update('comp', c)}
                >
                  <span style={{ fontSize: 'calc(20px * var(--text-scale))' }} aria-hidden="true">{COMP_META[c].emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: 'calc(13px * var(--text-scale))' }}>{COMP_META[c].label}</span>
                  <span style={{ fontSize: 'calc(10.5px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.3, textAlign: 'center' }}>{COMP_META[c].blurb}</span>
                </button>
              ))}
            </div>
            {/* ── Rate ──
                Rebuilt on the pattern every big job platform converges on:
                a BASIS (what the money is per) plus a RANGE (from–to). LinkedIn
                asks for "either a salary or a salary range" and requires the pay
                period alongside it; Indeed's guidance is the same shape
                ("₹22–₹25/hour"); Upwork's first fork is hourly-vs-fixed, which
                is why "Fixed for the job" is one of the basis choices rather
                than a separate concept.

                Two things we do differently, on purpose:
                  - No dropdowns. LinkedIn puts Amount and Frequency behind two
                    selects, which hides the options and is slow on a phone.
                    Pills show every choice at once and toggle off when tapped.
                  - We say out loud that a rate gets more replies. Leaving pay
                    blank is allowed everywhere and costs the poster dearly —
                    around 60% of people won't apply to a post with no pay — yet
                    no platform mentions it. Still optional; just not silent.

                The four fixed bands (Under ₹200 / ₹200–500 / …) are gone: they
                couldn't express anything outside four buckets and stopped making
                sense next to a period. Old rows carrying one still render. */}
            {form.comp === 'paid' && (
              <div style={{
                marginTop: 12, padding: '14px 14px 16px',
                background: 'var(--bg-inset)', borderRadius: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <span className="field-label" style={{ margin: 0 }}>Rate</span>
                  <span className="field-hint" style={{ fontWeight: 400, textAlign: 'right' }}>
                    Optional — but a rate gets more replies
                  </span>
                </div>

                {/* Basis first: it makes the amounts below unambiguous. */}
                <div className="field-hint" style={{ fontWeight: 400, marginBottom: 6 }}>Paid per</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                  {RATE_BASIS_OPTIONS.map(id => {
                    const meta = RATE_PERIODS.find(p => p.id === id)!;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`pill ${form.ratePeriod === id ? 'pill-active' : ''}`}
                        aria-pressed={form.ratePeriod === id}
                        onClick={() => setForm(f => ({ ...f, ratePeriod: f.ratePeriod === id ? undefined : id }))}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>

                {/* A real range. Either end alone is meaningful, so neither
                    input requires the other. */}
                <div className="field-hint" style={{ fontWeight: 400, marginBottom: 6 }}>
                  {form.ratePeriod === 'project' ? 'Budget' : 'How much'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden="true" style={{ fontSize: 'calc(15px * var(--text-scale))', fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>₹</span>
                  <input
                    id="si-price"
                    type="number" inputMode="numeric" min="0"
                    className="form-input"
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="From"
                    aria-label="Rate from (optional)"
                    value={form.price ?? ''}
                    onChange={e => update('price', Number(e.target.value) || undefined)}
                  />
                  <span aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>–</span>
                  <input
                    type="number" inputMode="numeric" min="0"
                    className="form-input"
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="To"
                    aria-label="Rate up to (optional)"
                    value={form.priceMax ?? ''}
                    onChange={e => update('priceMax', Number(e.target.value) || undefined)}
                  />
                </div>
                {rateRangeBackwards && (
                  <span className="field-hint" style={{ color: 'var(--accent-rose)', marginTop: 6, display: 'block' }}>
                    The second number should be the higher one.
                  </span>
                )}

                {/* What the card will actually say. No platform shows this, and
                    it is the only way to know your rate reads the way you meant
                    before you publish it. */}
                <div style={{
                  marginTop: 12, paddingTop: 10,
                  borderTop: '1px solid var(--border-subtle)',
                  fontSize: 'calc(12px * var(--text-scale))', color: 'var(--text-muted)',
                }}>
                  Shows on your post as{' '}
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                    {opportunityCompLabel({
                      comp: 'paid',
                      price: form.price ?? null,
                      priceMax: form.priceMax ?? null,
                      ratePeriod: form.ratePeriod ?? null,
                    })}
                  </strong>
                </div>
              </div>
            )}
          </fieldset>
          </>
        ) : (
          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 14px' }}>
            <legend className="field-label" style={{ marginBottom: 8 }}>How are you sharing it?</legend>

            {/* Four ways, 2x2. The enum has carried swap and borrow since the
                beginning; the form only ever offered two of them, so renting a
                drill or swapping a calculator — the two most campus-shaped
                transactions there are — simply could not be posted.

                A 2x2 grid rather than four across: at 375px, four option-cards
                in a row leaves ~80px each, which cannot hold a label and a
                blurb without wrapping mid-word. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {DEAL_TYPES.map(d => (
                <button
                  key={d.id}
                  type="button"
                  className="option-card"
                  aria-pressed={form.deal === d.id}
                  onClick={() => { haptics.selection(); update('deal', d.id); }}
                >
                  <span style={{ fontSize: 'calc(20px * var(--text-scale))' }} aria-hidden="true">{d.emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: 'calc(13px * var(--text-scale))' }}>{d.label}</span>
                  <span style={{ fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.3, textAlign: 'center' }}>
                    {d.blurb}
                  </span>
                </button>
              ))}
            </div>

            {/* The money changes with the choice and nothing else does. Only the
                fields this deal actually needs are rendered — a give-away shows
                none at all, which is the shortest the form can be and is also
                the commonest case. */}
            {form.deal === 'sell' && (
              <div className="field" style={{ marginTop: 10 }}>
                <label htmlFor="si-price" className="field-label" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span>Price (₹)</span>
                  <span className="field-hint" style={{ fontWeight: 400 }}>Leave blank for &quot;Ask&quot;</span>
                </label>
                <input
                  id="si-price"
                  type="number" inputMode="numeric" min="0"
                  className="form-input"
                  placeholder="e.g. 500"
                  value={form.price ?? ''}
                  onChange={e => update('price', Number(e.target.value) || undefined)}
                />
              </div>
            )}

            {form.deal === 'rent' && (
              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                {/* Rate and unit on one row: "₹200 per day" is a single thought
                    and splitting it over two labelled fields makes it read as
                    two decisions. */}
                <div className="field">
                  <label htmlFor="si-rate" className="field-label">Rate</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 8, alignItems: 'center' }}>
                    <input
                      id="si-rate"
                      type="number" inputMode="numeric" min="0"
                      className="form-input"
                      placeholder="₹ e.g. 200"
                      value={form.price ?? ''}
                      onChange={e => update('price', Number(e.target.value) || undefined)}
                      style={{ minWidth: 0 }}
                    />
                    <span style={{ fontSize: 'calc(13px * var(--text-scale))', color: 'var(--text-secondary)' }}>per</span>
                    <select
                      aria-label="Rental period"
                      className="form-select"
                      value={form.rentPeriod}
                      onChange={e => update('rentPeriod', e.target.value as RentPeriod)}
                      style={{ width: 104 }}
                    >
                      {RENT_PERIODS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="si-deposit" className="field-label" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span>Deposit (₹)</span>
                    <span className="field-hint" style={{ fontWeight: 400 }}>Refundable — optional</span>
                  </label>
                  <input
                    id="si-deposit"
                    type="number" inputMode="numeric" min="0"
                    className="form-input"
                    placeholder="e.g. 1000"
                    value={form.deposit ?? ''}
                    onChange={e => update('deposit', Number(e.target.value) || undefined)}
                  />
                  {/* Stated plainly because a deposit is the thing that makes
                      handing an expensive object to a stranger thinkable, and
                      because a renter who thinks it is a fee will not enquire. */}
                  <span className="field-hint" style={{ fontWeight: 400 }}>
                    Held while they have it, returned when you get it back.
                  </span>
                </div>
              </div>
            )}

            {form.deal === 'swap' && (
              <div className="field" style={{ marginTop: 10 }}>
                <label htmlFor="si-swap" className="field-label">What would you like in return?</label>
                <input
                  id="si-swap"
                  className="form-input"
                  /* Category-shaped, not object-shaped: people rarely want one
                     exact thing, and a swap post that names one gets no replies. */
                  placeholder="e.g. any scientific calculator, art supplies"
                  value={form.swapFor}
                  onChange={e => update('swapFor', e.target.value)}
                  maxLength={280}
                />
                <span className="field-hint" style={{ fontWeight: 400 }}>
                  Leave blank and it posts as open to offers.
                </span>
              </div>
            )}
          </fieldset>
        )}

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="si-desc" className="field-label">Description</label>
          <textarea
            id="si-desc"
            className="form-textarea"
            placeholder={isService ? 'What you offer, experience, availability…' : 'Condition notes, accessories, anything to mention…'}
            value={form.description}
            onChange={e => update('description', e.target.value)}
            maxLength={500}
          />
          {errors.description
            ? <span className="field-error">{errors.description}</span>
            : <span className="field-hint">{form.description.length}/500 characters</span>}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="si-cat" className="field-label">
            Category
          </label>
          <select
            id="si-cat"
            className="form-select"
            value={form.category}
            onChange={e => update('category', e.target.value)}
            aria-invalid={!!errors.category}
          >
            <option value="">Pick one — helps people find it</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          {errors.category && <span className="field-error">{errors.category}</span>}
        </div>


        {/* ── Everything else, folded away ─────────────────────────────────
            The flow people already know is Instagram's: pick the photo, write
            the caption, post. Everything beyond that is a row you can ignore.
            This form asked for nine things up front, three of them required,
            which is why posting felt long — not because any single field was
            hard, but because the whole list had to be read before the button
            at the bottom could be trusted.

            What stays above the fold is what a buyer scrolling the feed
            actually decides on: the photo, what it is, what it costs. Condition,
            pickup point and a link matter once someone is interested, and they
            are one tap away rather than nine fields deep. */}
        <details style={{ marginBottom: 14 }}>
          <summary style={{
            display: 'flex', alignItems: 'center', gap: 8,
            minHeight: 44, cursor: 'pointer', listStyle: 'none',
            fontSize: 'calc(13.5px * var(--text-scale))', fontWeight: 600, color: 'var(--text-secondary)',
            userSelect: 'none',
          }}>
            <ChevronRight size={15} strokeWidth={2.2} className="details-chevron" aria-hidden="true" />
            Add more details
            <span style={{ fontWeight: 400, fontSize: 'calc(12.5px * var(--text-scale))', color: 'var(--text-muted)' }}>
              condition, pickup, link
            </span>
          </summary>
          <div style={{ paddingTop: 12 }}>
        {/* Colored condition slider — optional. Hidden for services, where an
            item's physical condition is meaningless. */}
        {!isService && (
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span>Condition</span>
              <span className="field-hint" style={{ fontWeight: 400 }}>Optional</span>
            </label>
            <ConditionSlider
              value={form.condition}
              onChange={v => update('condition', v)}
            />
          </div>
        )}
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="si-loc" className="field-label">
            <MapPin size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
            {isService ? 'Location' : 'Pickup location'}
          </label>
          <input
            id="si-loc"
            className="form-input"
            placeholder={isService ? 'e.g. Online, or Meera Bhawan' : 'e.g. Meera Bhawan, Block 15'}
            value={form.location}
            onChange={e => update('location', e.target.value)}
            aria-invalid={!!errors.location}
          />
          {errors.location && <span className="field-error">{errors.location}</span>}
        </div>
        {/* Link — optional, and quiet until used. Any URL typed into the
            description above also becomes tappable on the post; this field is
            for the one link that deserves its own button. */}
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="si-link" className="field-label">
            <Link2 size={11} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
            Link <span className="field-hint" style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="si-link"
            type="url"
            inputMode="url"
            className="form-input"
            placeholder="example.com/page"
            value={form.link}
            maxLength={500}
            onChange={e => update('link', e.target.value)}
            aria-invalid={!!errors.link}
            autoComplete="off"
          />
          {errors.link ? (
            <span className="field-error">{errors.link}</span>
          ) : linkPreviewHost ? (
            <span className="field-hint">Opens {linkPreviewHost} in a new tab.</span>
          ) : (
            <span className="field-hint">A page, form, or portfolio. Shown as a button on your post.</span>
          )}

          {/* Only offered once both halves exist. A photo-link with no photo is
              a setting that does nothing, and a toggle that does nothing is
              worse than no toggle. */}
          {linkPreviewHost && form.photos.length > 0 && (
            <button
              type="button"
              aria-pressed={form.linkOnPhoto}
              onClick={() => update('linkOnPhoto', !form.linkOnPhoto)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                marginTop: 10, padding: '10px 12px',
                borderRadius: 'var(--radius-md)', border: 'none',
                background: form.linkOnPhoto ? 'rgba(0,137,57,0.10)' : 'var(--bg-inset)',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 34, height: 20, borderRadius: 999, flexShrink: 0,
                  background: form.linkOnPhoto ? '#008939' : 'var(--border-default)',
                  position: 'relative', transition: 'background 160ms ease',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: form.linkOnPhoto ? 16 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 160ms ease',
                }} />
              </span>
              <span style={{ fontSize: 'calc(13px * var(--text-scale))', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                Open the link when the photo is tapped
                <span style={{ display: 'block', fontSize: 'calc(11.5px * var(--text-scale))', fontWeight: 400, color: 'var(--text-muted)' }}>
                  The photo gets a {linkPreviewHost} badge so people know before they tap.
                </span>
              </span>
            </button>
          )}
        </div>
        {/* ── Engagement notification toggle ── */}
        <NotifyToggle
          checked={notifyOnEngagement}
          onChange={setNotifyOnEngagement}
          label="Alert me when someone comments"
          onClose={onClose}
        />
          </div>
        </details>



        {submitError && (
          <div role="alert" style={{
            marginTop: 4, padding: '10px 12px',
            background: 'rgba(237,46,80,0.10)',
            border: '1px solid rgba(237,46,80,0.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-rose)',
            fontSize: 'calc(12px * var(--text-scale))', fontWeight: 500,
          }}>
            {submitError}
          </div>
        )}

      </form>
    </Modal>
  );
}

/* ── Engagement notification toggle (shared across post modals) ─────────────
   A simple inline toggle row with a Bell icon. No Radix dependency — built
   from a native <input type="checkbox"> styled as a pill switch so it matches
   the existing form-row visual language without pulling in a new library. */
function NotifyToggle({
  checked, onChange, label, onClose,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  onClose: () => void;
}) {
  return (
    <div style={{
      margin: '18px 0 4px',
      padding: '12px 14px',
      background: 'var(--bg-inset)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-subtle, rgba(255,255,255,0.07))',
    }}>
      {/* Row: icon + label + pill switch */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer', userSelect: 'none',
      }}>
        <Bell size={15} strokeWidth={2} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 'calc(13px * var(--text-scale))', fontWeight: 500, color: 'var(--text-primary)' }}>
          {label}
        </span>
        {/* Pill toggle — CSS-only, no JS beyond the onChange */}
        <span style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            aria-label={label}
            style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          />
          <span style={{
            position: 'absolute', inset: 0,
            borderRadius: 999,
            background: checked ? 'var(--accent-green, #A8DD00)' : 'var(--border-subtle, rgba(255,255,255,0.15))',
            transition: 'background 200ms',
            cursor: 'pointer',
          }} onClick={() => onChange(!checked)} />
          <span style={{
            position: 'absolute',
            top: 3, left: checked ? 21 : 3,
            width: 16, height: 16,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'left 200ms cubic-bezier(.2,.8,.2,1)',
            pointerEvents: 'none',
          }} />
        </span>
      </label>

      {/* Hint */}
      <p style={{ margin: '6px 0 0 25px', fontSize: 'calc(11px * var(--text-scale))', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {"We'll send a push notification if you've turned that on in Settings, or an email otherwise."}
        {' '}
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none', border: 'none', padding: 0,
            color: 'var(--accent-primary, #A8DD00)',
            fontSize: 'calc(11px * var(--text-scale))', fontWeight: 600, cursor: 'pointer',
            textDecoration: 'underline', textDecorationStyle: 'dotted',
          }}
        >
          Manage in Settings → Notifications
        </button>
      </p>
    </div>
  );
}

/* ── Animated condition slider ──────────────────────
   Five stops along a red→green gradient. Picking a stop animates the emoji
   above the thumb (bounces up + scales briefly). value is one of the three
   Supabase enum values; we round to the nearest enum when storing. */
function ConditionSlider({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const initial = Math.max(0, CONDITION_STOPS.findIndex(s => s.value === value));
  const [idx, setIdx] = useState(initial >= 0 ? initial : 2);
  const [bump, setBump] = useState(0);
  const stop = CONDITION_STOPS[idx];
  const pct = (idx / (CONDITION_STOPS.length - 1)) * 100;

  return (
    <div style={{ padding: '4px 0 8px' }}>
      <div style={{ position: 'relative', height: 56 }}>
        {/* Floating emoji label above the thumb */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `calc(${pct}% - 18px)`,
            top: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            transition: 'left 200ms cubic-bezier(.2,.8,.2,1), transform 240ms',
            transform: `translateY(${bump ? -2 : 0}px) scale(${bump ? 1.18 : 1})`,
            fontSize: 'calc(22px * var(--text-scale))', lineHeight: 1, userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          <span>{stop.emoji}</span>
          <span style={{
            fontSize: 'calc(10px * var(--text-scale))', fontWeight: 700, marginTop: 2,
            color: stop.color, letterSpacing: '-0.01em',
          }}>{stop.label}</span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={CONDITION_STOPS.length - 1}
        step={1}
        value={idx}
        onChange={e => {
          const v = Number(e.target.value);
          setIdx(v);
          setBump(b => b + 1);
          setTimeout(() => setBump(0), 220);
          onChange(CONDITION_STOPS[v].value);
        }}
        aria-label="Condition"
        style={{
          width: '100%',
          appearance: 'none',
          WebkitAppearance: 'none',
          height: 10,
          borderRadius: 999,
          background: 'linear-gradient(to right, #F87171 0%, #FB923C 25%, #FACC15 50%, #86EFAC 75%, #22C55E 100%)',
          outline: 'none',
          cursor: 'pointer',
        }}
      />
      <style jsx>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px; height: 22px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid ${stop.color};
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
          cursor: pointer;
          transition: transform 0.15s;
        }
        input[type='range']::-webkit-slider-thumb:hover { transform: scale(1.08); }
        input[type='range']::-moz-range-thumb {
          width: 22px; height: 22px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid ${stop.color};
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

# DESIGN.md — MoneyWatch Pro

> Written 2026-09-26 as part of antislop audit-001, finding #7. This document
> transcribes the visual identity **already present and consistent** across
> the existing app (`public/css/main.css`, `public/index.html`) — it does not
> invent new direction. If any line here misreads the intent behind an
> existing screen, correct it directly; this file should track what the
> product actually is, not aspire to something else.

## Identity

MoneyWatch Pro is a quantitative analytics terminal for the Indonesian Stock
Exchange (IDX/BEI): Smart Money / Bandarmology detection, Benjamin Graham-style
intrinsic valuation, dividend tax (PMK 18) management, and an autonomous
paper-trading research engine. It presents itself as an **institutional
trading terminal**, not a consumer investing app — dense, numeric,
mono-spaced data over friendly illustration.

## Personality

- Precise and data-dense over friendly and spacious. Font sizes run small
  (base `12.5px`); the product trusts its user to read numbers, not be
  onboarded gently.
- Quantitative rigor as the actual brand promise, not just an aesthetic:
  `CLAUDE.md` rule #1 ("Zero Fabricated Data") is a real, enforced product
  value, and the UI should never claim more certainty than the underlying
  data supports (see the disclosure pattern below).
- Dark-first: the primary theme is dark navy, matching the "trading terminal"
  identity (real reason — R-21 in the antislop core — not "dark looks tech").
  A full light theme exists and must stay equally correct (`theme-light`
  overrides throughout `main.css`).

## Palette

Defined as CSS custom properties in `main.css:2` (dark) and `main.css:70`
(light, under `.theme-light`):

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` / `--bg2..5` | `#030712` → `#1E293B` | `#F5F7FA` → `#CBD1D8` | Surface layers |
| `--text` / `--text2` / `--text3` | white → grey | near-black → grey | Text hierarchy |
| `--accent` | `#5B8DEF` | `#0000FF` | Bare text/icons on the page |
| `--accent-blue` | `#38BDF8` | `#0F69FF` | Filled backgrounds, links, telemetry accents |
| `--green` | `#00C805` | `#00873C` | Gains, "up", accumulation — semantic, not decorative |
| `--red` | `#FF333A` | `#D0163A` | Losses, "down", distribution — semantic, not decorative |
| amber (`rgba(245,158,11,*)`) | — | — | Reserved for honest disclosure ("data simulasi", "contoh tampilan") — do not reuse this color for anything that isn't a disclosure |

Core palette stays at 2-3 colors (bg/text neutrals + one blue accent) plus the
green/red pair, which is a finance-standard semantic convention, not an
arbitrary "too many colors" violation (R-29 exempts industry-semantic color).

## Typography

- UI text: `Inter` (`main.css:124`). Chosen for legibility at small sizes
  across a data-dense interface, not as an unexamined AI default — this app
  runs almost entirely at 10-13px.
- Numeric/data values and the landing page's "telemetry" flavor text: monospace
  (`var(--font-mono)`, `ui-monospace`/`SFMono-Regular`/`Menlo` stack). Reserved
  for values and status readouts, matching a real trading-terminal convention
  (ticker tapes, HUDs) — not decoration.

## Icons

Tabler Icons (`ti ti-*`), picked per-instance for relevance to the label next
to them (`ti-shield-check` for a security claim, `ti-chart-dots` for
analytics, `ti-cpu` for an engine reference) rather than generic
sparkle/magic/robot glyphs.

## Mood & Honesty Pattern

The one recurring UI pattern that IS load-bearing brand identity, not
decoration: an amber-tinted disclosure box/tag
(`background: rgba(245,158,11,0.08-0.1)`, `border: 1px solid
rgba(245,158,11,0.25)`) used whenever data is simulated, unavailable, or
illustrative rather than real. This pattern exists in the Bandarmology
widgets, the AI Autonomous Trading opportunity card ("win-rate historis belum
divalidasi backtest"), and now the auth screen's example telemetry card
(antislop audit-001 #1). Any new screen that shows a number it cannot back
with real data should reuse this exact pattern rather than inventing a new
one.

## Dials

- **ENERGY: 2** (Stripe/Vercel register). The landing/auth screens carry real
  flourish (gradient hero text, a glowing primary CTA, atmospheric
  background), but the main app (the ~45 feature pages behind login) is
  intentionally closer to ENERGY 1 — a dense terminal, not a marketing site.
  Treat the landing/auth screens and the logged-in app as two different
  registers on purpose.
- **RHYTHM: 2**. The logged-in app is consistently composed (consistent card/
  table/badge vocabulary across pages) with the landing and auth screens
  deliberately breaking from that vocabulary (their own `.lp-*`/`.auth-*`
  styles) because they serve a different job (persuasion vs. analysis).
- **MOTION: 1-2**. Inside the app: hover states and transitions only
  (`var(--spring)`), no scroll-reveal or choreography — appropriate for a
  tool people scan quickly and repeatedly. On the landing/auth screens:
  a few purposeful animations (starfield twinkle, atmospheric glow breathing,
  button hover lift) — kept deliberately sparse after antislop audit-001 #3
  removed the extra glow/pulse layers that pushed it toward MOTION 3.

## What NOT to add without a reason

- No new gradient/glow/badge on the logged-in app pages without the same
  purpose test as any other antislop pass (see `antislop.md` core).
- No new "trust" claims (compliance, statistics, uptime) anywhere without a
  real, checkable source — this app's history includes multiple removed
  instances of exactly this (see `anti-slop/audit-001-2026-09-26.md`).
- No customer testimonials or logo bars until real ones exist.

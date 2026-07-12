# tether

A quiet PWA for two. Pitch-black, warm, and slow on purpose: no feeds, no
typing indicators, no read receipts.

## Stack

React + Vite + TypeScript · Tailwind CSS v4 · Framer Motion ·
`vite-plugin-pwa` (iOS standalone) · Supabase (Postgres, Realtime, Storage,
Auth) · Vercel (hosting). Everything runs on always-free tiers.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env` and fill in your Supabase URL + anon key.
3. In the Supabase dashboard SQL editor, run `supabase/schema.sql` once
   (tables, RLS, `join_tether` / `increment_goal` RPCs, `memories` bucket).
4. In Supabase **Auth → Providers → Email**, disable "Confirm email" for the
   simplest pairing flow (or keep it and confirm both accounts first).
5. `npm run dev`

## Install on iPhone

Deploy to Vercel (`vercel --prod` or connect the GitHub repo), open the URL in
Safari, then **Share → Add to Home Screen**. Tether launches full-screen with
no browser chrome. Haptics require iOS 17.4+ (the hidden
`<input type="checkbox" switch>` Taptic trick in `src/lib/haptics.ts`).

## The rooms (swipe left/right)

letters · memories · **pulse** · bridge · tokens · path

- **Pulse** — tap the orb; if your partner has the app open their phone
  physically beats twice. The background glows amber when they're in the app
  and blush when you're within ~250 m of each other (location optional).
- **Letters** — messages seal for 30 minutes before they can be read.
- **Memories** — polaroids scattered on a table; double-tap to heart.
- **Bridge** — one daily question, blind until both answer (enforced by RLS).
- **Tokens** — mint small promises; redeeming one pulses the giver.
- **Path** — shared goals with a single cooperative progress bar.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the ERD and realtime
data-flow diagrams (PlantUML).

## Replaceable placeholder assets

`public/pwa-*.png` and `apple-touch-icon.png` are generated placeholder ring
icons — swap them for real artwork anytime (180/192/512 px).

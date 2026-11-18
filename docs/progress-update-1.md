# Progress Update 1 — Funnybone "Fresh" rating feed

**Repository:** Funnybone (Crackd.ai front end), GitHub: https://github.com/EbebeLionel/Funny-project
**Deployed app:** https://funny-project-pi.vercel.app
**PM:** Jessie Wang (improvement approved 10/22/2026 via Slack)

## 1. Reviewing the deployed application

The app is live on Vercel and connected to my own Supabase project containing the
restored anonymized teaching data (95 tables, 836,827 rows; the import's
verification check passed). Public pages — the home feed, Top 100, and individual
caption pages — work without signing in.

Voting requires an account. Please use this test account:

- Sign-in page: https://funny-project-pi.vercel.app/login-with-email
- Email: `makumbalionel@gmail.com`
- Password: `Testuser#1`

Google sign-in is not configured on this deployment; please use the email login.

## 2. User persona

**Maya, the caption voter.** Maya is a casual Crackd.ai browser who opens the app
for a few minutes at a time to look at funny captions and vote on them. She
doesn't upload images or write captions herself. Her problem: the only public
feed is Top 100, which shows the same 100 highest-scored captions every time, so
she quickly runs out of new things to rate and stops coming back.

She is the primary persona because her votes are what the feature redistributes.
Two groups benefit indirectly: caption creators, whose new captions currently
can never appear publicly until they've been upvoted (4,383 of 6,240 public
captions — 70% — are unreachable today), and The Humor Project team, who get
rating data spread across many more captions.

## 3. Working first version

### What is done

- Funnybone is deployed on Vercel from the GitHub repo; every push to `main`
  redeploys automatically.
- The app runs against a new Supabase project with the full teaching dataset, so
  Top 100 shows real captions, images and vote counts.
- Dependency upgrade: `@supabase/supabase-js` 2.50 → 2.119 and `@supabase/ssr`
  0.5 → 0.12, required for the new project's publishable key format.
- Vercel functions run in the same region (Oregon) as the database to avoid
  cross-country round trips on every page.

### Fresh feed — first version

Live at https://funny-project-pi.vercel.app/fresh, and as a **Fresh** tab in
the desktop navigation and the mobile menu.

**What it does**

- Shows one public caption at a time with its image, in a card styled like the
  Top 100 cards.
- Three actions: **Funny** (upvote), **Not funny** (downvote), **Skip**. Each
  works by click/tap or keyboard: ↑ upvote, ↓ downvote, → skip.
- The queue only contains captions whose score is between −1 and +1, i.e.
  captions almost nobody has judged yet. In the imported data 70% of public
  captions sit at exactly 0, so this is the pool Top 100 can never show.
- Captions the signed-in user has already voted on are left out, and nothing
  repeats within a session (skipped captions included). The starting point is
  randomised per visit so two people don't rate the same sequence.
- Votes go through the app's existing `toggleCaptionVoteAction`, so the
  database trigger that maintains `like_count` and the Top 100 feed are
  untouched.
- After each vote a strip shows the caption's new score, and a **Rated today**
  counter tracks the session. The queue refills in the background before it
  runs out; when nothing is left, an end screen links to Top 100 or restarts.
- Signed-out visitors can browse; voting opens the existing login prompt.
- The next image is pre-fetched so advancing feels instant.

**Not in this version (deliberately)**

- Swipe gestures on mobile (buttons work on mobile; swipe is iteration two).
- "Rated today" resets on reload — it is a session counter, not persisted.
- If a user has rated every near-zero caption, the queue widens to all public
  captions they haven't voted on, but there is no in-app explanation of that.
- No filter by image category and no "Rising" sort on Top 100 (stretch goals).

**How this addresses Maya's problem:** Maya's complaint is "I keep seeing the
same 100 captions." Fresh gives her an effectively unlimited stream of
captions she has never seen or rated, and every vote she casts is one that
Top 100 could never have collected — so the feed solves her boredom and the
creators' exposure problem with the same action.

## 4. First Product Manager review

`[TODO — fill in after the demo with Jessie Wang. Record:]`

- Date and format of the demo (e.g. screen-share on Slack, DATE).
- What was demonstrated (signing in, opening Fresh, rating N captions).
- Feedback on **usefulness**: `[...]`
- Feedback on **clarity**: `[...]`
- Feedback on **behaviour** (bugs, surprises, things that felt slow or confusing): `[...]`
- Anything the PM asked to add, remove or change in priority.

## 5. Next iteration plan

`[TODO — each item should trace back to a point in section 4. Format suggestion:]`

| Planned change | Why (which PM feedback it addresses) |
|---|---|
| `[...]` | `[...]` |
| `[...]` | `[...]` |

Items already planned from the proposal, to be re-prioritised against the PM's
feedback: swipe voting on mobile, "rated today" counter, end-of-queue screen
linking to Top 100, save-to-Favorites from the card (stretch), filter by image
category (stretch), "Rising" sort on Top 100 (stretch).

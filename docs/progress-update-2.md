# Progress Update 2 — Funnybone "Fresh" feed, iteration 2

**Repository:** Funnybone (Crackd.ai front end), GitHub: https://github.com/EbebeLionel/Funny-project
**Deployed app:** https://funny-project-pi.vercel.app
**Feature under review:** https://funny-project-pi.vercel.app/fresh
**PM:** Jessie Wang

## 1. Reviewing the deployed application

The app is live on Vercel against my own Supabase project holding the restored,
anonymised teaching data. The home feed, Top 100 and the Fresh feed can be
browsed without signing in. Voting requires an account; please use the test
account:

- Sign-in page: https://funny-project-pi.vercel.app/login-with-email
- Email: `makumbalionel@gmail.com`
- Password: `Testuser#1`

Google sign-in is not configured on this deployment; please use the email login.

**Suggested review flow:** sign in → open **Fresh** in the navigation → rate a
few captions with the buttons, the arrow keys, and (on a phone) by swiping the
card left or right → press **Undo** after a vote → keep going until the
"Rated today" counter reads 10 or more.

## 2. User persona

**Maya, the caption voter.** Maya is a casual Crackd.ai browser who opens the
app for a few minutes at a time, usually on her phone, to look at funny captions
and vote on them. She doesn't upload images or write captions. Her problem: the
only public feed used to be Top 100, which shows the same 100 highest-scored
captions every visit, so she quickly ran out of new things to rate and stopped
coming back.

Iteration 1 gave Maya an endless stream of unrated captions. Iteration 2 is
about making each individual rating feel quick, physical and forgiving, because
Maya rates in short bursts on a phone and a feed that feels sluggish or
unforgiving on mobile loses her just as surely as a feed with nothing new.

Two groups still benefit indirectly: caption creators, whose unrated captions
(70% of public captions at import time) can now be surfaced, and The Humor
Project team, who get rating data spread across many more captions.

## 3. Feedback from the first Product Manager review

`[TODO — fill in from the Iteration 1 demo with Jessie Wang. Record:]`

- Date and format of the demo: `[...]`
- Feedback on **usefulness**: `[...]`
- Feedback on **clarity**: `[...]`
- Feedback on **behaviour** (bugs, surprises, slow or confusing moments): `[...]`
- Anything asked to add, remove or re-prioritise: `[...]`

## 4. What changed after iteration 1

All changes are in the Fresh feed. Each one traces to the iteration 1 plan
("make rating feel better") and to the feedback above.

| Change | What it does | Why (feedback / plan item it addresses) |
|---|---|---|
| **Swipe to vote on mobile** | The card follows the finger. Swipe right = Funny, swipe left = Not funny, with a "FUNNY" / "NOT FUNNY" stamp fading in as you drag. A short drag springs back. The buttons and arrow keys still work. | Promised for iteration 2 in the proposal. Maya rates on a phone; tapping small buttons under a large image is slower than a flick. |
| **Undo last vote** | The confirmation strip now has an **Undo** button (Backspace on desktop). Undoing removes the vote in the database, decrements "Rated today", and puts the caption back in front of you. | Swipes and arrow keys make accidental votes more likely; without undo a mis-press permanently skews a caption's score. |
| **Real score after voting** | The strip shows the score as maintained by the database trigger, read back after the vote, instead of a local guess. While the request is in flight it says "Saving your vote…". | Two people rating the same caption at once previously saw a wrong number. Also makes it obvious when a vote has actually been saved. |
| **Card transitions** | The rated card flies off to the right (Funny) or left (Not funny), drops away on Skip, and the next card scales in. The vote request runs in the background so the card leaves immediately. | Previously the card was replaced instantly with no feedback; voting didn't feel like it did anything. |
| **Failed votes come back** | If a vote request fails, the caption is returned to the front of the queue with a message, rather than being lost. | Needed once the card advances before the request finishes. |

**Deliberate deviation from the plan:** the plan listed "swipe down = Skip".
Capturing vertical drags on the card would stop the page from scrolling on
phones, where the card can fill most of the screen. Swipe is therefore
horizontal only; Skip stays a button and the → key.

### Checking against the original problem and for confusing behaviour

Checked on the deployed app with the test account, on desktop (Chrome) and on
a phone-sized viewport:

- [ ] Rating by button, arrow key and swipe each record one vote and advance one card.
- [ ] A short drag (under ~110 px) springs back without voting.
- [ ] "Rated today" increments on vote, decrements on undo, and never goes negative.
- [ ] Undo returns the same caption, with its original score, to the front.
- [ ] The score on the strip matches the caption page after a reload.
- [ ] Signed out, a swipe or arrow key opens the login prompt and the card stays.
- [ ] Page still scrolls vertically on a phone while the card is on screen.
- [ ] Skipped captions do not reappear in the same session.

`[Tick each line after verifying on the deployed build; note anything that failed.]`

## 5. Second Product Manager review

`[TODO — fill in after the Iteration 2 demo with Jessie Wang. Record:]`

- Date and format of the demo: `[...]`
- What was demonstrated (swipe, undo, score strip, transitions): `[...]`
- Feedback on **usefulness**: `[...]`
- Feedback on **clarity**: `[...]`
- Feedback on **behaviour**: `[...]`
- Answers to the two questions below.

**Questions put to the PM this round**

1. **Should Skip exist at all, and should it count?** Today a skipped caption
   never comes back in the same session but can reappear next visit. Options:
   keep as is, hide Skip so every card gets a verdict, or remember skips per
   user so they never return.
2. **One caption at a time, or several per image?** Many images have several
   captions. Showing two or three for the same image and asking "which is
   funniest" would give comparative data and fewer image loads, but it is a
   different interaction from the current single-card feed.

## 6. Next iteration plan

`[Re-prioritise after the second review; each row should trace to section 5.]`

| Planned change | Why (which PM feedback it addresses) |
|---|---|
| Persist "Rated today" and add a streak (computed from vote timestamps) | `[...]` |
| Resolve the Skip question (hide, keep, or remember skips per user) | PM answer to question 1 |
| Explain the fallback when every fresh caption has been rated | Known gap from iteration 1 |
| Save to Favorites from the card (existing saves table and actions) | `[...]` |
| Filter by image category / "Rising" sort on Top 100 (stretch) | `[...]` |
| Multiple captions per image (only if PM says yes to question 2) | PM answer to question 2 |

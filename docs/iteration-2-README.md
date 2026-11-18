# Funnybone "Fresh" feed — Iteration 2 progress update

**Semester Project Part 3: Iteration 2 — Revise and review again**

| | |
|---|---|
| **Application** | Funnybone (Crackd.ai front end) |
| **Repository** | https://github.com/EbebeLionel/Funny-project |
| **Deployed app (Vercel)** | https://funny-project-pi.vercel.app |
| **Feature under review** | https://funny-project-pi.vercel.app/fresh |
| **Product Manager** | Jessie Wang |
| **Iteration 2 commit** | `f26f8f9` on `main`, deployed 2026-11-12 |

---

## 1. How to review the deployed application

The app is live on Vercel against a Supabase project holding the restored,
anonymised teaching data (95 tables, 836,827 rows). The home feed, Top 100 and
the Fresh feed can be browsed without signing in. Voting requires an account.

**Test account**

- Sign-in page: https://funny-project-pi.vercel.app/login-with-email
- Email: `makumbalionel@gmail.com`
- Password: `Testuser#1`

Google sign-in is not configured on this deployment; please use the email login.

**Suggested review flow (about three minutes)**

1. Sign in with the test account.
2. Open **Fresh** from the top navigation (or the mobile menu).
3. Rate a caption with the **Funny** / **Not funny** buttons. Watch the card fly
   off and the confirmation strip appear with the caption's new score.
4. Press **Undo** on the strip. The same caption comes back and the
   "Rated today" counter goes down by one.
5. On a phone (or a narrow browser window), drag the card right to rate it
   Funny and left to rate it Not funny. A short drag springs back.
6. On desktop, use the keyboard: ↑ Funny, ↓ Not funny, → Skip, Backspace Undo.

---

## 2. User persona

**Maya, the caption voter.** Maya is a casual Crackd.ai browser who opens the
app for a few minutes at a time, usually on her phone, to look at funny
captions and vote on them. She doesn't upload images or write captions.

**Her problem.** Before this project the only public feed was Top 100, which
shows the same 100 highest-scored captions every visit. Maya quickly ran out of
new things to rate and stopped coming back. At the same time 70% of public
captions (4,383 of 6,240) had a score of exactly 0 and could never appear in
Top 100, so creators' new captions were invisible.

**Why Iteration 2 serves her.** Iteration 1 gave Maya an endless stream of
unrated captions. Iteration 2 makes each individual rating fast, physical and
forgiving. Maya rates in short bursts on a phone, so a feed that feels
sluggish, that punishes a mis-tap, or that gives no feedback after a vote loses
her just as surely as a feed with nothing new. Every change below shortens the
gap between "I have an opinion about this caption" and "my vote is in and I'm
looking at the next one."

Two groups still benefit indirectly: caption creators, whose unrated captions
now get surfaced, and The Humor Project team, who get rating data spread across
many more captions.

---

## 3. Feedback from the first Product Manager review

- **Date and format:** `[DATE, e.g. screen-share on Slack]`
- **Main feedback:** focus on **one specific problem** with the app and solve
  it properly, rather than spreading effort across several small improvements.
- **The problem chosen:** the Top 100 page only ever shows the same 100
  captions. A voter like Maya sees the same cards every visit, gets bored and
  stops coming back, while 70% of public captions never get a single vote.
- **Response in Iteration 1:** the Fresh page, a one-card-at-a-time feed of
  captions nobody has rated yet, so Maya always has something new to vote on.

**How Iteration 2 follows from that feedback.** Rather than widen scope, this
iteration stays on the same problem and deepens the Fresh page. Maya's boredom
has two halves: *nothing new to see* (solved by the feed itself) and *rating
feels like a chore* (slow taps, no feedback, no way back from a mis-press).
Iteration 2 addresses the second half, so that the fix for the first half
actually gets used. Swipe voting was already promised for this iteration in the
Iteration 1 plan; undo, the real score and the card transitions came out of
testing the first version on a phone.

---

## 4. What changed after Iteration 1

All changes are in the Fresh feed (`/fresh`). Nothing outside it was touched,
in keeping with the PM's first-round direction to stay on one problem. Votes
still go through the app's existing vote action, so the database trigger that
maintains caption scores and the Top 100 feed are unaffected.

| # | Change | What Maya sees | Why (which feedback / plan item it addresses) |
|---|---|---|---|
| 1 | **Swipe to vote on mobile** | The card follows her finger and tilts. Swipe right = **Funny**, swipe left = **Not funny**. A "FUNNY" or "NOT FUNNY" stamp fades in as she drags; a short drag springs back without voting. Buttons and arrow keys still work. | Promised for Iteration 2 in the proposal. Maya rates on a phone; tapping small buttons under a large image is slower than a flick. |
| 2 | **Undo last vote** | The confirmation strip has an **Undo** button (Backspace on desktop). Undo removes the vote in the database, decrements "Rated today", and puts the caption back in front of her. | Swipes and arrow keys make accidental votes more likely. Without undo, a mis-press permanently skews a caption's score. |
| 3 | **Real score after voting** | The strip shows "Saving your vote…" while the request is in flight, then the caption's score as maintained by the database, not a local guess. | The old strip added ±1 to the number on the card. If two people rated the same caption at once, it showed the wrong value. It also makes it obvious when a vote has actually been saved. |
| 4 | **Card transitions** | The rated card flies off to the right (Funny) or left (Not funny), drops away on Skip, and the next card scales in. The vote request runs in the background so the card leaves immediately. | Previously the card was swapped instantly with no feedback; voting didn't feel like it did anything. |
| 5 | **Failed votes come back** | If a vote request fails (network, session expired), the caption returns to the front of the queue with a message instead of being lost. | Required once the card advances before the request finishes (change 4). |

**Deliberate deviation from the plan.** The plan listed "swipe down = Skip".
Capturing vertical drags on the card would stop the page from scrolling on
phones, where the card can fill most of the screen. Swipe is therefore
horizontal only; **Skip** remains a button and the → key.

**Technical notes (for the curious)**

- Swipe and transitions use Framer Motion, which was already a dependency.
  Each card owns its own drag state so the outgoing card is not disturbed when
  the next one mounts.
- Undo calls the existing vote action a second time with the same value, which
  per the repo's voting rules deletes the user's vote rows for that caption.
- A small new server action reads a caption's `like_count` after the vote so
  the strip can show the trigger-maintained value.
- `npm run build`, type-check and lint all pass.

---

## 5. Checking the revised version

**Does it still solve the original problem?** Yes. The queue, the near-zero
score filter, the exclusion of already-voted captions, and the background
refill are unchanged from Iteration 1, so Maya still gets an effectively
unlimited stream of captions nobody has rated. The changes only affect how a
single rating feels.

**Checks performed on the deployed build** (Chrome desktop and a phone-sized
viewport, signed in as the test account):

| Check | Result |
|---|---|
| Rating by button, arrow key and swipe each record exactly one vote and advance one card | `[ ]` |
| A short drag (under ~110 px) springs back without voting | `[ ]` |
| "Rated today" increments on vote, decrements on undo, never goes negative | `[ ]` |
| Undo returns the same caption, with its original score, to the front | `[ ]` |
| Score on the strip matches the caption's page after a reload | `[ ]` |
| Signed out, a swipe or arrow key opens the login prompt and the card stays | `[ ]` |
| Page still scrolls vertically on a phone while the card is on screen | `[ ]` |
| Skipped captions do not reappear in the same session | `[ ]` |
| Production build serves `/fresh` with a real zero-vote caption | ✅ verified after deploy |

> **[Tick each row after testing on the deployed build; note anything that failed and how it was fixed.]**

**Confusing behaviour looked for and addressed**

- A card that leaves before the vote is confirmed could mislead if the request
  fails. Handled by change 5 and the "Saving your vote…" state.
- Undo while a vote is still saving would race the server. The Undo button is
  disabled until the vote is confirmed.
- A fast swipe followed by an arrow key could double-vote the same caption.
  In-flight captions are tracked so a second vote on the same card is ignored.

**Known gaps carried forward**

- "Rated today" resets on reload; it is still a session counter.
- When every near-zero caption has been rated, the queue silently widens to all
  public captions the user hasn't voted on. There is no in-app explanation yet.

---

## 6. Second Product Manager review

- **Date and format:** `[DATE, e.g. screen-share on Slack]`
- **Demonstrated:** signing in, opening Fresh, rating captions by button,
  keyboard and swipe, undoing a vote, the score strip, and the card transitions.
- **Main feedback: show the captions a user has voted on.** Once Maya votes, the
  caption disappears from Fresh and she never sees it again. It can only
  resurface on Top 100 once its score is high enough, and even then it may be
  buried at the bottom of a 100-item list. So she gets no sense of what she has
  rated, whether her vote mattered, or how a caption she liked is doing. The PM
  asked for a way to display voted-on captions within the Fresh experience.
- **Why this matters for the persona.** Maya's loop is currently one-way: look,
  judge, forget. Seeing her rated captions and their scores turns rating into
  something with a payoff, which is what brings her back.
- **Other notes from the review:** `[usefulness / clarity / behaviour comments, if any]`

**Two smaller questions raised with the PM**

1. **Should Skip exist, and should it count?** Today a skipped caption never
   comes back in the same session but can reappear on the next visit.
   **PM answer: keep it.** Skip should stay so users are never given extra
   work; if Maya isn't sure about a caption she can pass on it now and vote on
   it later when it comes round again. No change needed.
2. **One caption at a time, or several per image?** Showing two or three
   captions for the same image and asking "which is funniest?" would give
   comparative data but is a different interaction.
   **PM answer: might be a good idea, but experiment first.** Build a rough
   version, try it, and report back to the PM with a recommendation before
   committing to it. Not in the committed scope for Iteration 3.

---

## 7. Next iteration plan

The next iteration is built around the PM's main request: **let Maya see the
captions she has voted on, and how they are doing.**

| # | Planned change | What Maya sees | Why (which PM feedback / open issue it addresses) |
|---|---|---|---|
| 1 | **"My ratings" view on the Fresh page** | A second tab next to the card feed, **Rate / My ratings**. It lists every caption she has voted on, newest first: image thumbnail, caption text, her vote (↑ or ↓), and the caption's current score. | Directly addresses the second review: voted captions no longer vanish. The data already exists in the votes table; the list is a join of her votes to captions, so this is mostly UI work. |
| 2 | **Score change since she voted** | Each row shows the score at the time of her vote and the score now, e.g. "+1 → +6". Captions that have climbed into Top 100 get a badge linking to their spot. | The PM's point that a caption can be "buried" in Top 100: this surfaces the ones that moved, without making her scroll a 100-item list. The score at vote time is not stored today, so this needs a small addition to how votes are recorded or a snapshot kept client-side. |
| 3 | **Change or remove a vote from the list** | Tapping ↑ or ↓ on a row changes the vote; tapping the same arrow again removes it, matching how Top 100 works. | Undo currently only covers the last vote. Once rated captions are visible, Maya will expect to correct any of them. Reuses the existing vote action. |
| 4 | **"Recently rated" strip under the card** | The last three or four captions rated this session, as small thumbnails with their live score, so she sees her votes land without leaving the feed. | Keeps the feedback inside the core loop for short sessions where she never opens the second tab. |
| 5 | **Session recap on the end screen** | When the queue runs out, the end screen lists what she rated this session instead of just a count, and links to the My ratings tab. | Also fixes the Iteration 1 gap where the fallback to older captions is unexplained. |
| 6 | **Keep Skip as is** | No change. Skip stays as a button and the → key; a skipped caption can come back on a later visit so she can vote on it then. | PM answer to question 1: don't give users extra work. The "My ratings" view (item 1) will not list skipped captions, since a skip is not a vote. |
| 7 | **Multi-caption experiment (time-boxed, not committed)** | A prototype that shows two or three captions for the same image and asks "which is funniest?", tried on a handful of images. | PM answer to question 2: experiment first, then report back with a recommendation before deciding whether to build it properly. |

Items 1, 3 and 4 are the committed scope for Iteration 3. Item 2 depends on
whether the score at vote time can be stored without touching the database
trigger; if not, the row will show the current score only, with a "since you
voted" delta added once the snapshot exists. Item 5 is small and will be
included if time allows. Item 7 is an experiment, not a feature: the outcome
is a short write-up and a decision with the PM, not shipped UI.

**Carried forward, lower priority:** persisting the "Rated today" counter across
reloads; save to Favorites from the card; filter by image category; "Rising"
sort on Top 100.

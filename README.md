# JINX! — Multiplayer word-matching game

A phone-powered word-matching party game, hosted on GitHub Pages and synced over Firebase Realtime Database.

## Setup

1. Register a Firebase web app and copy the browser config into `firebase-config.js`.
2. Create a Firebase **Realtime Database**, open **Rules**, and **replace the existing published rules** with the entire contents of `database.rules.json`. Click **Publish**. **The rules must be updated after this redesign.**
3. Enable GitHub Pages from the `main` branch, `/(root)`.
4. Open https://ryanehinkle.github.io/phrase-guess/ on your main screen. Create a room, then have friends scan its QR code or enter the code on their phones.

## Game flow

- The TV/computer starts in a lobby. Each player joins on their own phone and claims a unique name and one of 24 colors.
- The host selects a 30/45/60/90-second timer, can cycle **Auto Off → 5s → 10s → Off** in the lobby, and presses **Start game**. Auto advances after the reveal plus the existing pause.
- Everyone sees the **same randomly selected phrase** from the uploaded `prompts.json` deck (5,159 curated phrases), along with a synchronized countdown.
- Each phone locks in **one hidden answer per round**. The round reveals when all registered players have answered **or** time expires. The host can also reveal early.
- Matching answers are revealed together with players' names, colors, and points (with a Top Answer / Jinx breakdown); a compact live scoreboard appears on host and player screens. Scores and ranks stay frozen until the full answer reveal completes, preventing spoilers. On phones the scoreboard is centered, with answer cards scrolling inside the reveal if needed.
- Each answer on the curated Top 5 earns **5/4/3/2/1 points**, from rank #1 to #5. If **exactly two** players submit the same (or typo-equivalent) answer, **each gets a +5 Jinx bonus**. If **three or more** players match, **each gets +3** instead. These rewards stack (e.g., two matching players who guess #1 get 10 each; three matching players guessing #1 get 8 each). In the reveal, exactly-two bonuses are labeled **Jinx (+5)** and larger-group bonuses **Match (+3)**; the banner says **JINX!** for any pair match and otherwise shows the number of matching players.
- Answers are compared case-insensitively, ignoring spaces, punctuation and accents. For words of 5–12 normalized characters, one edit (typo) is tolerated. This deliberately avoids awarding points for unrelated similar words.
- The host advances rounds and can end the game. **All games finish after 10 regular rounds**, whether they have two players or a larger group. The old 50-point cutoff is no longer used. Two-player games still track Jinx streaks and matches alongside scores. If any players tie for the highest game score, only those tied leaders enter extra tiebreaker rounds. Tiebreakers award **Top 5 placement points (5–1) only**, never Jinx/Match bonuses, and do not change the original game scores. If the tiebreaker still ties, another round runs until a single champion is determined.
- A room's prompt history avoids repeating prompts until the entire deck is used.


## Top Answers

JINX! displays a compact **Top Answers** panel after the cinematic reveal. Five curated, ranked completions type in one by one; an exact guess by one player takes that player's color, and a guess made by multiple players turns gold. Rank #1 awards 5 points down to #5 awarding 1 point. An additional 5 points are awarded to every player in a matched group.

### Phrase quality

The original `prompts.json` retains **5,159 source prompts**. To avoid the repetitive, nonsensical filler previously shown (for example BIG / LITTLE / NEW / OLD / GIANT or MUFFIN SALAD), the game only selects prompts with a **vetted five-answer entry** in `top-answers.json`. There are currently **854 playable prompts**. The other prompts remain archived in `prompts.json` and can be activated as their responses are curated. Nothing is generated from generic adjective templates during play.

Suggestions are based on hand-reviewed familiar expressions, a curated phrase bank, and conservative filtering of public English bigram usage data ([Peter Norvig's corpus](https://norvig.com/ngrams/)). They are **party-game estimates, not actual survey results or statistically verified popularity rankings**. The short list is designed to be more believable than an artificially complete list of 5,159 poor ones. New active prompts must have exactly five distinct completions, and singular/plural variants of the same word may not occupy separate slots.

### Game recap

When the host selects **See results**, the main display switches from the last prompt to a dashboard with genuine round statistics, an interactive round-by-round bar chart, and each question's individual player answers and points. The same history is available in a compact recap on players' phones. Completed rounds are stored in the Firebase game object. New games start with fresh history; games begun before the recap update may not include older rounds.

## Limitations of the browser-only version

This is a casual party game. Firebase anonymous/public rules and client-side scoring **are not tamper-resistant**: technically skilled users could inspect database data or manipulate it outside the UI. Fully private answers, host-only authorization and trusted scoring require Firebase Auth plus a trusted backend (Cloud Functions or similar). For normal friends playing on their phones, answers are hidden in the UI until reveal.

Keep the **host screen open** during active rounds: its JavaScript advances expired and fully submitted rounds. The timer uses Firebase's server clock offset, but browsers can throttle background tabs. Don't host a game with the browser in the background.

Colors/names remain reserved in each room, including temporarily disconnected phones. A new room starts a fresh game. Players rejoining on the same browser keep their identity via local storage.

The QR image uses a third-party QR generator. The room code and player link are provided as alternatives.

Blank Slate is a game from The Op Games; this is an independent, unofficial digital party-game implementation.


## Game finale and all-time records

- The final screen leads with a large animated **champion celebration and complete score leaderboard**. Tiebreaker winners are clearly marked even when the underlying game scores remain tied.
- **Round Stats** retains the existing round-by-round chart, per-round answers, Jinxes, and score breakdown. **All-Time Scores** shows the 25 highest personal-best game scores, shared across rooms and devices.
- The high-score record is keyed by a normalized uppercase player name. Accents and non-emoji punctuation are removed, while emoji remain intact. Reusing a normalized name keeps only the **best single-game score** under that name.
- After an official completed game, the host securely submits every player's game score to `highScores` in Firebase Realtime Database. Players whose score is a new personal best receive a highlighted **NEW BEST** entry; this game's records glow in the all-time list.
- **Important one-time setup:** Publish the updated `database.rules.json` in **Firebase Console → Realtime Database → Rules → Publish**. Updating this file in GitHub alone does **not** deploy Firebase's live rules. Until the updated rules are published, the global board shows a clear unavailable message instead of claiming to save records. The existing game and round scoring still work.
- For anti-spoofing, the high-score database rule verifies that a posted score, player name, session, and room match the recorded **completed game**. It accepts a replacement only if it beats the previous personal best. As with any game that relies on unauthenticated browsers, this is a casual leaderboard rather than an anti-cheat system.

## Spicy / dirty mode

- The host has a **single monochrome flame icon** beside the JINX! logo. It toggles in the **lobby only** and is locked when play begins so everyone shares the same prompt set.
- Turning it on broadcasts a **dark wine-red theme** across the host display and all joined phones. Turning it off restores the existing blue/purple game.
- The new mode is fully separate from the family-friendly game: `dirty-prompts.json` now holds **114 tightly curated NSFW/raunchy word-pair prompts**, each paired with five deliberately ranked completions in `dirty-top-answers.json`. The previously larger, weaker adult list was **cut down** rather than padded with ordinary phrases. Topics include profanity, suggestive double entendres, sex slang, drug/party culture, adult dating, taboo humor and recognizable NSFW pop-culture references. Each Top 5 is checked for five distinct answers and singular/plural duplicates. Rankings are editorial estimates of familiar completions, not survey statistics.
- The original `prompts.json` and `top-answers.json` are **not modified**; choosing the classic mode continues using those exact files and the existing scoring/gameplay behavior.
- The two decorative **“REVEALED” / “ANSWERS REVEALED”** lines were removed from the result screen so the answer cards can use the space.

### Spicy prompt curation principles

- All prompts should have a **recognizably adult or provocative angle**; a harmless everyday prompt with one NSFW answer and four filler answers is not sufficient.
- Prefer popular, repeatable *phrase pairs* and recognizable culture (e.g., `_____ SHOT` with BODY / TEQUILA / JELLO / MONEY / CUM) over arbitrary insult/adjective lists. Top 5 alternatives must form natural combinations with the actual blank.
- Avoid near-identical singular/plural alternatives, fabricated collocations, excessive one-off trivia, and prompts that make only one answer plausible. Fewer high-quality rounds are intentional.
- Adult party-game mechanics informed the tone, but **no third-party card text was copied**. The JINX! scoring and standard-mode content are unchanged.

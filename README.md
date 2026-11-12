# JINX! — Multiplayer word-matching game

A phone-powered word-matching party game, hosted on GitHub Pages and synced over Firebase Realtime Database.

## Setup

1. Register a Firebase web app and copy the browser config into `firebase-config.js`.
2. Create a Firebase **Realtime Database**, open **Rules**, and **replace the existing published rules** with the entire contents of `database.rules.json`. Click **Publish**. **The rules must be updated after this redesign.**
3. Enable GitHub Pages from the `main` branch, `/(root)`.
4. Open https://ryanehinkle.github.io/phrase-guess/ on your main screen. Create a room, then have friends scan its QR code or enter the code on their phones.

## Game flow

- The TV/computer starts in a lobby. Each player joins on their own phone and claims a unique name and one of 24 colors.
- The host selects a 30/45/60/90-second timer, can turn **Auto** on in the lobby, and presses **Start game**. Auto advances after the reveal plus the existing pause.
- Everyone sees the **same randomly selected phrase** from the uploaded `prompts.json` deck (5,159 curated phrases), along with a synchronized countdown.
- Each phone locks in **one hidden answer per round**. The round reveals when all registered players have answered **or** time expires. The host can also reveal early.
- Matching answers are revealed together with players' names, colors, and points (with a Top Answer / Jinx breakdown); a compact live scoreboard appears on host and player screens.
- Each answer on the curated Top 5 earns **5/4/3/2/1 points**, from rank #1 to #5. If two or more players submit the same (or typo-equivalent) answer, **each gets an additional 5-point Jinx bonus**, even in 3+ player games. These rewards stack (e.g., matching #1 = 10 each).
- Answers are compared case-insensitively, ignoring spaces, punctuation and accents. For words of 5–12 normalized characters, one edit (typo) is tolerated. This deliberately avoids awarding points for unrelated similar words.
- The host advances rounds and can end the game. In 3+ player games, reaching 50 points offers final standings; two-player games keep their 10-round match challenge and now also track points.
- A room's prompt history avoids repeating prompts until the entire deck is used.


## Top Answers

JINX! displays a compact **Top Answers** panel after the cinematic reveal. Five curated, ranked completions type in one by one; an exact guess by one player takes that player's color, and a guess made by multiple players turns gold. Rank #1 awards 5 points down to #5 awarding 1 point. An additional 5 points are awarded to every player in a matched group.

### Phrase quality

The original `prompts.json` retains **5,159 source prompts**. To avoid the repetitive, nonsensical filler previously shown (for example BIG / LITTLE / NEW / OLD / GIANT or MUFFIN SALAD), the game only selects prompts with a **vetted five-answer entry** in `top-answers.json`. There are currently **854 playable prompts**. The other prompts remain archived in `prompts.json` and can be activated as their responses are curated. Nothing is generated from generic adjective templates during play.

Suggestions are based on hand-reviewed familiar expressions, a curated phrase bank, and conservative filtering of public English bigram usage data ([Peter Norvig's corpus](https://norvig.com/ngrams/)). They are **party-game estimates, not actual survey results or statistically verified popularity rankings**. The short list is designed to be more believable than an artificially complete list of 5,159 poor ones. New active prompts must have exactly five distinct completions.

### Game recap

When the host selects **See results**, the main display switches from the last prompt to a dashboard with genuine round statistics, an interactive round-by-round bar chart, and each question's individual player answers and points. The same history is available in a compact recap on players' phones. Completed rounds are stored in the Firebase game object. New games start with fresh history; games begun before the recap update may not include older rounds.

## Limitations of the browser-only version

This is a casual party game. Firebase anonymous/public rules and client-side scoring **are not tamper-resistant**: technically skilled users could inspect database data or manipulate it outside the UI. Fully private answers, host-only authorization and trusted scoring require Firebase Auth plus a trusted backend (Cloud Functions or similar). For normal friends playing on their phones, answers are hidden in the UI until reveal.

Keep the **host screen open** during active rounds: its JavaScript advances expired and fully submitted rounds. The timer uses Firebase's server clock offset, but browsers can throttle background tabs. Don't host a game with the browser in the background.

Colors/names remain reserved in each room, including temporarily disconnected phones. A new room starts a fresh game. Players rejoining on the same browser keep their identity via local storage.

The QR image uses a third-party QR generator. The room code and player link are provided as alternatives.

Blank Slate is a game from The Op Games; this is an independent, unofficial digital party-game implementation.

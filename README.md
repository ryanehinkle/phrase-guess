# JINX! — Multiplayer word-matching game

A phone-powered word-matching party game, hosted on GitHub Pages and synced over Firebase Realtime Database.

## Setup

1. Register a Firebase web app and copy the browser config into `firebase-config.js`.
2. Create a Firebase **Realtime Database**, open **Rules**, and **replace the existing published rules** with the entire contents of `database.rules.json`. Click **Publish**. **The rules must be updated after this redesign.**
3. Enable GitHub Pages from the `main` branch, `/(root)`.
4. Open https://ryanehinkle.github.io/phrase-guess/ on your main screen. Create a room, then have friends scan its QR code or enter the code on their phones.

## Game flow

- The TV/computer starts in a lobby. Each player joins on their own phone and claims a unique name and one of 24 colors.
- The host selects a 30/45/60/90-second timer and presses **Start game**.
- Everyone sees the **same randomly selected phrase** from the uploaded `prompts.json` deck (5,159 curated phrases), along with a synchronized countdown.
- Each phone locks in **one hidden answer per round**. The round reveals when all registered players have answered **or** time expires. The host can also reveal early.
- Matching answers are revealed together with players' names, colors and earned points.
- Exactly **two** matching players earn **3 points each**; **three or more** matching players earn **1 point each**; unmatched and missing answers get **0 points**.
- Answers are compared case-insensitively, ignoring spaces, punctuation and accents. For words of 5–12 normalized characters, one edit (typo) is tolerated. This deliberately avoids awarding points for unrelated similar words.
- The host advances rounds and can end the game. At 25 points, the next control offers final standings.
- A room's prompt history avoids repeating prompts until the entire deck is used.


## Top Answers

After the cinematic result reveal, the **host-only** Top Answers panel suggests up to five natural completions. These are **corpus-informed estimates, not poll or Family Feud survey results**, and never affect scoring. A guess submitted by one player is colored with that player's color; an entry guessed by two or more players becomes gold.

Suggestions are retrieved as needed from the [Datamuse API](https://www.datamuse.com/api/), which uses Google Books Ngrams and lexical/dictionary resources for word relationships and phrase frequency, plus a curated set of common examples. Results are cached locally in the host browser to avoid repeating requests. If the service is unavailable or cannot suggest five defensible completions, the panel may show fewer than five or a brief unavailable message rather than inventing supposedly popular answers. The host needs internet access to obtain new suggestions; player phones make no Datamuse requests.

## Limitations of the browser-only version

This is a casual party game. Firebase anonymous/public rules and client-side scoring **are not tamper-resistant**: technically skilled users could inspect database data or manipulate it outside the UI. Fully private answers, host-only authorization and trusted scoring require Firebase Auth plus a trusted backend (Cloud Functions or similar). For normal friends playing on their phones, answers are hidden in the UI until reveal.

Keep the **host screen open** during active rounds: its JavaScript advances expired and fully submitted rounds. The timer uses Firebase's server clock offset, but browsers can throttle background tabs. Don't host a game with the browser in the background.

Colors/names remain reserved in each room, including temporarily disconnected phones. A new room starts a fresh game. Players rejoining on the same browser keep their identity via local storage.

The QR image uses a third-party QR generator. The room code and player link are provided as alternatives.

Blank Slate is a game from The Op Games; this is an independent, unofficial digital party-game implementation.

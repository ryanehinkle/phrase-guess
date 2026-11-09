# Phrase Guess

A lightweight, mobile-friendly live word-bubble wall for GitHub Pages. Open the main screen on a computer/TV, display the join code or QR code, then let any number of phones submit words. Submissions appear in realtime, and players can send multiple times.

## Setup (one time)

GitHub Pages is static, so it **cannot synchronize devices on its own**. This project uses the free Firebase Realtime Database for sync. It works across phones on the same Wi-Fi **and** phones on other networks if they have the URL/code. A GitHub Pages site cannot enforce same-local-network-only access; for LAN isolation you'd need to host a server locally instead.

1. Open [Firebase Console](https://console.firebase.google.com/), create a project, then create a **Realtime Database** (not Firestore). Choose the free Spark plan and the region closest to you.
2. Open **Project settings → Your apps**, add a **Web app**, and copy its `firebaseConfig` fields into `firebase-config.js` in this repository. Use the precise `databaseURL` from your Realtime Database's page.
3. Go to **Realtime Database → Rules**. Paste `database.rules.json` and click **Publish**.
4. In this repo go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, then `main` and `/(root)` and Save.
5. Open **https://ryanehinkle.github.io/phrase-guess/** on the big screen and tap **Start a room**. Scan the QR code from phones, or enter the same room code.

## Notes and boundaries

- The big-screen view displays submitted words as bubbles. Use **Clear words** between rounds, or **New room** to start a fresh code.
- This is a casual party tool, not a locked-down private room. Anyone with a code/URL can join, and the Firebase web configuration is intentionally visible to browsers. Keep admin service credentials out of this repository.
- **Clear words** hides older submissions while preserving the room. For a public-facing event or stronger abuse protection, add Firebase Authentication and securely scoped database rules. Rooms and old submissions are not automatically deleted.
- Rooms are not automatically deleted. Firebase usage may incur charges if you exceed the free-tier allowance.
- The QR image is loaded from a third-party QR service; phones can instead type the room code manually.

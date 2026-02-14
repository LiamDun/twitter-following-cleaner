# Following Cleaner for X

A Chrome extension that gives you a Tinder-style swipe interface to clean up your X/Twitter following list. Swipe right to keep, swipe left to unfollow.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

<!-- 
Add screenshots here after installing:
![Scanning](screenshots/scanning.png)
![Swipe UI](screenshots/swipe.png)
![Results](screenshots/results.png)
-->

## Features

- **Tinder-style card UI** — swipe or use keyboard shortcuts to quickly decide who stays and who goes
- **Real profile data** — pulls avatars, display names, bios, and handles directly from the page
- **Drag, click, or keyboard** — swipe by dragging the card, clicking the buttons, or pressing arrow keys
- **Undo** — made a mistake? Hit the undo button or press Z/Backspace
- **Random or chronological order** — toggle between random shuffle and oldest-first
- **Open profile** — quickly open anyone's full profile in a new tab before deciding
- **Batch unfollow execution** — once you've made your choices, execute unfollows with built-in throttling (3–7s random delays)
- **Cancel anytime** — stop the unfollow process mid-way if you change your mind
- **Move between lists** — change your mind in the results view by moving accounts between keep/unfollow

## Privacy

**This extension does not collect, store, or transmit any data.** Everything runs locally in your browser tab. There are no analytics, no external API calls, no tracking. Your following list never leaves your machine.

The extension only requires the `activeTab` permission — it can only interact with the tab you explicitly activate it on.

## Installation

1. Download or clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the extension folder

## Usage

1. Go to your Following page on X (`x.com/yourusername/following`)
2. Click the extension icon in your toolbar
3. Click **Start Scanning** — the extension will scroll through your following list and collect account data
4. The swipe UI appears automatically once scanning is complete
5. **Swipe right** (or press → / D) to **keep** someone
6. **Swipe left** (or press ← / A) to **unfollow** them
7. Press **Z** or **Backspace** to undo your last swipe
8. When you're done, review your choices in the results view
9. Optionally execute the unfollows — they're throttled with random delays to reduce risk

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `←` or `A` | Unfollow |
| `→` or `D` | Keep |
| `Z` or `Backspace` | Undo last swipe |

## ⚠️ Disclaimer

- **Use at your own risk.** Automated interactions with X may violate their Terms of Service. While the extension uses reasonable throttling, mass-unfollowing could trigger rate limits, temporary restrictions, or account flags.
- **No API usage.** This extension does not use the X/Twitter API. It operates entirely through DOM interaction on your already-authenticated browser session.
- **X's DOM may change.** This extension relies on X's current page structure. Updates to X's frontend could break functionality. If scanning or unfollowing stops working, the DOM selectors likely need updating.

## How It Works

The extension injects a content script on your `/following` page that:

1. **Scans** by scrolling through the page and reading `UserCell` elements from the DOM, extracting display names, handles, bios, and avatar URLs
2. **Overlays** a swipe UI on top of the page
3. **Unfollows** by scrolling back through the following list to find each account's cell and programmatically clicking the Following → Unfollow → Confirm buttons

## Contributing

Issues and PRs welcome. If X changes their DOM structure and breaks something, the selectors in `content.js` are the place to look (search for `data-testid` and `UserCell`).

## License

[MIT](LICENSE)

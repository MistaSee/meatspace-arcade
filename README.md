# Meatspace Arcade (working title)

Games that live in things you can pick up. Scan or tap an object with your phone and a game opens in the browser. No app.

The first one is **The Cursed Coin**: a pocket dungeon crawl. Every 12 turns the coin flips itself, and the dungeon has to do what it says. Heads helps, tails doesn't, and both are silly. Runs last from 30 seconds to a few minutes. Every score goes on one shared scoreboard, the Hall of the Cursed.

## Run it

```bash
npm install
npm start
```

The server prints three addresses: one for this computer, one for phones on the same Wi-Fi, and the sticker sheet.

## Make a coin

1. Print the coin blank: `public/print/cursed-coin-blank.stl` (44 mm across, 3.6 mm thick). It prints flat, recess up, no supports.
2. Open `/print/` and print the sticker sheet at 100% scale. Each sticker is numbered and opens its own coin, so the Hall shows which coin a score came from.
3. Cut out a sticker and stick it in the recess.

The recess is 0.8 mm deep so that an NFC sticker can go underneath the paper one later. Then the same coin works by scan or by tap.

To change the coin's size, edit the numbers at the top of `tools/make-coin-stl.js` and run `npm run coin`. There is also an OpenSCAD version, `cursed-coin-blank.scad`.

## How it fits together

| Path | What it is |
| --- | --- |
| `server.js` | Serves the games, keeps the scoreboard in `data/scores.json`, makes QR codes, and sends `/c/<id>` to the right game. |
| `public/games/cursed-coin/` | The game. All player-facing words are in `copy.js`. |
| `public/print/` | Sticker sheet and coin blank. |
| `tools/make-coin-stl.js` | Generates the coin blank. |

Tags and QR codes hold a short address like `http://<host>/c/7`, not the game itself. The same coin keeps working when the game is updated.

To run it somewhere other than your Wi-Fi, set `PUBLIC_BASE` to the public address before starting, so the QR codes point there.

## Not decided yet

- Name: Meatspace Arcade and Vibe Arcade are both working titles.
- Where it lives on the internet. Until that's chosen, it only works for phones on the same Wi-Fi as the computer running it.
- Licences for code, art and 3D files.
- Whether the scoreboard needs protecting. A determined person can post a fake score.

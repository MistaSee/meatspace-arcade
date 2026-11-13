# Meatspace Arcade (working title)

Phone games you play with your whole arm, not just your thumbs. They open in the phone's browser, with no app to install.

**Play:** https://mistasee.github.io/meatspace-arcade/

| Game | How you play |
| --- | --- |
| **Egg-and-Spoon Race** | Hold the phone flat like a spoon and walk 30 real steps without the egg rolling off. The phone counts your steps. Drop it and it is back to the start line. Fastest time wins. |
| **Shake Duel** | Tilt the phone to dodge incoming blows, then shake it hard to punch. A ladder of daft opponents, from a duck to an extremely large swan. |
| **Tilt Lab** | Not a game: a test bench for tuning tilt and shake on a real phone. |

Tilt, shake and step counting only work on a secure (https) address, so phones need the public site or another https address. On a computer, keys stand in: arrows tilt, space shakes, Enter takes a step. Add `?debug` to a game's address to see the raw sensor numbers.

## Run it locally

```bash
npm install
npm start
```

The local server also keeps a shared scoreboard for each game. The public site is static, so there each phone keeps its own scores for now.

## How it fits together

| Path | What it is |
| --- | --- |
| `public/` | The website. Published to GitHub Pages on every push to `main`. |
| `public/shared/motion.js` | Tilt, shake and footstep sensing, shared by the games. |
| `public/shared/hall.js` | Scoreboards: shared when the local server is running, on the phone otherwise. |
| `public/games/<game>/copy.js` | Every word the player sees in that game. |
| `server.js` | Local server with the shared scoreboards. |
| `tools/make-qr.js` | Makes the home page's QR codes. Set `PUBLIC_BASE` if the site moves. |
| `physical/` | A 3D-printable 44 mm token with a recess for a QR or NFC sticker (`npm run coin` remakes it). |

## Not decided yet

- Name: Meatspace Arcade is a working title.
- A shared scoreboard on the public site needs a small server somewhere.
- Licences for code, art and 3D files. Until one is chosen, nothing here is licensed for reuse.

# Ball Crash

A 3D arcade game. Spin the tower, drop the ball through the gaps, and crash your way to the bottom.

## Play

**Play online: https://ty-robb.github.io/ball-crash/**

Or open `index.html` in a browser. It works straight from disk with no server or install needed (three.js is bundled in `vendor/`).

## Modes

Pick a mode from the home screen.

### Levels

- Reach the checkered platform at the bottom **without crashing** to pass the level and unlock the next one. A crash restarts the level.
- Each level has **3 gold stars** floating in gaps on the way down. Drop through a star to collect it, or smash its platform with a fireball.
- Each level gets a 1–3 star rating on the level-select screen. Replay any unlocked level to improve it.
- Difficulty ramps up gradually. Each level adds one platform and a few more hazards. From level 6, some gaps get narrower and some platforms spin on their own.

### Endless

- One tower that never ends, and you only get one life. Your score is how many platforms deep you get.
- Every **50 platforms** a checkered ring marks a new **stage**, with new colours and a clear step up in difficulty.
- Your best depth is saved.

## Rules (both modes)

- The ball bounces on the coloured platforms. Spin the tower so it falls through the gaps.
- **Red glowing segments with spikes are hazards.** Touch one and you crash.
- Fall through **3 gaps in a row without bouncing** to light up the **Fireball**. While it burns, the ball smashes
  straight through any platform, hazards included. Every gap you pass while on fire adds more fuel.
- The platform right under a gap you just fell through never has spikes waiting for you.

## Controls

| Action | Input |
| --- | --- |
| Rotate tower | Drag (mouse / touch), or ← → / A D |
| Menu buttons | Click / tap, or Space / Enter for the highlighted one |
| Back to home | ⌂ button or Esc |
| Mute | M, or the speaker button |

Progress (unlocked levels, stars, best depth) is saved in your browser.

## Files

- `index.html`: page, HUD, menus and styles
- `game.js`: game logic, rendering, audio (Web Audio synth, no sound files)
- `vendor/three.min.js`: three.js r149 (MIT, see `vendor/THREE-LICENSE.txt`)

Add `?debug` to the URL to expose a `window.ballCrash` helper for testing.

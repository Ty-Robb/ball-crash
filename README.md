# Ball Crash

A 3D arcade game. Spin the tower, drop the ball through the gaps, and crash your way to the bottom.

## Play

Open `index.html` in a browser. It works straight from disk with no server or install needed (three.js is bundled in `vendor/`).

## Controls

| Action | Input |
| --- | --- |
| Rotate tower | Drag (mouse / touch), or ← → / A D |
| Start / retry / next level | Click, tap, Space or Enter |
| Mute | M, or the speaker button |

## Rules

- The ball bounces on the coloured platforms. Spin the tower so it falls through the gaps.
- **Red glowing segments with spikes are hazards.** Touch one and you crash.
- Fall through **3 gaps in a row without bouncing** to light up the **Fireball**. While it burns, the ball smashes
  straight through any platform, hazards included. Every gap you pass while on fire adds more fuel.
- Reach the checkered platform at the bottom to clear the level.
- Points: each gap is worth 10 × your current streak, each smash is +25, and clearing a level gives +50 × the level number.

Later levels add more platforms and hazards, narrower gaps, and platforms that spin on their own. Your level and best score are saved in the browser.

## Files

- `index.html`: page, HUD and styles
- `game.js`: game logic, rendering, audio (Web Audio synth, no sound files)
- `vendor/three.min.js`: three.js r149 (MIT, see `vendor/THREE-LICENSE.txt`)

Add `?debug` to the URL to expose a `window.ballCrash` helper for testing.

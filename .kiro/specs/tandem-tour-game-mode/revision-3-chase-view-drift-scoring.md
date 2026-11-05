# Revision 3: behind-the-car view and harder drift line

Supersedes the top-down view in revision 2. Everything else in revision 2 (tilt steering, server-run drive simulation,
accuracy cap, anti-retry rule, prizes, repair kits) is unchanged.

## What changed

- **View:** the drive is seen from behind the member's own car, in a pseudo-3D chase view drawn with Canvas 2D (`replay/chase-renderer.ts`).
  The road is the real course geometry projected strip by strip. The car is a small low-poly model built in code, tinted with the
  main colour of the chosen card's picture (`replay/car-colour.ts`, falls back to a rarity colour if the picture can't be read).
- **Not a race:** no rival car is drawn. The rival's points show in the score pill only.
- **Drift line:** big wall-to-wall sweeps like a real drift car. Each bend is built from three key points joined by smooth curves:
  in from the OUTSIDE wall (29 units out), clip the INSIDE wall at the apex (31 units, 7 off the wall), then out to the outside wall
  again. On the straight between two corners the line sweeps right across the road to the other wall for the next entry. Where two
  bends join (a chicane) the line goes straight from one inside clip to the next. Short bends clip less deeply. The car body hangs
  out up to about 50 degrees past its direction of travel.
- **Scoring idea:** the closer the line is held to the wall without touching it, the more it scores, because the line itself runs
  next to the wall and a wall hit scores nothing. "CLOSE CALL!" shows when the car holds the line within 6 units of the wall.
- **Plant:** faster and more responsive (KS 9, CD 4.2, KU 390). Full lean is 43 units, a little past the wall (38), so over-steering is punished.
- **Removed:** the top-down renderer and the replay timeline (`renderer.ts`, `build-timeline.ts`). Theme colours moved to `replay/theme.ts`.

## Balance (scripts/tour-sim.ts, 40 Tours per cell)

| Driver skill | Line accuracy | Average wins |
| --- | --- | --- |
| 0.10 | 0.49 | 2.5 to 3.5 |
| 0.35 | 0.62 | 3.5 to 4.6 |
| 0.60 | 0.76 | 4.0 to 6.0 |
| 0.85 | 0.92 | 5.3 to 7.4 |

A perfect inverse-dynamics driver scores 1.00 on every course tested, so the ceiling is the player, not the physics.
Chicane-heavy courses cap even a perfect driver at about 0.86 to 0.9 because the weaving is so quick. Watch the "Avg line" column on the admin page and move "Neutral accuracy" if
real players sit well under 0.5.

## Tasks

- [x] C1. Chase renderer (road, barriers, sky, scenery, drift ribbon, cones, car model, smoke, sparks, wall glow, HUD)
- [x] C2. Out-in-out drift line, retuned plant and autopilot, re-run balance
- [x] C3. Car colour from the card picture (drive spec carries tier and picture)
- [x] C4. Remove top-down renderer and timeline
- [ ] C5. Real-phone testing: car size, camera height, steering feel, frame rate on older phones

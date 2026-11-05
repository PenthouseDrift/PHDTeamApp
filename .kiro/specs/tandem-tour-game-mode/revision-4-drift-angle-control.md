# Revision 4: the car follows the line, the player sets the drift angle

Supersedes the steering model in revisions 2 and 3. The chase view, the sweeping drift line, the server-run simulation, the
accuracy cap, prizes and repair kits are unchanged.

## What changed

- **The car drives the drift line perfectly by itself.** Position along and across the road is no longer controlled.
- **Tilt (or arrows, or finger) sets the drift ANGLE.** Tilt toward the bend to hang the tail out. Right-hand bends want a right
  lean, left-hand bends a left lean, so between two corners the player flicks across. The lean flips half way across the straight.
- **More angle = more points.** A moment scores `(angle / limit)^1.3`, worth up to 1.7x more where the line runs hard against the wall.
  A clip point counts when at least 60% of the limit is held as the car passes it.
- **Angle multiplier:** shown live under the gauge. It is the same number the score uses: `1 + 3 * (angle / limit)^1.3`, so x1.0 with the car
  straight, about x2.5 at 60% of the limit and x4.0 right at the limit. It drops to x1 while the car is out of control after a burst or a wall hit.
- **Every car has a grip limit** (0.42 to 0.85 of full tilt) from its tyre condition and grip stat:
  `0.42 + 0.26 * condition + 0.17 * grip/25`. Worn tyres lower it, so the same angle is riskier later in a Tour.
  The server works the limit out itself from the car it holds; the browser copy is only for the warnings.
- **Warnings:** from 85% of the limit the gauge turns amber, the screen glows and shakes, the controller buzzes. Over the limit it goes red.
- **Burst:** over the limit, tyre heat builds (faster the further over). At full heat a wheel bursts: 1.3 s of almost no control,
  zero points, -8% off that corner, and extra wear on the car (tuning `burstWear`, default 15).
- **Wall:** far enough over the limit (less far where the line is hard against the wall) the car spins into the wall: 1 s of almost
  no control, zero points, -12% off that corner, and extra wear (tuning `wallWear`, default 6).
- **Keyboard** nudges the angle and holds it; the touch slider is the angle directly.
- **Result screen** lists bursts, wall hits and the condition lost from driving too hard.

## Balance (scripts/tour-sim.ts, 40 Tours per cell)

Holding a steady angle on a fresh car (limit 0.76): 0.6x the limit scores 0.67, 0.8x scores 0.81, 0.97x scores 0.93, and 1.03x drops to
0.66 with about two bursts. Walls start at about 1.25x. Simulated drivers: skill 0.10 scores 0.26, 0.35 scores 0.59, 0.60 scores 0.74
and 0.85 scores 0.85, winning 1 to 7 rounds from the worst to the best car and driver.

## Tasks

- [x] D1. Angle-based drive simulation, grip limit, heat, burst, wall
- [x] D2. Server computes the limit and applies burst and wall wear
- [x] D3. Gauge, shake, glow, sparks, smoke and banners in the chase view
- [x] D4. Autopilot and balance simulator
- [ ] D5. Real-phone testing: how much tilt feels right for 76% (tilt sensitivity), how fast heat builds, shake strength

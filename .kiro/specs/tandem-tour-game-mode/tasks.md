# Implementation Plan: Tandem Tour

## Overview

> **Revision 2:** the animated replay in Phase 3 is replaced by a playable tilt-steering drive. See `revision-2-playable-race.md`. The tasks for it are at the end of this file.

Build Tandem Tour in four shippable phases. Phase 1 gives a playable, balanced loop with no animation, behind early access. Phase 2 adds the animated top-down replay. Phase 3 adds the admin page, ladder, streak and social touches. Phase 4 tunes and opens the mode up. Tasks marked with `*` are optional (tests and extras) and can be skipped for a faster first version.

## Tasks

- [ ] 1. Foundations
  - [x] 1.1. Create `src/tcg/tour/types.ts` with the types in the design (Stance, TourRunState, TourGhost, BattleLog, TourConfig and the view types) _Requirements: 3, 7, 8, 11_
  - [x] 1.2. Create `src/tcg/tour/config.ts` with defaults, `sanitizeTourConfig`, `loadTourConfig` (Redis `tcg:tour:config`, falling back to defaults) and `saveTourConfig` with the change log _Requirements: 11, 15_
  - [x] 1.3. Add `"tour"` to `TcgTab` in `src/tcg/types.ts` and a tab entry in `TcgApp.tsx` (desktop nav and phone bottom bar), rendering a lazy-loaded `TourTab` _Requirements: 1.1, 17.1_
  - [x] 1.4. Add a feature gate helper `canAccessTour(userId, role)` using `hasClashEarlyAccess` and the config switches _Requirements: 1.3, 1.5_

- [ ] 2. Engine (pure code)
  - [x] 2.1. Create `condition.ts` (multiplier, wear, repair amounts by rarity) _Requirements: 8.2, 8.5, 8.6, 4.6_
  - [x] 2.2. Create `stance.ts` (triangle, bot stance weighting from the last two stances) _Requirements: 5.6, 8.3_
  - [x] 2.3. Create `upgrades.ts` with at least 20 catalogue entries across the five categories and `rollOffers(seed, round, held, config)` _Requirements: 4.2, 4.4, 4.5_
  - [x] 2.4. Create `engine.ts` `resolveRound` using `evaluateCornerMatchup`, condition, upgrades, stance bonus and gamble swing, with the winner rule and `motion` hints _Requirements: 8.1 to 8.9_
  - [x] 2.5. Create `rating.ts` (Elo-style change, ladder points) _Requirements: 12.1, 12.2_
  - [ ] 2.6* Write unit tests: determinism for the same seed and choices, stance triangle, condition bounds, no draws, rating symmetry _Requirements: 8.8, 8.9_
  - [x] 2.7. Create `scripts/tour-sim.ts` to play many Tours between generated loadouts and print win histograms and prize cost per paid run _Requirements: 8, 11_
  - [x] 2.8. Run the simulator, check the initial targets in the design and adjust the default tuning numbers _Requirements: 8, 11_

- [ ] 3. Run state, ghosts and actions
  - [x] 3.1. Create `ghosts.ts` (`saveGhost`, `pickGhost` with rating band widening, trimming, opt-out handling) _Requirements: 6_
  - [x] 3.2. Create a bot builder that wraps `rival-ai.ts` and `buildChallengeOpponent` for a Round number and rating _Requirements: 6.5_
  - [x] 3.3. Create `rewards.ts` (prize lookup with multipliers, idempotent grant of P-Credits and pack credits, streak update with freezes, daily record) _Requirements: 11, 13_
  - [x] 3.4. Create `actions.ts` `getTourLobby`, `getTourEligibleCards`, `startTour` (atomic charge with refund on failure, one active run) _Requirements: 2, 3.8, 11.4, 11.5_
  - [x] 3.5. Add `pickUpgrade`, `rerollOffers`, `useRepairKit` (consumes the kit card once) and `beginRound` with validation against stored state and idempotency keys _Requirements: 2.6, 4, 7.4, 7.5_
  - [x] 3.6. Add `playRound` (resolve, save ghost, update state, return Battle Log) and `continueAfterRound` _Requirements: 5, 7, 8_
  - [x] 3.7. Add `endTour` (prize, rating, ladder, streak, activity log, release active key) and `getActiveTour` for resume _Requirements: 3.4, 3.6, 10.3, 11.6_
  - [x] 3.8. Add the per-member rate limit and the daily paid-run limit including the member's own lower limit _Requirements: 7.6, 11.10, 16.3_
  - [x] 3.9. Add the idle sweeper route `/api/cron/tour-sweep` (secured with `CRON_SECRET`) and register it in `vercel.json` _Requirements: 3.7_
  - [ ]* 3.10. Write action tests with a Redis mock: idempotent repeats, one active run, refund on failure, daily limit _Requirements: 7.5, 11.5_

- [ ] 4. Checkpoint: server complete
  - Run `npx tsc --noEmit`, eslint on changed files and the simulator. Ask the owner whether to continue.

- [ ] 5. Plain playable UI (no animation yet)
  - [x] 5.1. Create `TourTab` (lobby: rating, streak placeholder, free run status, price, prize table, notes, Start) _Requirements: 1.2, 11.7_
  - [x] 5.2. Create `TourLoadout` with Auto-pick best and reasons for ineligible cards _Requirements: 2_
  - [x] 5.3. Create `TourPitPhase` (three upgrade cards, reroll, repair kits, next-round preview) _Requirements: 4_
  - [x] 5.4. Create `TourRoundSetup` (car choice with Condition bars, stance choice, triangle explainer, optional timer) _Requirements: 5_
  - [x] 5.5. Create `TourResult` and `TourSummary` (scores per corner, reasons, near-miss hint, next prize tier, prizes, rating change) _Requirements: 10_
  - [x] 5.6. Create `TourTutorial` (4 steps, skippable, reopenable) _Requirements: 1.4_
  - [x] 5.7. Wire the flow end to end with a text replay of the Battle Log as a stand-in and test a full Tour in the browser _Requirements: 3, 5, 10_

- [ ] 6. Checkpoint: playable loop
  - Release to early access. Collect feedback and tune before building the animation.

- [ ] 7. Animated top-down replay
  - [x] 7.1. Create `replay/track-geometry.ts` mapping the 26 corner ids to 6 base shapes and building a course with theme props from the track card _Requirements: 9.1, 9.2_
  - [x] 7.2. Create `replay/build-timeline.ts` converting a Battle Log to keyframes and events, including the lead/chase swap _Requirements: 9.3, 9.4, 9.5, 9.6_
  - [x] 7.3. Create `replay/sprites.ts` (procedural cars with liveries, smoke particle pool, tyre mark layer) _Requirements: 9.2_
  - [x] 7.4. Create `replay/renderer.ts` (canvas loop, camera, HUD, score pop-ups, event banners, frame-time based quality drop, pause when hidden) _Requirements: 9.2, 9.7_
  - [x] 7.5. Create `TourReplay.tsx` (mount, controls for skip, 1x/2x and replay, cleanup on unmount) _Requirements: 9.6_
  - [x] 7.6. Add reduced-motion summary mode and the `aria-live` narration _Requirements: 9.8, 9.10_
  - [x] 7.7. Make the layout work in portrait and landscape _Requirements: 9.9_
  - [ ]* 7.8. Write unit tests for the timeline (duration bounds, determinism) and track geometry (fits the canvas, joins up) _Requirements: 9.5, 9.6_
  - [ ] 7.9. Test on an iPhone (Safari and PWA), an Android phone and desktop, and tune particle counts _Requirements: 9.7, 17.4_

- [ ] 8. Checkpoint: animation
  - Run `npx tsc --noEmit` and eslint, and review the replay with the owner.

- [ ] 9. Admin, ladder, streak and social
  - [x] 9.1. Create `admin-actions.ts` (`getTourAdminData`, `saveTourConfigAction`, `getTourEconomy`, `endStuckTour` with refund), admin-checked _Requirements: 15_
  - [x] 9.2. Create the admin page `src/app/(admin)/admin/driftclash/tour/page.tsx` and `TourAdmin.tsx` (switches, prices, free runs, prize tables, upgrade overrides, tuning, change log, economy panel, net-negative warning) and link it from the DriftClash admin page _Requirements: 15, 11.11_
  - [ ] 9.3. Add the weekly ladder (points, view, rank and gap) and the cron `/api/cron/tour-ladder` for payouts with an idempotency marker and notifications _Requirements: 12.2 to 12.5_
  - [ ] 9.4. Add the daily streak display, freezes and milestone rewards in the lobby _Requirements: 13_
  - [ ] 9.5. Add preset reactions, "Your team beat/lost to" notes, Rematch and Rival of the week _Requirements: 6.7, 14.1 to 14.3_
  - [ ] 9.6. Add member settings for opt-out and a personal daily paid-run limit, and the responsible-play note _Requirements: 14.4, 16.2, 16.3_

- [ ] 10. Tuning and launch
  - [ ] 10.1. Rerun the simulator against the real early-access data (win histogram, prize cost) and adjust the config defaults _Requirements: 11, 15_
  - [ ] 10.2. Pre-seed Ghosts with Bots if the Ghost pools are thin _Requirements: 6.5_
  - [ ] 10.3. Set the real prices and prize table in the admin page, turn early access off and announce the mode _Requirements: 1.3, 11_
  - [ ] 10.4. Final check: `npx tsc --noEmit`, eslint on changed files, a full Tour on desktop and phone, and a review of the economy panel after one day _Requirements: all_

## Notes

Phase 1 status: tasks 1 to 3 and 5 are built. Differences from the plan, found while building:
- Server logic lives in `src/tcg/tour/service.ts` (plain functions) with `actions.ts` as the thin "use server" layer, so the cron sweeper can call the same code without exposing it to the browser. Ghost, config and profile storage are in `store.ts`; prizes, streaks and rating are in `service.ts` (`finishTour`).
- Tours are logged in `tcg:tour:ledger`, not the shared activity log, because that log feeds the revenue reports and P-Credits are not money.
- Bots are sized from the strongest two cars in the member's loadout and get a hidden flat "form" bonus per corner (config `tuning.botEdge`), tuned with `scripts/tour-sim.ts` so members of every card rarity average about 3.5 wins against bots.
- Each crew card can be used once per Round; the best unused crew card is chosen for each corner automatically.
- Empty car and crew slots are filled up to 3 with loaners.
- The idle sweeper runs once a day (`vercel.json`), so an idle Tour may stay open for up to 48 hours before it is ended.
- Admin page built at `/admin/driftclash/tour` (switches, early access list, runs and prices, prize table, streak rewards, upgrade catalogue, tuning, economy panel, stuck Tours with refund, change log). It is linked from the DriftClash admin page.
- The animated replay is built (`src/tcg/tour/replay/` and `TourReplay.tsx`). The lead changes hands according to who won each corner, instead of a fixed swap at half-way. A Round's result is shown after the replay finishes or is skipped.
- Not built yet: the weekly ladder view and payouts, reactions, rematch, rival of the week, and testing the replay on real phones (7.9).

- Tandem Clash code stays unchanged except for the tab registration.
- No real-money prizes and no paid power at any phase.
- Each phase can ship by itself, and Phase 1 is enough to start collecting Ghosts.

## Revision 2 tasks: the playable race

- [x] R1. Track geometry gets arc ids and curvature; course timing is extracted so the browser and server share it
- [x] R2. `drive-sim.ts`: the deterministic steering simulation, racing line, gates, walls and accuracy
- [x] R3. Engine split into prepare (cards, stance, upgrades) and finish (skill multiplier, winner, wear)
- [x] R4. Server: `startDrive` and `submitDrive` with trace validation, ghost accuracy and driving stats
- [x] R5. Balance simulator with drivers of different skill; tune skill swing and bot driving level
- [x] R6. Steering controls: tilt (iOS permission, calibration), touch slider, keyboard
- [x] R7. Drive screen: turning camera, racing-line ribbon, gates, pace readout, countdown
- [x] R8. Wire into the Round flow, show driving stats, drop the passive replay from the flow
- [ ] R9. Test on real phones (iPhone and Android, portrait and landscape) and tune the feel

Revision 2 status: R1 to R8 are built and checked (simulation determinism, a full Tour against the real database with recorded drives, the steering maths, and screenshots of the drive view). R9 (testing on real phones and tuning the feel) is still to do and is the main risk: the constants in `replay/drive-sim.ts` and the steering sensitivity were set with simulated drivers, not people.

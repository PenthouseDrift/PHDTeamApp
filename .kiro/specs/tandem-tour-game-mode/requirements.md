# Requirements Document

> **Revision 2 (see `revision-2-playable-race.md`):** the race is now played by tilting the phone. Requirement 9 (animated replay) is replaced, and Requirements 5, 7 and 8 are changed by it. Where this document and the revision disagree, the revision wins.

## Introduction

Tandem Tour is a new, longer game mode for the Penthouse Drift card game (the `src/tcg` area of the app). The existing mode, Tandem Clash, is a quick 3-corner match that takes about two minutes. Tandem Tour is a run-based mode that takes about 6 to 8 minutes. A member brings a deck of their own cards (cars, crew and repair kits) into a "tour" of up to 8 rounds. Between rounds they draft upgrades, manage car condition, pick which car to run and secretly pick a driving stance. Each round is a tandem battle against a saved copy of a real member's team (a "ghost"), so there is a real person to read without anyone needing to be online at the same time. Every battle is shown as a fully animated top-down replay.

The mode is designed to be easy to learn, quick to replay and varied from run to run, using patterns that work in comparable games: Super Auto Pets (shop, then battle, then repeat), Hearthstone Battlegrounds (real players as opponents), Marvel Snap (short matches, hidden simultaneous choices), and Slay the Spire and Balatro (run-based variety, unlocks over permanent power). Retention comes from short runs, variety, a daily streak and a weekly ladder. It does not come from permanent power for paying members.

Entry prices, free runs and prizes are all adjustable by an admin without a code change.

This document is the first of three spec documents (requirements, design, tasks). Numbers marked "initial" are starting values to be tuned with the balance simulator (see design) and are stored in admin configuration, not hard-coded.

## Glossary

- **Tour**: One run of Tandem Tour, made of up to 8 Rounds, ended by 3 Strikes or by finishing the last Round.
- **Round**: One tandem battle against one Ghost, plus the Pit Phase that precedes it.
- **Strike**: A life. A Round lost costs one Strike. A Tour ends at 3 Strikes (initial).
- **Win Count**: The number of Rounds a member has won in the current Tour. It decides prizes.
- **Loadout**: The cards a member brings into a Tour: up to 4 cars, 4 crew cards and 3 repair kits (initial). Cars and crew are never consumed; a repair kit is consumed only when it is used.
- **Loaner**: A weak starter card that fills an empty Loadout slot, as in Tandem Clash.
- **Condition**: A per-Tour number from 0 to 100 on each car. It lowers a car's scores as it drops and is restored by repair kits. It never changes the member's real card durability or faults.
- **Pit Phase**: The step between Rounds where the member drafts an upgrade, uses repair kits and sees the next Round.
- **Upgrade**: A temporary card offered in the Pit Phase. It lasts for the Tour only and is never added to the member's collection.
- **Stance**: A secret choice made before each Round: Attack, Hold or Gamble. Stances form a triangle (Attack beats Hold, Hold beats Gamble, Gamble beats Attack).
- **Ghost**: A saved copy of another member's team, upgrades and Stance for a given Round, taken while they played their own Tour.
- **Bot**: A generated opponent used when no suitable Ghost exists.
- **Battle Log**: The server's ordered record of everything that happened in a Round, from which the client draws the animated replay.
- **Replay**: The animated top-down view of a Battle Log.
- **Tour Rating**: A number that goes up and down with results and is used for matchmaking and the weekly ladder.
- **Tour Config**: The admin-editable settings for prices, free runs, prizes, round count, strikes and tuning values.
- **Pit Credits**: P-Credits, the existing in-game currency stored in the `pCredits` field of the member's hash. No new currency is added.
- **Engine**: The pure TypeScript code that resolves a Round. It reuses the existing corner scoring in `src/tcg/progression.ts`.

## Requirements

### Requirement 1: Access and Navigation

**User Story:** As a member, I want to find Tandem Tour easily and understand it quickly, so that I can start a run without reading a manual.

#### Acceptance Criteria

1. THE Platform SHALL add a "Tour" tab to the card game navigation, shown on desktop and on the phone bottom bar, alongside the existing tabs.
2. WHEN a signed-in member opens the Tour tab, THE Platform SHALL show the Tour lobby with: the current Tour Rating, the daily free run status, the entry price of a paid run, the current weekly ladder position, and a "Start a Tour" button.
3. WHILE the mode is in early access, THE Platform SHALL show the Tour tab only to members who pass the existing `hasClashEarlyAccess` check, and SHALL show it to all signed-in members once an admin turns early access off in the Tour Config.
4. WHEN a member opens the Tour tab for the first time, THE Platform SHALL show a short interactive tutorial (no more than 4 steps) covering Stances, Condition and upgrades, which the member can skip and reopen from the lobby.
5. IF an admin has disabled Tandem Tour in the Tour Config, THEN THE Platform SHALL hide the Tour tab and reject any Tour action from the server with a clear message.

### Requirement 2: Loadout

**User Story:** As a member, I want my own cards to matter, so that collecting and upgrading cards makes my runs stronger.

#### Acceptance Criteria

1. WHEN a member starts a Tour, THE Platform SHALL let them pick up to 4 car cards, 4 crew cards and 3 repair kit cards (maintenance cards) from their collection.
2. THE Platform SHALL fill any empty slot with a Loaner, except repair kit slots, which stay empty.
3. THE Platform SHALL exclude cars that are currently broken (`isCarBroken`) from selection and SHALL show why.
4. THE Platform SHALL exclude cards listed for sale on the Marketplace from selection.
5. WHEN a Tour starts, THE Platform SHALL lock the chosen Loadout in a server-side snapshot so the cards cannot be changed, sold or deleted into the run, and SHALL leave the member's real cards otherwise untouched.
6. WHEN a member uses a repair kit during a Tour, THE Platform SHALL consume that card from the member's collection (it is removed, as repair kits are in the rest of the game). Repair kits that were brought but not used SHALL stay in the collection when the Tour ends. The Platform SHALL show this clearly on the Loadout screen and ask the member to confirm each use.
7. THE Platform SHALL NOT change any real car's durability, battles remaining or faults as a result of a Tour.
8. THE Platform SHALL offer an "Auto-pick best" button that fills the Loadout with the member's strongest eligible cards.

### Requirement 3: Tour Structure

**User Story:** As a member, I want a clear run with stakes and a sense of progress, so that each Tour feels worth finishing.

#### Acceptance Criteria

1. A Tour SHALL have up to 8 Rounds (initial; admin-configurable from 3 to 12) and the member SHALL have 3 Strikes (initial; admin-configurable from 1 to 5).
2. WHEN a member loses a Round, THE Platform SHALL remove one Strike and continue the Tour unless no Strikes remain.
3. WHEN a member wins a Round, THE Platform SHALL add one to the Win Count.
4. WHEN the member has lost their last Strike OR has finished the last Round, THE Platform SHALL end the Tour and show the Tour Summary.
5. THE Platform SHALL show the Round number, Win Count, remaining Strikes and each car's Condition at all times during a Tour.
6. IF a member leaves a Tour part-way through, THEN THE Platform SHALL keep the Tour state and let them resume from the same step for up to 24 hours.
7. WHEN a Tour has been idle for more than 24 hours, THE Platform SHALL end it as if the member had lost all remaining Strikes, award prizes for the Win Count reached, and SHALL NOT refund the entry price.
8. A member SHALL have at most one active Tour at a time.

### Requirement 4: Pit Phase and Upgrades

**User Story:** As a member, I want meaningful choices between rounds, so that every run builds differently.

#### Acceptance Criteria

1. WHEN a Round is won or lost and the Tour continues, THE Platform SHALL show a Pit Phase before the next Round.
2. THE Pit Phase SHALL offer 3 random Upgrades drawn by the server, and SHALL let the member keep exactly 1 of them.
3. THE Pit Phase SHALL let the member reroll the 3 offers once per Tour for free, and SHALL allow more rerolls only if the Tour Config sets a reroll price above zero.
4. THE Platform SHALL provide at least 20 distinct Upgrades at launch, in these categories: Tuning (stat boosts for a number of Rounds), Crew Call (a temporary crew effect), Track Intel (reveals or changes information about the next Round), Pit Stop (restores Condition) and Sponsor (a once-per-Tour bonus).
5. THE Platform SHALL give each Upgrade a rarity (common, rare, epic) that controls how often it is offered, with the weights stored in the Tour Config.
6. THE Pit Phase SHALL let the member spend repair kits from the Loadout to restore a car's Condition by an amount set by the kit's rarity, and a spent kit SHALL be consumed from the collection once, even if the request is repeated.
7. THE Pit Phase SHALL show the next Round's track card, its 3 corner types and the Ghost's visible information (name, car name, car rarity and Tour Rating) before the member commits.
8. THE Platform SHALL NOT show the Ghost's Stance for the coming Round to the member.

### Requirement 5: Round Setup (Car and Stance)

**User Story:** As a member, I want a hidden-choice decision each round that feels like reading another person, so that the game has human tension.

#### Acceptance Criteria

1. BEFORE each Round, THE Platform SHALL ask the member to choose one car from their Loadout and one Stance.
2. THE Platform SHALL explain the Stance triangle in the Round setup screen and show the result of the last Round's Stance choice.
3. THE Platform SHALL optionally apply a decision timer (initial: off; admin-configurable from 15 to 120 seconds). WHEN the timer expires, THE Platform SHALL choose the strongest healthy car and the Hold Stance.
4. THE Platform SHALL submit the choice to the server, which SHALL store it before resolving the Round, and SHALL NOT allow the choice to change after the Round is resolved.
5. WHEN a Ghost was captured, THE Platform SHALL use the Stance that the Ghost's owner actually chose in that Round of their own Tour.
6. WHEN the opponent is a Bot, THE Platform SHALL choose the Bot's Stance using a weighted random choice that depends on the member's last two Stances, as set in the Tour Config.

### Requirement 6: Opponents and Matchmaking

**User Story:** As a member, I want to fight real people's teams without waiting for them, so that every round feels like a person, not a script.

#### Acceptance Criteria

1. WHEN a member completes a Round of a Tour, THE Platform SHALL save a Ghost snapshot for that Round containing: owner id, display name, Round number, car used, crew and Upgrades held at that point, Condition, Stance chosen and Tour Rating.
2. THE Platform SHALL keep at most 300 Ghosts per Round number (initial) and SHALL remove the oldest when the limit is reached.
3. WHEN choosing an opponent, THE Platform SHALL pick a random Ghost for the current Round number whose Tour Rating is within a band of the member's Tour Rating, widening the band step by step until a Ghost is found, up to the whole list.
4. THE Platform SHALL NOT pick a Ghost owned by the same member, nor a Ghost already faced in the same Tour.
5. IF no Ghost can be found, THEN THE Platform SHALL generate a Bot sized for the Round number and the member's Tour Rating, using the existing rival generation (`rival-ai.ts`).
6. THE Platform SHALL show the Ghost owner's display name or nickname and nothing else about them, SHALL NOT show their email, and SHALL honour any opt-out the member has set (Requirement 14).
7. WHEN a member's Ghost is used by another member, THE Platform SHALL add a line to the owner's next Tour lobby ("Your team beat/lost to a challenger") without waiting for the owner to be online.

### Requirement 7: Server-Authoritative Resolution

**User Story:** As a member, I want a fair ladder, so that nobody can fake a win.

#### Acceptance Criteria

1. THE Platform SHALL create and store Tour state on the server and SHALL accept only choices from the client (Loadout, Upgrade picks, repairs, car and Stance).
2. THE Platform SHALL generate all randomness (Upgrade offers, corners, track, debuffs, Bot choices and Gamble variance) on the server, from a per-Tour seed made with a cryptographically secure source.
3. THE Platform SHALL resolve each Round on the server and SHALL return a Battle Log, the new Tour state and any prizes.
4. THE Platform SHALL validate every client choice against the stored Tour state (for example, the car is in the Loadout, the Upgrade was offered, the step is correct) and SHALL reject anything else with a clear error.
5. THE Platform SHALL make every Tour action idempotent per step, so that repeating a request does not repeat a Round, a prize or a charge.
6. THE Platform SHALL rate-limit Tour actions per member (initial: 30 per minute).

### Requirement 8: Battle Model

**User Story:** As a member, I want battles to be understandable and fair, so that I can see why I won or lost.

#### Acceptance Criteria

1. EACH Round SHALL be a tandem battle of 3 corners, rolled by the server from the existing corner pool, with one UK track card and one debuff for each side per corner, using the existing scoring in `evaluateCornerMatchup`.
2. THE Engine SHALL apply Condition to a car's score by a multiplier from 0.80 (Condition 0) to 1.00 (Condition 100) (initial).
3. THE Engine SHALL apply the Stance triangle by adding a bonus (initial: 4 points per corner) to the side whose Stance beats the other, and no bonus on a tie.
4. WHERE a side chose Gamble, THE Engine SHALL add a random swing to each corner score (initial: from -3 to +6), drawn from the Tour seed.
5. WHERE a side chose Attack, THE Engine SHALL lower that car's Condition by an extra amount (initial: 8) after the Round.
6. THE Engine SHALL lower the Condition of the car used by a base amount (initial: 18) after each Round, and SHALL NOT lower the Condition of cars that were not used.
7. THE Engine SHALL apply Upgrades whose effect is active to the relevant car, crew or corner, and SHALL include each applied Upgrade in the Battle Log.
8. THE Engine SHALL decide the Round winner by corners won, then total score, then the higher Tour Rating, and SHALL NOT produce a draw.
9. THE Engine SHALL be deterministic: the same Tour seed, Round number and choices SHALL always produce the same Battle Log.
10. THE Engine SHALL NOT use the Tandem Clash finale mini-games in this version.

### Requirement 9: Animated Top-Down Replay

**User Story:** As a member, I want each battle to be a proper animated top-down tandem run, so that the mode feels different from the card-based Clash.

#### Acceptance Criteria

1. THE Platform SHALL draw each Round as a top-down view of a track built from the 3 rolled corner types, with the member's car and the opponent's car driving it in tandem.
2. THE Replay SHALL show: the lead car and chase car, the gap between them, drift angle and tyre smoke, tyre marks left on the track, a camera that follows the action, a score pop-up at each corner, and the track card's setting (colours or surface) as the backdrop.
3. THE Replay SHALL show the lead changing hands as the corners are won and lost: whoever wins a corner pulls ahead through it, by more when they win by more, so the lead and chase roles swap during the battle.
4. THE Replay SHALL show Stance reveals, Upgrade triggers and debuffs as short on-screen events tied to the moment they apply.
5. THE Replay SHALL be driven only by the Battle Log. It SHALL NOT decide the result or change scores.
6. THE Replay SHALL last between 18 and 30 seconds at normal speed and SHALL provide controls to skip to the result and to speed up to 2x.
7. THE Replay SHALL run at 60 frames per second on a current phone, SHALL fall back to a lower frame rate or simplified effects when the device cannot keep up, and SHALL pause when the browser tab is hidden.
8. WHERE the member's device is set to reduced motion, THE Replay SHALL show a short static summary of each corner instead of continuous animation, and SHALL still let the member see the full result.
9. THE Replay SHALL work in portrait on small phones and in landscape on desktop.
10. THE Platform SHALL give every moving part an accessible text equivalent (a live text summary of each corner) for screen readers.

### Requirement 10: Round Results and Feedback

**User Story:** As a member, I want clear feedback after each round, so that I learn and want to try again.

#### Acceptance Criteria

1. AFTER each Replay, THE Platform SHALL show a result card with: win or lose, each corner's scores, the reasons that mattered (Stance outcome, Condition effect, Upgrade effect, debuff, track), the Ghost's Stance and the member's Condition change.
2. WHEN a Round is lost by 5 points or fewer in total, THE Platform SHALL show a "so close" message with the one change that would most likely have turned it (for example, a different Stance).
3. WHEN the Tour ends, THE Platform SHALL show the Tour Summary with: Win Count, prizes, Rating change, best Round, the Upgrades used, and a "Run it again" button.
4. THE Platform SHALL show how much of the next prize tier is left to win (for example, "1 more win for the next prize").

### Requirement 11: Prices, Free Runs and Prizes (Adjustable)

**User Story:** As an admin, I want to set what a Tour costs and what it pays, so that I can tune the economy without a deployment.

#### Acceptance Criteria

1. THE Tour Config SHALL store: the number of free runs per day, the P-Credit entry price for paid runs, the maximum paid runs per member per day, and the reroll price.
2. THE Tour Config SHALL store a prize table that gives, for each Win Count from 0 to the Round count, a prize made of any of: P-Credits and unopened pack credits.
3. THE Tour Config SHALL store prize multipliers for the weekly ladder, the daily streak and early access, each of which can be set to 1 (no effect).
4. WHEN a member starts a Tour, THE Platform SHALL use a free run if one remains today, and otherwise SHALL charge the entry price from the member's P-Credits, and SHALL refuse to start the Tour if the balance is too low.
5. THE Platform SHALL charge and start the Tour in one atomic server step, so that a failure cannot leave a member charged with no Tour, or a Tour without a charge.
6. WHEN a Tour ends, THE Platform SHALL grant the prize for the Win Count exactly once, and SHALL record it in the member's activity history.
7. THE Platform SHALL show the entry price, the free runs left today and the full prize table in the lobby before the member starts a Tour.
8. THE prize for a Win Count SHALL be decided only by the Win Count and the Tour Config. THE Platform SHALL NOT use random prizes for paid runs.
9. THE Platform SHALL NOT sell or give any Loadout power, Upgrade, Stance or Rating for real money or for P-Credits, apart from the entry price itself.
10. THE Platform SHALL show the daily paid-run limit and the P-Credits spent on Tours today, and SHALL stop further paid runs when the limit is reached, with a clear message.
11. THE Tour Config SHALL keep a change log (who, when, old value, new value) for prices and prizes.

### Requirement 12: Tour Rating and Weekly Ladder

**User Story:** As a member, I want a rank to climb, so that I have a reason to come back.

#### Acceptance Criteria

1. THE Platform SHALL give each member a Tour Rating that starts at 1000 (initial) and changes after each Tour using an Elo-style formula based on the Rating of each Ghost faced and whether each Round was won.
2. THE Platform SHALL show a weekly ladder of the top members by Tour points earned that week, and SHALL reset it each Monday at 00:00 UK time.
3. WHEN a week ends, THE Platform SHALL grant the weekly ladder prizes set in the Tour Config to the top places, exactly once each, and SHALL post a notification to the winners.
4. THE Platform SHALL show the member their position and the points gap to the next place.
5. THE Platform SHALL show display names only on the ladder, with an opt-out that shows "Anonymous driver".

### Requirement 13: Daily Streak

**User Story:** As a member, I want a small reason to play every day, so that the habit forms without feeling like punishment.

#### Acceptance Criteria

1. THE Platform SHALL count consecutive days (UK time) on which a member completes at least one Tour and SHALL show the streak in the lobby.
2. THE Platform SHALL give the member one "streak freeze" that protects a missed day automatically, and SHALL grant a new freeze every 7 days of streak, up to a maximum of 2 (initial).
3. THE Tour Config SHALL store streak milestone rewards (for example at 3, 7 and 14 days) in the same form as prizes.
4. THE Platform SHALL NOT show anything that blames or shames a member for losing a streak.

### Requirement 14: Social Touches

**User Story:** As a member, I want little moments of interaction with other drivers, so that the mode feels alive.

#### Acceptance Criteria

1. AFTER a Round against a Ghost, THE Platform SHALL let the member send one preset reaction (a small fixed list) which the Ghost's owner sees in their lobby.
2. WHEN a member lost to a Ghost in a previous Tour, THE Platform SHALL offer a "Rematch" that tries to match them to the same owner's newest Ghost for the same Round number.
3. THE Platform SHALL show a "Rival of the week": the member who has beaten them most this week.
4. THE Platform SHALL give members an opt-out in settings that stops their Ghosts being used and their name appearing, and SHALL keep them able to play.
5. THE Platform SHALL NOT allow free-text messages between members in this version.

### Requirement 15: Admin Configuration and Insight

**User Story:** As an admin, I want to control and monitor the mode, so that I can keep it healthy.

#### Acceptance Criteria

1. THE Platform SHALL add an admin page under the DriftClash admin area where an admin can edit every value in the Tour Config, with validation and a preview of the prize table.
2. THE admin page SHALL include a master on/off switch, an early-access switch and a "free runs for admins" switch for testing.
3. THE admin page SHALL show an economy panel with, for the last 7 days: Tours started, paid versus free, P-Credits taken, P-Credits paid out, net, average Win Count and Tour completion rate.
4. THE admin page SHALL let an admin edit the Upgrade catalogue values (name, description, rarity weight, effect numbers) and switch individual Upgrades on or off.
5. THE admin page SHALL let an admin end a stuck Tour and refund its entry price.
6. WHEN an admin saves invalid values (for example a negative price or prizes that make a paid run net-negative beyond a warning level), THE Platform SHALL show the problem and, for the net-negative case, a warning that can be confirmed.

### Requirement 16: Integrity, Safety and Fair Play

**User Story:** As an owner, I want the mode to be fair and safe, so that it does not cause harm or disputes.

#### Acceptance Criteria

1. THE Platform SHALL NOT give any prize with a real-money value, and SHALL NOT let P-Credits won in a Tour be withdrawn as money.
2. THE Platform SHALL include a short responsible-play note in the lobby and on the entry confirmation, and SHALL link to the daily limit setting.
3. THE Platform SHALL let a member set their own lower daily paid-run limit.
4. THE Platform SHALL keep a log of every charge and prize for audit.
5. THE Platform SHALL record the seed and choices of each Tour so that any disputed result can be re-run and checked.
6. IF the Engine or the replay throws an error, THEN THE Platform SHALL keep the Tour state unchanged, show a retry message, and SHALL NOT charge or pay anything twice.

### Requirement 17: Performance and Compatibility

**User Story:** As a member on a phone, I want the mode to load fast and play smoothly.

#### Acceptance Criteria

1. THE Tour screens SHALL load their code only when the Tour tab is opened, so that the rest of the card game does not become heavier.
2. THE Replay SHALL not require any new third-party animation library unless the design shows it is needed.
3. THE Platform SHALL keep each server action under 1.5 seconds in the normal case (Redis reads are batched).
4. THE Platform SHALL work in the installed PWA, in Safari on iPhone and in current Chrome.

## Out of Scope (This Version)

- Live head-to-head play between two members online at the same time.
- The three Tandem Clash finale mini-games (stat duel, timing, allocation). They could return later as an optional input in a Round.
- Free-text chat between members.
- Cash prizes, withdrawals or any prize with real-world value.
- Changing the existing Tandem Clash rules, rewards or leaderboard.

/**
 * How often a typical player should win each round, in percent (index 0 = round 1). The rivals are built and tested to
 * hit these. They are kept out of config.ts on purpose: config.ts is also loaded by the browser, and players are never
 * shown these numbers. Only the server and the simulation script import this file.
 */
export const ROUND_TARGET_WIN_PCT = [80, 70, 60, 50, 30, 20];

export const targetWinPctFor = (round: number): number => ROUND_TARGET_WIN_PCT[Math.min(ROUND_TARGET_WIN_PCT.length, Math.max(1, round)) - 1];

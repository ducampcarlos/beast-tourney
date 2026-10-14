import { type BattleResult, simulateBattle } from "../src/engine/battle.js";
import { species } from "../src/engine/data.js";
import type { Run } from "../src/engine/run.js";
import type { Unit } from "../src/engine/types.js";

let uid = 0;
/** Start numbering again, so a test can tell which uid a unit has. Enemy units appear in battle as 1_000_000 + uid. */
export const resetUids = (): void => {
  uid = 0;
};
export const foe = (u: Unit): number => 1_000_000 + u.uid;
/** A unit with explicit stats. Tokens (bones, sprout...) have no ability, so they make neutral fighters. */
export function unit(sp: string, atk?: number, hp?: number, extra: Partial<Unit> = {}): Unit {
  const s = species(sp);
  return { uid: ++uid, sp, atk: atk ?? s.atk, hp: hp ?? s.hp, level: 1, exp: 0, ...extra };
}

export const fight = (player: Unit[], enemy: Unit[], seed = 1): BattleResult => simulateBattle(player, enemy, seed);

/** Every event of a battle, flattened. */
export const events = (r: BattleResult) => r.steps.flatMap((s) => s.events);

/** A copy of the run with the shop and team replaced, for setting up scenarios. */
export function setup(run: Run, patch: Partial<Run>): Run {
  return { ...structuredClone(run), ...patch };
}

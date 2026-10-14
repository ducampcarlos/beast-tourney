/**
 * A run: the shop, the team and the tournament ladder. Every command takes a run and returns a new
 * one (or an error), never mutating its input, so the UI can keep an undo history and tests can
 * compare before and after. All randomness comes from the seed stored in the run.
 */

import { type BattleResult, type Outcome, simulateBattle } from "./battle.js";
import { FACTION_DEFS, RELICS, SPECIES_LIST, relic as relicDef, species as speciesDef } from "./data.js";
import { MAX_ROUNDS, enemyTeam, tierCap } from "./enemy.js";
import { Rng, hashSeed } from "./rng.js";
import { selectAllies } from "./targets.js";
import { type Ability, type Difficulty, type Effect, FACTIONS, LEVEL_EXP, MAX_LEVEL, SLOTS, type Trigger, type Unit } from "./types.js";

export const START_GOLD = 10;
export const BUY_COST = 3;
export const ROLL_COST = 1;
export const LIVES: Record<Difficulty, number> = { squire: 5, knight: 4, champion: 3 };

export interface Offer {
  sp: string;
  frozen: boolean;
}
export interface RelicOffer {
  id: string;
  frozen: boolean;
}

export interface RoundRecord {
  round: number;
  outcome: Outcome;
  boss: boolean;
}

export interface Run {
  v: 1;
  seed: number;
  difficulty: Difficulty;
  round: number;
  /** Extra tries at the final boss. It is part of the battle seed, so a retry plays out differently. */
  attempt: number;
  lives: number;
  wins: number;
  gold: number;
  rng: number;
  nextUid: number;
  team: (Unit | null)[];
  offers: (Offer | null)[];
  relics: (RelicOffer | null)[];
  phase: "shop" | "won" | "lost";
  history: RoundRecord[];
}

export type ShopEvent =
  | { t: "gold"; amount: number }
  | { t: "buff"; uid: number; atk: number; hp: number }
  | { t: "merge"; uid: number }
  | { t: "levelUp"; uid: number; level: number };

export type Result = { ok: true; run: Run; events: ShopEvent[] } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });
const clone = (run: Run): Run => structuredClone(run);

export const offerCount = (round: number): number => (round <= 2 ? 3 : round <= 6 ? 4 : 5);
export const relicOfferCount = (round: number): number => (round >= 2 ? 2 : 0);
export const levelFor = (exp: number): number => (exp >= LEVEL_EXP[3] ? 3 : exp >= LEVEL_EXP[2] ? 2 : 1);

export function newUnit(run: Run, spId: string): Unit {
  const sp = speciesDef(spId);
  return { uid: run.nextUid++, sp: sp.id, atk: sp.atk, hp: sp.hp, level: 1, exp: 0 };
}

export function newRun(seed: number, difficulty: Difficulty): Run {
  const run: Run = {
    v: 1, seed: seed >>> 0, difficulty, round: 1, attempt: 0, lives: LIVES[difficulty], wins: 0, gold: START_GOLD,
    rng: hashSeed(seed, 0x5eed), nextUid: 1, team: Array<Unit | null>(SLOTS).fill(null), offers: [], relics: [], phase: "shop", history: [],
  };
  beginTurn(run);
  return run;
}

// ---- the shop ------------------------------------------------------------------------------

function weightedSpecies(rng: Rng, round: number): string {
  const cap = tierCap(round);
  // The newest tier shows up most often, so progress is felt.
  const weights = Array.from({ length: cap }, (_, i) => (i + 1 === cap ? 3 : i + 2 === cap ? 2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.int(total);
  let tier = 1;
  for (let i = 0; i < weights.length; i++) {
    if (roll < weights[i]!) {
      tier = i + 1;
      break;
    }
    roll -= weights[i]!;
  }
  return rng.pick(SPECIES_LIST.filter((s) => s.tier === tier)).id;
}

function stock(run: Run, rng: Rng): void {
  const n = offerCount(run.round);
  const offers: (Offer | null)[] = [];
  for (let i = 0; i < n; i++) offers.push(run.offers[i]?.frozen ? run.offers[i]! : { sp: weightedSpecies(rng, run.round), frozen: false });
  run.offers = offers;
  const pool = RELICS.filter((r) => r.cost <= (run.round >= 6 ? 5 : 4));
  const m = relicOfferCount(run.round);
  const relics: (RelicOffer | null)[] = [];
  for (let i = 0; i < m; i++) relics.push(run.relics[i]?.frozen ? run.relics[i]! : { id: rng.pick(pool).id, frozen: false });
  run.relics = relics;
}

function turnEffects(run: Run): ShopEvent[] {
  const events: ShopEvent[] = [];
  for (const faction of FACTIONS) {
    const members = new Set(run.team.filter((u): u is Unit => u !== null && speciesDef(u.sp).faction === faction).map((u) => u.sp));
    const tier = [...FACTION_DEFS[faction].bonds].reverse().find((b) => members.size >= b.need);
    for (const effect of tier?.turn ?? []) applyShopEffect(run, null, effect, 1, events, faction);
  }
  for (const unit of run.team) if (unit) fireShop(run, unit, "turnStart", false, run.team.indexOf(unit), events);
  return events;
}

function beginTurn(run: Run): ShopEvent[] {
  run.gold = START_GOLD;
  const events = turnEffects(run);
  stock(run, new Rng(run.rng));
  // stock() consumed numbers from a copy; advance the stored state deterministically
  run.rng = hashSeed(run.rng, run.round, run.attempt, run.nextUid);
  return events;
}

// ---- abilities in the shop -----------------------------------------------------------------

function applyShopEffect(run: Run, owner: Unit | null, effect: Effect, level: number, events: ShopEvent[], bondFaction?: (typeof FACTIONS)[number], alive = true, at = 0): void {
  if (effect.kind === "gold") {
    const amount = effect.amount * (bondFaction ? 1 : level);
    run.gold += amount;
    events.push({ t: "gold", amount });
    return;
  }
  if (effect.kind !== "buff") return; // hits, summons and statuses only exist in battle
  const wrapped = run.team.filter((u): u is Unit => u !== null).map((unit) => ({ uid: unit.uid, atk: unit.atk, faction: speciesDef(unit.sp).faction, unit }));
  const rng = new Rng(hashSeed(run.rng, run.nextUid, wrapped.length, run.gold, at));
  const anchor = owner ? wrapped.find((w) => w.unit.uid === owner.uid) ?? { uid: owner.uid, atk: owner.atk, faction: speciesDef(owner.sp).faction, unit: owner } : { uid: -1, atk: 0, faction: bondFaction ?? "order", unit: null as unknown as Unit };
  const targets = selectAllies(wrapped, anchor, alive, at, { ...effect, ...(bondFaction && effect.to === "faction" ? { faction: effect.faction ?? bondFaction } : {}) }, rng);
  const scaleBy = bondFaction ? 1 : level;
  for (const t of targets) {
    const atk = (effect.atk ?? 0) * scaleBy;
    const hp = (effect.hp ?? 0) * scaleBy;
    t.unit.atk = Math.max(0, t.unit.atk + atk);
    t.unit.hp = Math.max(1, t.unit.hp + hp);
    events.push({ t: "buff", uid: t.unit.uid, atk, hp });
  }
}

function fireShop(run: Run, unit: Unit, trigger: Trigger, gone: boolean, at: number, events: ShopEvent[]): void {
  const abilities = [speciesDef(unit.sp).ability, unit.relic ? relicDef(unit.relic).ability : undefined].filter((a): a is Ability => a !== undefined && a.trigger === trigger);
  for (const ability of abilities) for (const effect of ability.effects) applyShopEffect(run, unit, effect, unit.level, events, undefined, !gone, at);
}

// ---- commands ------------------------------------------------------------------------------

export function roll(run: Run): Result {
  if (run.phase !== "shop") return fail("The run is over.");
  if (run.gold < ROLL_COST) return fail("Not enough gold to roll.");
  const next = clone(run);
  next.gold -= ROLL_COST;
  const rng = new Rng(hashSeed(next.rng, next.gold, next.nextUid, 0x70));
  stock(next, rng);
  next.rng = hashSeed(next.rng, 0x71);
  return { ok: true, run: next, events: [] };
}

export function toggleFreeze(run: Run, kind: "creature" | "relic", index: number): Result {
  const next = clone(run);
  const list = kind === "creature" ? next.offers : next.relics;
  const item = list[index];
  if (!item) return fail("Nothing there to freeze.");
  item.frozen = !item.frozen;
  return { ok: true, run: next, events: [] };
}

/** Merge `from` into `to` (same species): stats grow, experience adds up and the level may rise. */
function mergeInto(target: Unit, source: Unit, events: ShopEvent[]): void {
  target.atk = Math.max(target.atk, source.atk) + 1;
  target.hp = Math.max(target.hp, source.hp) + 1;
  target.exp = Math.min(LEVEL_EXP[MAX_LEVEL], target.exp + source.exp + 1);
  target.relic = target.relic ?? source.relic;
  events.push({ t: "merge", uid: target.uid });
  const level = levelFor(target.exp);
  if (level > target.level) {
    target.level = level;
    events.push({ t: "levelUp", uid: target.uid, level });
  }
}

export function buy(run: Run, offerIndex: number, slot: number): Result {
  if (run.phase !== "shop") return fail("The run is over.");
  const offer = run.offers[offerIndex];
  if (!offer) return fail("That creature is no longer for sale.");
  if (slot < 0 || slot >= SLOTS) return fail("No such slot.");
  if (run.gold < BUY_COST) return fail("Not enough gold.");
  const occupant = run.team[slot];
  if (occupant && occupant.sp !== offer.sp) return fail("That slot is taken by a different creature.");
  const next = clone(run);
  next.gold -= BUY_COST;
  next.offers[offerIndex] = null;
  const events: ShopEvent[] = [];
  const bought = newUnit(next, offer.sp);
  const target = next.team[slot];
  if (target) mergeInto(target, bought, events);
  else next.team[slot] = bought;
  return { ok: true, run: next, events };
}

export function buyRelic(run: Run, relicIndex: number, slot: number): Result {
  if (run.phase !== "shop") return fail("The run is over.");
  const offer = run.relics[relicIndex];
  if (!offer) return fail("That relic is no longer for sale.");
  const unit = run.team[slot];
  if (!unit) return fail("Pick a creature to carry the relic.");
  const def = relicDef(offer.id);
  if (run.gold < def.cost) return fail("Not enough gold.");
  const next = clone(run);
  next.gold -= def.cost;
  next.relics[relicIndex] = null;
  next.team[slot]!.relic = def.id;
  return { ok: true, run: next, events: [] };
}

export const sellValue = (unit: Unit): number => unit.level;

export function sell(run: Run, slot: number): Result {
  if (run.phase !== "shop") return fail("The run is over.");
  const unit = run.team[slot];
  if (!unit) return fail("Nothing to sell there.");
  const next = clone(run);
  const sold = next.team[slot]!;
  const events: ShopEvent[] = [];
  next.gold += sellValue(sold);
  events.push({ t: "gold", amount: sellValue(sold) });
  fireShop(next, sold, "sell", true, slot, events);
  next.team[slot] = null;
  return { ok: true, run: next, events };
}

/** Drag a unit onto another slot: empty slots move it, creatures of the same species merge, others swap. */
export function move(run: Run, from: number, to: number): Result {
  if (run.phase !== "shop") return fail("The run is over.");
  if (from === to) return { ok: true, run, events: [] };
  const a = run.team[from];
  if (!a || to < 0 || to >= SLOTS) return fail("Nothing to move.");
  const next = clone(run);
  const events: ShopEvent[] = [];
  const b = next.team[to];
  if (!b) {
    next.team[to] = next.team[from]!;
    next.team[from] = null;
  } else if (a.sp === b.sp) {
    mergeInto(b, next.team[from]!, events);
    next.team[from] = null;
  } else {
    next.team[to] = next.team[from]!;
    next.team[from] = b;
  }
  return { ok: true, run: next, events };
}

// ---- battles -------------------------------------------------------------------------------

export function teamUnits(run: Run): Unit[] {
  return run.team.filter((u): u is Unit => u !== null);
}

export type FightResult = { ok: true; run: Run; battle: BattleResult; enemy: Unit[]; events: ShopEvent[] } | { ok: false; error: string };

export function fight(run: Run): FightResult {
  if (run.phase !== "shop") return { ok: false, error: "The run is over." };
  const mine = teamUnits(run);
  if (mine.length === 0) return { ok: false, error: "Field at least one creature." };
  const next = clone(run);
  const enemy = enemyTeam(next.seed, next.round, next.attempt, next.difficulty);
  const battle = simulateBattle(mine, enemy, hashSeed(next.seed, next.round, next.attempt, 0xba77));
  const boss = next.round === MAX_ROUNDS || [4, 8].includes(next.round);
  next.history.push({ round: next.round, outcome: battle.outcome, boss });

  if (battle.outcome === "win") next.wins++;
  const finalRound = next.round >= MAX_ROUNDS;
  // A draw costs nothing, except in the final: it must be won.
  if (battle.outcome === "lose" || (battle.outcome === "draw" && finalRound)) next.lives--;

  if (battle.outcome === "win" && finalRound) next.phase = "won";
  else if (next.lives <= 0) next.phase = "lost";
  else if (finalRound) next.attempt++;
  else next.round++;

  let events: ShopEvent[] = [];
  if (next.phase === "shop") events = beginTurn(next);
  return { ok: true, run: next, battle, enemy, events };
}

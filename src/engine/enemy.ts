/**
 * Opponents. There is no server, so every round's enemy team is generated from the run's seed:
 * the same seed always meets the same opponents, which keeps runs reproducible (and shareable
 * as a seed). Rounds 4, 8 and 12 are bosses with a fixed cast.
 */

import { FACTION_DEFS, RELICS, SPECIES_LIST, relic, species } from "./data.js";
import { Rng, hashSeed } from "./rng.js";
import { type Difficulty, FACTIONS, LEVEL_EXP, type Unit } from "./types.js";

export const MAX_ROUNDS = 12;
export const BOSS_ROUNDS: readonly number[] = [4, 8, 12];

/** Highest shop tier on sale in a round. */
export const tierCap = (round: number): number => Math.min(5, 1 + Math.floor((round - 1) / 2));

export const DIFFICULTY_MULT: Record<Difficulty, number> = { squire: 0.88, knight: 1, champion: 1.12 };

/**
 * Target strength of the enemy team in each round on Knight: the sum of every enemy's attack and
 * health. Teams are generated first, then scaled to this curve, so a lucky draw of high-tier
 * creatures cannot spike a round. Calibrated against the bots in `npm run balance`.
 */
export const POWER: readonly number[] = [8, 16, 27, 45, 43, 49, 58, 78, 74, 85, 99, 134];
/** Overall multiplier on the curve, exposed so the simulator can sweep it. */
export const TUNING = { scale: 1 };

export const targetPower = (round: number, difficulty: Difficulty): number => POWER[Math.min(round, POWER.length) - 1]! * DIFFICULTY_MULT[difficulty] * TUNING.scale;
const SIZES = [2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5];

interface Slot {
  sp: string;
  level?: number;
  relic?: string;
}

// Each cast keeps at most three species of one faction, so a boss lights up the 2-bond but never the 4-bond on its own.
const BOSS_CASTS: Record<number, { cast: Slot[]; name: string }> = {
  4: { name: "Goblin King Grakk", cast: [{ sp: "goblin" }, { sp: "wolf", level: 2 }, { sp: "goblin-king" }, { sp: "imp" }] },
  8: { name: "Lich Lord Morvane", cast: [{ sp: "pebble", level: 2 }, { sp: "skeleton", level: 2 }, { sp: "lich-lord" }, { sp: "zombie", level: 2 }] }, // four units, so there is room for the summon
  12: { name: "Ignis, the Elder Dragon", cast: [{ sp: "troll", level: 2 }, { sp: "elder-dragon" }, { sp: "drakeling", level: 2 }, { sp: "mammoth" }, { sp: "wyvern", level: 2 }] },
};

export function bossName(round: number): string | undefined {
  return BOSS_CASTS[round]?.name;
}

export function enemyTeam(seed: number, round: number, attempt: number, difficulty: Difficulty): Unit[] {
  const rng = new Rng(hashSeed(seed, round, attempt, 0xe7e));
  const boss = BOSS_CASTS[round];
  const slots = boss ? boss.cast : generate(rng, round);
  const raw = slots.map((slot, i) => {
    const sp = species(slot.sp);
    const level = slot.level ?? 1;
    const grown = LEVEL_EXP[level]!; // a level-n unit has absorbed this many copies, each worth +1/+1
    const rel = slot.relic ? relic(slot.relic) : undefined;
    return { uid: i + 1, sp: sp.id, atk: sp.atk + grown + (rel?.atk ?? 0), hp: sp.hp + grown + (rel?.hp ?? 0), level, exp: grown, relic: slot.relic } satisfies Unit;
  });
  const total = raw.reduce((sum, u) => sum + u.atk + u.hp, 0);
  const factor = targetPower(round, difficulty) / total;
  // Relic stats are applied again in battle, so take them out before scaling and leave them to the battle.
  return raw.map((u) => {
    const rel = u.relic ? relic(u.relic) : undefined;
    return { ...u, atk: Math.max(1, Math.round(u.atk * factor) - (rel?.atk ?? 0)), hp: Math.max(1, Math.round(u.hp * factor) - (rel?.hp ?? 0)) };
  });
}

function generate(rng: Rng, round: number): Slot[] {
  const size = SIZES[Math.min(round, SIZES.length) - 1]!;
  const cap = tierCap(round);
  const pool = SPECIES_LIST.filter((s) => s.tier <= cap);
  const theme = rng.pick(FACTIONS);
  const themed = pool.filter((s) => s.faction === theme);
  const slots: Slot[] = [];
  // Mostly the theme, so bonds light up for the enemy as well.
  for (let i = 0; i < size; i++) {
    const from = i < Math.ceil(size * 0.6) && themed.length > 0 ? themed : pool;
    const weighted = from.flatMap((s) => Array<typeof s>(s.tier >= cap - 1 ? 3 : 1).fill(s));
    const sp = rng.pick(weighted);
    let level = 1;
    if (round >= 5 && rng.chance(0.3)) level = 2;
    if (round >= 9 && rng.chance(0.3)) level = 3;
    const relicPool = RELICS.filter((r) => r.cost <= (round >= 10 ? 5 : 4));
    const relic = round >= 6 && rng.chance(round >= 10 ? 0.6 : 0.4) ? rng.pick(relicPool).id : undefined;
    slots.push({ sp: sp.id, level, relic });
  }
  // Tough units up front.
  return slots.sort((a, b) => species(b.sp).hp - species(a.sp).hp);
}

/** Which faction an enemy team leans on, for the preview shown before a fight. */
export function dominantFaction(team: readonly Unit[]): { faction: (typeof FACTIONS)[number]; name: string; count: number } {
  const counts = new Map<string, number>();
  for (const u of team) counts.set(species(u.sp).faction, (counts.get(species(u.sp).faction) ?? 0) + 1);
  const [faction, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["order", 0];
  return { faction: faction as (typeof FACTIONS)[number], name: FACTION_DEFS[faction as (typeof FACTIONS)[number]].name, count };
}

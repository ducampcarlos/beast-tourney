/**
 * Trophies. Pure rules: given facts about what just happened, which trophies are newly earned.
 * The client gathers the facts (after a shop command, a battle, the end of a run) and shows the toast.
 */

import { FACTIONS, type Difficulty, type Unit } from "./types.js";
import { FACTION_DEFS, bondNeed, species } from "./data.js";
import { SPECIES_LIST } from "./data.js";

export interface Facts {
  /** After a shop command: the team as it stands. */
  team?: readonly (Unit | null)[];
  boons?: readonly string[];
  /** After a battle. */
  battle?: { outcome: "win" | "lose" | "draw"; round: number; bonds: number[] };
  /** When a run ends. */
  end?: { won: boolean; difficulty: Difficulty; lives: number; /** Any battle was lost along the way. */ lost: boolean };
  /** Species met so far, for the Bestiary. */
  seen?: number;
}

export interface TrophyDef {
  id: string;
  name: string;
  text: string;
  test: (f: Facts) => boolean;
}

const maxLevel = (team: readonly (Unit | null)[] | undefined): number => Math.max(0, ...(team ?? []).map((u) => u?.level ?? 0));

export const TROPHIES: TrophyDef[] = [
  { id: "first-blood", name: "First Blood", text: "Win a battle.", test: (f) => f.battle?.outcome === "win" },
  { id: "growing-up", name: "Growing Up", text: "Raise a creature to level 2.", test: (f) => maxLevel(f.team) >= 2 },
  { id: "fully-grown", name: "Fully Grown", text: "Raise a creature to level 3.", test: (f) => maxLevel(f.team) >= 3 },
  { id: "better-together", name: "Better Together", text: "Fight with a faction bond awake.", test: (f) => (f.battle?.bonds.length ?? 0) >= 1 },
  { id: "united-front", name: "United Front", text: "Fight with a four-creature bond.", test: (f) => (f.battle?.bonds ?? []).some((n) => n >= 4) },
  { id: "two-banners", name: "Two Banners", text: "Fight with two bonds awake at once.", test: (f) => (f.battle?.bonds.length ?? 0) >= 2 },
  { id: "armed", name: "Armed to the Teeth", text: "Equip a relic on all five creatures.", test: (f) => (f.team ?? []).filter((u) => u?.relic).length >= 5 },
  { id: "twice-blessed", name: "Twice Blessed", text: "Hold two boons at once.", test: (f) => (f.boons?.length ?? 0) >= 2 },
  { id: "goblin-toppled", name: "Goblin Toppled", text: "Beat Goblin King Grakk.", test: (f) => f.battle?.outcome === "win" && f.battle.round === 4 },
  { id: "lich-laid-to-rest", name: "Lich Laid to Rest", text: "Beat Lich Lord Morvane.", test: (f) => f.battle?.outcome === "win" && f.battle.round === 8 },
  { id: "squire-crown", name: "Squire's Crown", text: "Win the tournament on Squire.", test: (f) => f.end?.won === true && f.end.difficulty === "squire" },
  { id: "knight-crown", name: "Knight's Crown", text: "Win the tournament on Knight.", test: (f) => f.end?.won === true && f.end.difficulty === "knight" },
  { id: "champion-crown", name: "Champion's Crown", text: "Win the tournament on Champion.", test: (f) => f.end?.won === true && f.end.difficulty === "champion" },
  { id: "untouched", name: "Untouched", text: "Win the tournament without losing a life.", test: (f) => f.end?.won === true && !f.end.lost },
  { id: "by-a-thread", name: "By a Thread", text: "Win the tournament with one life left.", test: (f) => f.end?.won === true && f.end.lives === 1 },
  { id: "naturalist", name: "Naturalist", text: "Meet every creature in the Bestiary.", test: (f) => (f.seen ?? 0) >= SPECIES_LIST.length },
];

const TROPHY_MAP = new Map(TROPHIES.map((t) => [t.id, t]));
export const trophy = (id: string): TrophyDef | undefined => TROPHY_MAP.get(id);
export const hasTrophy = (id: string): boolean => TROPHY_MAP.has(id);

/** Trophies earned by these facts that are not owned yet, in display order. */
export function newTrophies(owned: readonly string[], facts: Facts): string[] {
  return TROPHIES.filter((t) => !owned.includes(t.id) && t.test(facts)).map((t) => t.id);
}

/** Active bonds of a team as the sizes of their tiers, for the facts of a battle (2 or 4 each). */
export function bondTiers(team: readonly (Unit | null)[], boons: readonly string[] = []): number[] {
  const tiers: number[] = [];
  for (const faction of FACTIONS) {
    const kinds = new Set(team.filter((u): u is Unit => u !== null && species(u.sp).faction === faction).map((u) => u.sp));
    const tier = [...FACTION_DEFS[faction].bonds].reverse().find((b) => kinds.size >= bondNeed(b.need, boons));
    if (tier) tiers.push(tier.need);
  }
  return tiers;
}

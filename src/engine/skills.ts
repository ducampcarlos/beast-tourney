/**
 * The skill tree: permanent upgrades bought with the points that challenges (trophies) give.
 * Three branches of four skills; a skill needs the skills it lists before it can be bought.
 * Skills a run starts with are copied into it as `perks`, so the tree can be rearranged between
 * runs without touching one in progress. The effects themselves live next to the rules they bend
 * (run.ts for the shop, battle.ts for the fight).
 */

import { t } from "../i18n/index.js";

export type Branch = "fortune" | "might" | "wisdom";
export const BRANCHES: readonly Branch[] = ["fortune", "might", "wisdom"];

export interface SkillDef {
  id: string;
  branch: Branch;
  name: string;
  /** Frame in the dungeon sheet. */
  icon: number;
  cost: number;
  /** Skills that must be owned first. */
  requires: readonly string[];
  text: string;
}

export const BRANCH_INFO: Record<Branch, { name: string; blurb: string }> = {
  fortune: { name: "Fortune", blurb: "Gold and the shop." },
  might: { name: "Might", blurb: "Strength in battle." },
  wisdom: { name: "Wisdom", blurb: "Growth, lives and learning." },
};

export const SKILLS: readonly SkillDef[] = [
  { id: "lucky-start", branch: "fortune", name: "Lucky Start", icon: 89, cost: 2, requires: [], text: "One more gold on each of the first six turns of a run." },
  { id: "haggle", branch: "fortune", name: "Sharp Haggler", icon: 90, cost: 4, requires: ["lucky-start"], text: "Relics cost 1 less." },
  { id: "thrifty", branch: "fortune", name: "Quick Sale", icon: 91, cost: 4, requires: ["lucky-start"], text: "Selling a creature of tier 2 or higher gives 1 more gold." },
  { id: "keen-eye", branch: "fortune", name: "Keen Eye", icon: 116, cost: 7, requires: ["haggle", "thrifty"], text: "The first roll of every turn is free, and from round 7 you start each turn with 1 more gold." },

  { id: "tough", branch: "might", name: "Toughened", icon: 102, cost: 2, requires: [], text: "Your front creature starts every battle with +1 health." },
  { id: "sharp", branch: "might", name: "Sharpened", icon: 103, cost: 4, requires: ["tough"], text: "A random creature of yours starts every battle with +1 attack." },
  { id: "front-guard", branch: "might", name: "Shield Wall", icon: 96, cost: 4, requires: ["tough"], text: "Your front creature starts every battle with +1 attack." },
  { id: "last-stand", branch: "might", name: "Last Stand", icon: 115, cost: 7, requires: ["sharp", "front-guard"], text: "The first creature to fall in each battle returns with 30% of its stats." },

  { id: "early-bird", branch: "wisdom", name: "Early Bird", icon: 66, cost: 2, requires: [], text: "One more creature for sale in the first two rounds." },
  { id: "apprentice", branch: "wisdom", name: "Apprentice's Care", icon: 98, cost: 5, requires: ["early-bird"], text: "Every third turn, your weakest creature gains +1/+1." },
  { id: "scholar-eye", branch: "wisdom", name: "Scholar's Eye", icon: 130, cost: 5, requires: ["early-bird"], text: "From round 8 on, the shop sells creatures of one tier higher." },
  { id: "second-chance", branch: "wisdom", name: "Second Chance", icon: 114, cost: 9, requires: ["apprentice", "scholar-eye"], text: "Start every run with one more life." },
];

const SKILL_MAP = new Map(SKILLS.map((s) => [s.id, s]));
export function skill(id: string): SkillDef {
  const found = SKILL_MAP.get(id);
  if (!found) throw new Error(`Unknown skill "${id}"`);
  return found;
}
export const hasSkill = (id: string): boolean => SKILL_MAP.has(id);

export const totalCost = (ids: readonly string[]): number => ids.reduce((sum, id) => sum + (SKILL_MAP.get(id)?.cost ?? 0), 0);

/** Every skill's requirements are owned too, and every id is known and distinct. */
export function validTree(ids: readonly string[]): boolean {
  if (new Set(ids).size !== ids.length) return false;
  return ids.every((id) => hasSkill(id) && skill(id).requires.every((r) => ids.includes(r)));
}

export type Buy = { ok: true; skills: string[] } | { ok: false; error: string };

/** Spend points on one more skill. `points` is the total ever earned. */
export function buySkill(owned: readonly string[], id: string, points: number): Buy {
  if (!hasSkill(id)) return { ok: false, error: t("No such skill.") };
  if (owned.includes(id)) return { ok: false, error: t("You already have it.") };
  const def = skill(id);
  const missing = def.requires.filter((r) => !owned.includes(r));
  if (missing.length > 0) return { ok: false, error: t("Needs {names} first.", { names: missing.map((m) => t(skill(m).name)).join(" " + t("and") + " ") }) };
  const left = points - totalCost(owned);
  if (left < def.cost) return { ok: false, error: t("It costs {cost} points; you have {left}.", { cost: def.cost, left: Math.max(0, left) }) };
  return { ok: true, skills: [...owned, id] };
}

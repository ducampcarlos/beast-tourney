/**
 * Saving and loading. A saved run is plain JSON that comes back from untrusted storage, so loading
 * checks every field: a hand-edited or corrupted save is refused rather than crashing the game or
 * smuggling in impossible creatures.
 */

import { hasBoon, hasRelic, hasSpecies, species } from "./data.js";
import { LIVES, type Run } from "./run.js";
import { DIFFICULTIES, LEVEL_EXP, MAX_LEVEL, SLOTS, type Unit } from "./types.js";
import { MAX_ROUNDS } from "./enemy.js";

export const SAVE_VERSION = 1;

export function serializeRun(run: Run): string {
  return JSON.stringify(run);
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function validUnit(raw: unknown, seen: Set<number>, nextUid: number): Unit | null {
  if (!isObj(raw)) return null;
  const { uid, sp, atk, hp, level, exp, relic } = raw;
  if (!isInt(uid, 1, nextUid - 1) || seen.has(uid)) return null;
  if (typeof sp !== "string" || !hasSpecies(sp) || species(sp).tier < 1 || species(sp).tier > 5) return null;
  if (!isInt(atk, 0, 999) || !isInt(hp, 1, 999) || !isInt(level, 1, MAX_LEVEL) || !isInt(exp, 0, LEVEL_EXP[MAX_LEVEL])) return null;
  if (relic !== undefined && (typeof relic !== "string" || !hasRelic(relic))) return null;
  seen.add(uid);
  return { uid, sp, atk, hp, level, exp, ...(relic ? { relic } : {}) };
}

/** Returns the run, or null if the text is not a valid save. */
export function parseRun(text: string): Run | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.v !== SAVE_VERSION) return null;
  const difficulty = raw.difficulty;
  if (typeof difficulty !== "string" || !(DIFFICULTIES as readonly string[]).includes(difficulty)) return null;
  const d = difficulty as Run["difficulty"];
  const { seed, round, attempt, lives, wins, gold, rng, nextUid, phase } = raw;
  if (!isInt(seed, 0, 0xffffffff) || !isInt(round, 1, 99) || !isInt(attempt, 0, 50) || !isInt(lives, 0, LIVES.squire + 1) || !isInt(wins, 0, 200)) return null;
  if (!isInt(gold, 0, 999) || !isInt(rng, 0, 0xffffffff) || !isInt(nextUid, 1, 1_000_000)) return null;
  if (phase !== "shop" && phase !== "won" && phase !== "lost") return null;
  if (!Array.isArray(raw.team) || raw.team.length !== SLOTS) return null;

  const seen = new Set<number>();
  const team: (Unit | null)[] = [];
  for (const slot of raw.team) {
    if (slot === null) {
      team.push(null);
      continue;
    }
    const unit = validUnit(slot, seen, nextUid);
    if (!unit) return null;
    team.push(unit);
  }

  if (!Array.isArray(raw.offers) || raw.offers.length > 5 || !Array.isArray(raw.relics) || raw.relics.length > 3) return null;
  const offers = [];
  for (const o of raw.offers) {
    if (o === null) offers.push(null);
    else if (isObj(o) && typeof o.sp === "string" && hasSpecies(o.sp) && species(o.sp).tier >= 1 && species(o.sp).tier <= 5 && typeof o.frozen === "boolean") offers.push({ sp: o.sp, frozen: o.frozen });
    else return null;
  }
  const relics = [];
  for (const o of raw.relics) {
    if (o === null) relics.push(null);
    else if (isObj(o) && typeof o.id === "string" && hasRelic(o.id) && typeof o.frozen === "boolean") relics.push({ id: o.id, frozen: o.frozen });
    else return null;
  }

  if (!Array.isArray(raw.history) || raw.history.length > 200) return null;
  const history = [];
  for (const h of raw.history) {
    if (!isObj(h) || !isInt(h.round, 1, 99) || !["win", "lose", "draw"].includes(h.outcome as string) || typeof h.boss !== "boolean") return null;
    history.push({ round: h.round, outcome: h.outcome as "win" | "lose" | "draw", boss: h.boss });
  }

  // boons: a short list of known, distinct ids; a pending choice is up to three more that are not held
  const boons = raw.boons ?? []; // saves from before boons existed simply have none
  if (!Array.isArray(boons) || boons.length > 4 || new Set(boons).size !== boons.length) return null;
  if (!boons.every((b): b is string => typeof b === "string" && hasBoon(b))) return null;
  let pendingBoons: string[] | null = null;
  if (raw.pendingBoons !== null && raw.pendingBoons !== undefined) {
    const p = raw.pendingBoons;
    if (!Array.isArray(p) || p.length < 1 || p.length > 3 || new Set(p).size !== p.length) return null;
    if (!p.every((b): b is string => typeof b === "string" && hasBoon(b) && !boons.includes(b))) return null;
    pendingBoons = p;
  }
  const endless = raw.endless ?? false;
  if (typeof endless !== "boolean") return null;
  if (round > MAX_ROUNDS && !endless) return null; // past the twelfth round only in Endless mode
  const freeRolls = raw.freeRolls ?? 0;
  if (!isInt(freeRolls, 0, 1)) return null;

  return { v: 1, seed, difficulty: d, round, attempt, lives, wins, gold, rng, nextUid, team, offers, relics, phase, history, boons: boons as string[], pendingBoons, freeRolls, endless };
}

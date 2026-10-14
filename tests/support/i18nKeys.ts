/**
 * Every English text of the game that can be translated, found in the source and in the content
 * tables, each with a short note on where it is shown. The translation tests and the script that
 * lists what is missing both read from here, so nothing has to be kept in a second list by hand.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { TROPHIES } from "../../src/engine/achievements.js";
import { BOONS, BOSS_SPECIES, FACTION_DEFS, OATHS, RELICS, SPECIES_LIST, TOKENS } from "../../src/engine/data.js";
import { bossName } from "../../src/engine/enemy.js";
import { BRANCH_INFO, SKILLS } from "../../src/engine/skills.js";
import { STATUS_TEXT } from "../../src/engine/text.js";
import { CREDITS_LINES, HELP_LINES } from "../../src/web/help.js";

export interface Entry {
  key: string;
  /** Where the text appears: a hint for translators. */
  note: string;
}

const ROOT = join(import.meta.dirname, "..", "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "i18n" ? [] : sourceFiles(path);
    return name.endsWith(".ts") ? [path] : [];
  });
}

const DOUBLE = String.raw`"((?:[^"\\\n]|\\.)*)"`;
const TICKS = "`([^`$\\\\\\n]*)`";
const STRING = `(?:${DOUBLE}|${TICKS})`;
const unescape = (raw: string): string => JSON.parse(`"${raw}"`) as string;

/** The texts passed to t() and tn() in the code. */
export function keysInCode(): Entry[] {
  const found = new Map<string, string>();
  const single = new RegExp(`(?<![\\w.])t\\(\\s*${STRING}`, "g");
  const plural = new RegExp(`(?<![\\w.])tn\\([^,]+,\\s*${STRING}\\s*,\\s*${STRING}`, "g");
  for (const file of sourceFiles(ROOT)) {
    const source = readFileSync(file, "utf8");
    const where = file.slice(ROOT.length + 1);
    for (const m of source.matchAll(single)) found.set(m[1] !== undefined ? unescape(m[1]) : m[2]!, where);
    for (const m of source.matchAll(plural)) {
      found.set(m[1] !== undefined ? unescape(m[1]) : m[2]!, where);
      found.set(m[3] !== undefined ? unescape(m[3]) : m[4]!, where);
    }
  }
  return [...found].map(([key, where]) => ({ key, note: `interface (${where})` }));
}

/** Names, descriptions and flavour in the content tables. */
export function keysInContent(): Entry[] {
  const out: Entry[] = [];
  const add = (key: string | undefined, note: string) => key && out.push({ key, note });
  for (const s of [...SPECIES_LIST, ...TOKENS, ...BOSS_SPECIES]) {
    add(s.name, "creature name");
    add(s.flavor, `flavour text of ${s.name}`);
  }
  for (const f of Object.values(FACTION_DEFS)) {
    add(f.name, "faction name");
    add(f.blurb, `description of the ${f.name} faction`);
    for (const b of f.bonds) add(b.text, `bond bonus of the ${f.name} faction`);
  }
  for (const r of RELICS) {
    add(r.name, "relic name (an item carried by one creature)");
    add(r.text, `effect of the relic ${r.name}`);
  }
  for (const b of BOONS) {
    add(b.name, "boon name (a reward after beating a boss)");
    add(b.text, `effect of the boon ${b.name}`);
  }
  for (const o of OATHS) {
    add(o.name, "oath name (an optional vow that makes a run harder)");
    add(o.text, `effect of the oath ${o.name}`);
  }
  for (const k of SKILLS) {
    add(k.name, "skill tree skill name");
    add(k.text, `effect of the skill ${k.name}`);
  }
  for (const b of Object.values(BRANCH_INFO)) {
    add(b.name, "skill tree branch name");
    add(b.blurb, "skill tree branch description");
  }
  for (const c of TROPHIES) {
    add(c.name, "challenge name (an achievement that gives skill points)");
    add(c.text, `how to complete the challenge ${c.name}`);
  }
  for (const round of [4, 8, 12]) add(bossName(round), "boss name");
  for (const [k, v] of Object.entries(STATUS_TEXT)) add(v, `explanation of the status ${k}`);
  for (const line of HELP_LINES) add(line, "paragraph of the How to play panel");
  for (const line of CREDITS_LINES) add(line, "paragraph of the Credits panel");
  // built from other words at run time: rank names, capitalised in menus and lower case in the shared result
  for (const rank of ["Squire", "Knight", "Champion", "squire", "knight", "champion"]) add(rank, "rank (difficulty) name");
  return out;
}

/** All the keys, each once, in a stable order. */
export function allKeys(): Entry[] {
  const seen = new Map<string, string>();
  for (const e of [...keysInContent(), ...keysInCode()]) if (!seen.has(e.key)) seen.set(e.key, e.note);
  return [...seen].map(([key, note]) => ({ key, note }));
}

/** The `{placeholders}` of a text, sorted. */
export const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

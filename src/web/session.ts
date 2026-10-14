/**
 * Everything that outlives a scene: the current run, the profile (best results, bestiary,
 * settings) and their storage. Storage can be blocked (private windows), so every access is
 * wrapped and the game works without it.
 */

import { type Run, newRun } from "../engine/run.js";
import { parseRun, serializeRun } from "../engine/save.js";
import { DIFFICULTIES, type Difficulty } from "../engine/types.js";
import { hasSpecies } from "../engine/data.js";
import { hasTrophy, pointsEarned } from "../engine/achievements.js";
import { type Buy, buySkill, totalCost, validTree } from "../engine/skills.js";

const RUN_KEY = "beast-tourney.run.v1";
const PROFILE_KEY = "beast-tourney.profile.v1";

export interface RunRecord {
  /** When it ended, in milliseconds since 1970. */
  t: number;
  difficulty: Difficulty;
  seed: number;
  outcome: "won" | "lost";
  /** The round reached (the one it was won or lost in). */
  round: number;
  endless: boolean;
  wins: number;
  /** The creatures it ended with, front first. */
  team: string[];
}

export const MAX_RECORDS = 12;

export interface Profile {
  /** Species the player has met, in the shop or across the battlefield. */
  seen: string[];
  /** Highest round reached and runs won, per difficulty. */
  best: Record<Difficulty, { round: number; wins: number }>;
  /** Deepest round reached in Endless mode, per rank. */
  depth: Record<Difficulty, number>;
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  /** Screen shake on heavy hits. */
  shake: boolean;
  /** Battle playback speed: 1, 2 or 4. */
  speed: number;
  runs: number;
  seenHelp: boolean;
  trophies: string[];
  /** Skills bought in the skill tree. */
  skills: string[];
  /** The most recent runs, newest first. */
  records: RunRecord[];
}

const emptyProfile = (): Profile => ({
  seen: [],
  best: { squire: { round: 0, wins: 0 }, knight: { round: 0, wins: 0 }, champion: { round: 0, wins: 0 } },
  depth: { squire: 0, knight: 0, champion: 0 },
  muted: false,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  shake: true,
  speed: 1,
  runs: 0,
  seenHelp: false,
  trophies: [],
  skills: [],
  records: [],
});

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked or full: carry on without saving */
  }
}

function validRecord(raw: unknown): RunRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
  if (!int(r.t, 0, 8.64e15) || !int(r.seed, 0, 0xffffffff) || !int(r.round, 1, 99) || !int(r.wins, 0, 200)) return null;
  if (typeof r.difficulty !== "string" || !(DIFFICULTIES as readonly string[]).includes(r.difficulty)) return null;
  if (r.outcome !== "won" && r.outcome !== "lost") return null;
  if (typeof r.endless !== "boolean") return null;
  if (!Array.isArray(r.team) || r.team.length > 5 || !r.team.every((s): s is string => typeof s === "string" && hasSpecies(s))) return null;
  return { t: r.t, difficulty: r.difficulty as Difficulty, seed: r.seed, outcome: r.outcome, round: r.round, endless: r.endless, wins: r.wins, team: r.team };
}

export function parseProfile(text: string | null): Profile {
  const base = emptyProfile();
  if (!text) return base;
  try {
    const raw = JSON.parse(text) as Partial<Profile> | null;
    if (!raw || typeof raw !== "object") return base;
    if (Array.isArray(raw.seen)) base.seen = [...new Set(raw.seen.filter((s): s is string => typeof s === "string" && hasSpecies(s)))];
    for (const d of DIFFICULTIES) {
      const b = raw.best?.[d];
      if (b && Number.isInteger(b.round) && Number.isInteger(b.wins) && b.round >= 0 && b.round <= 12 && b.wins >= 0 && b.wins < 1e6) base.best[d] = { round: b.round, wins: b.wins };
    }
    for (const d of DIFFICULTIES) {
      const v = raw.depth?.[d];
      if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000) base.depth[d] = v;
    }
    if (typeof raw.muted === "boolean") base.muted = raw.muted;
    if (typeof raw.musicVolume === "number" && raw.musicVolume >= 0 && raw.musicVolume <= 1) base.musicVolume = raw.musicVolume;
    if (Number.isInteger(raw.runs) && (raw.runs as number) >= 0) base.runs = raw.runs as number;
    if (typeof raw.seenHelp === "boolean") base.seenHelp = raw.seenHelp;
    if (typeof raw.sfxVolume === "number" && raw.sfxVolume >= 0 && raw.sfxVolume <= 1) base.sfxVolume = raw.sfxVolume;
    if (typeof raw.shake === "boolean") base.shake = raw.shake;
    if (raw.speed === 1 || raw.speed === 2 || raw.speed === 4) base.speed = raw.speed;
    if (Array.isArray(raw.records)) base.records = raw.records.map(validRecord).filter((r): r is RunRecord => r !== null).slice(0, MAX_RECORDS);
    if (Array.isArray(raw.trophies)) base.trophies = [...new Set(raw.trophies.filter((t): t is string => typeof t === "string" && hasTrophy(t)))];
    // a tree that does not add up (unknown skills, missing requirements, more spent than earned) is dropped
    if (Array.isArray(raw.skills) && raw.skills.every((x): x is string => typeof x === "string") && validTree(raw.skills) && totalCost(raw.skills) <= pointsEarned(base.trophies)) base.skills = [...raw.skills];
    return base;
  } catch {
    return base;
  }
}

export class Session {
  run: Run | null = null;
  profile: Profile = parseProfile(read(PROFILE_KEY));

  constructor() {
    const saved = read(RUN_KEY);
    if (saved) {
      const run = parseRun(saved);
      if (run && run.phase === "shop") this.run = run;
      else write(RUN_KEY, null);
    }
  }

  hasSavedRun(): boolean {
    return this.run !== null && this.run.phase === "shop";
  }

  start(difficulty: Difficulty, seed = Math.floor(Math.random() * 0xffffffff), oaths: readonly string[] = [], perks: readonly string[] = this.profile.skills): Run {
    this.run = newRun(seed, difficulty, oaths, perks);
    this.profile.runs++;
    this.noteSeen(this.run.offers.map((o) => o?.sp));
    this.save();
    return this.run;
  }

  update(run: Run): void {
    this.run = run;
    this.noteSeen(run.offers.map((o) => o?.sp));
    this.save();
  }

  /** Called when a run ends (won or lost) to record it. */
  finish(): void {
    const run = this.run;
    if (!run) return;
    if (run.endless) {
      // the tournament itself was won before; only the depth is new
      this.profile.depth[run.difficulty] = Math.max(this.profile.depth[run.difficulty], run.round);
    } else {
      const best = this.profile.best[run.difficulty];
      const reached = run.phase === "won" ? 12 : run.round;
      this.profile.best[run.difficulty] = { round: Math.max(best.round, reached), wins: best.wins + (run.phase === "won" ? 1 : 0) };
    }
    this.profile.records.unshift({
      t: Date.now(),
      difficulty: run.difficulty,
      seed: run.seed,
      outcome: run.phase === "won" ? "won" : "lost",
      round: run.round,
      endless: run.endless,
      wins: run.history.filter((h) => h.outcome === "win").length,
      team: run.team.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => u.sp),
    });
    this.profile.records.length = Math.min(this.profile.records.length, MAX_RECORDS);
    write(RUN_KEY, null);
    this.saveProfile();
  }

  /** Record trophies earned and return the ones that are new. */
  award(ids: string[]): string[] {
    const fresh = ids.filter((id) => !this.profile.trophies.includes(id));
    if (fresh.length > 0) {
      this.profile.trophies.push(...fresh);
      this.saveProfile();
    }
    return fresh;
  }

  /** Skill points not spent yet. */
  points(): number {
    return pointsEarned(this.profile.trophies) - totalCost(this.profile.skills);
  }

  /** Buy a skill with the points earned. */
  learn(id: string): Buy {
    const r = buySkill(this.profile.skills, id, pointsEarned(this.profile.trophies));
    if (r.ok) {
      this.profile.skills = r.skills;
      this.saveProfile();
    }
    return r;
  }

  /** Take every skill back and get all the points to spend again. */
  forgetSkills(): void {
    this.profile.skills = [];
    this.saveProfile();
  }

  noteSeen(ids: Array<string | undefined>): void {
    let changed = false;
    for (const id of ids) {
      if (id && hasSpecies(id) && !this.profile.seen.includes(id)) {
        this.profile.seen.push(id);
        changed = true;
      }
    }
    if (changed) this.saveProfile();
  }

  save(): void {
    if (this.run && this.run.phase === "shop") write(RUN_KEY, serializeRun(this.run));
  }

  saveProfile(): void {
    write(PROFILE_KEY, JSON.stringify(this.profile));
  }

  abandon(): void {
    this.run = null;
    write(RUN_KEY, null);
  }
}

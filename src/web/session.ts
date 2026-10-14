/**
 * Everything that outlives a scene: the current run, the profile (best results, bestiary,
 * settings) and their storage. Storage can be blocked (private windows), so every access is
 * wrapped and the game works without it.
 */

import { type Run, newRun } from "../engine/run.js";
import { parseRun, serializeRun } from "../engine/save.js";
import { DIFFICULTIES, type Difficulty } from "../engine/types.js";
import { hasSpecies } from "../engine/data.js";

const RUN_KEY = "beast-tourney.run.v1";
const PROFILE_KEY = "beast-tourney.profile.v1";

export interface Profile {
  /** Species the player has met, in the shop or across the battlefield. */
  seen: string[];
  /** Highest round reached and runs won, per difficulty. */
  best: Record<Difficulty, { round: number; wins: number }>;
  muted: boolean;
  musicVolume: number;
  runs: number;
  seenHelp: boolean;
}

const emptyProfile = (): Profile => ({
  seen: [],
  best: { squire: { round: 0, wins: 0 }, knight: { round: 0, wins: 0 }, champion: { round: 0, wins: 0 } },
  muted: false,
  musicVolume: 0.5,
  runs: 0,
  seenHelp: false,
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
    if (typeof raw.muted === "boolean") base.muted = raw.muted;
    if (typeof raw.musicVolume === "number" && raw.musicVolume >= 0 && raw.musicVolume <= 1) base.musicVolume = raw.musicVolume;
    if (Number.isInteger(raw.runs) && (raw.runs as number) >= 0) base.runs = raw.runs as number;
    if (typeof raw.seenHelp === "boolean") base.seenHelp = raw.seenHelp;
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

  start(difficulty: Difficulty, seed = Math.floor(Math.random() * 0xffffffff)): Run {
    this.run = newRun(seed, difficulty);
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
    const best = this.profile.best[run.difficulty];
    const reached = run.phase === "won" ? 12 : run.round;
    this.profile.best[run.difficulty] = { round: Math.max(best.round, reached), wins: best.wins + (run.phase === "won" ? 1 : 0) };
    write(RUN_KEY, null);
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

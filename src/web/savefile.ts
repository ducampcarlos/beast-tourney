/**
 * The save file: the whole progress of a player (profile and the run in progress) as one JSON
 * document they can keep, move to another browser or put back. It is read like any untrusted
 * input: the profile and the run are checked field by field by the same code that checks
 * what comes out of the browser's storage.
 */

import { t } from "../i18n/index.js";
import { type Run } from "../engine/run.js";
import { parseRun } from "../engine/save.js";
import { type Profile, parseProfile } from "./session.js";

export const SAVE_GAME = "beast-tourney";
export const SAVE_FORMAT = 1;
/** A real save is a few kilobytes; anything much bigger is not one. */
export const MAX_SAVE_BYTES = 512 * 1024;

export interface SaveFile {
  game: typeof SAVE_GAME;
  format: typeof SAVE_FORMAT;
  /** When it was exported (ISO 8601). */
  exported: string;
  profile: Profile;
  /** The run in progress, if any. */
  run: Run | null;
}

export function buildSave(profile: Profile, run: Run | null, now = new Date()): string {
  const file: SaveFile = { game: SAVE_GAME, format: SAVE_FORMAT, exported: now.toISOString(), profile, run: run && run.phase === "shop" ? run : null };
  return JSON.stringify(file, null, 1);
}

export type Imported = { ok: true; profile: Profile; run: Run | null; exported: string } | { ok: false; error: string };

export function parseSave(text: string): Imported {
  if (text.length > MAX_SAVE_BYTES) return { ok: false, error: t("That file is too big to be a save.") };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: t("That file is not a Beast Tourney save.") };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: t("That file is not a Beast Tourney save.") };
  const file = raw as Record<string, unknown>;
  if (file.game !== SAVE_GAME) return { ok: false, error: t("That file is not a Beast Tourney save.") };
  if (file.format !== SAVE_FORMAT) return { ok: false, error: t("That save comes from a different version of the game.") };
  if (typeof file.profile !== "object" || file.profile === null || Array.isArray(file.profile)) return { ok: false, error: t("That save has no progress in it.") };
  // parseProfile keeps what is valid and drops what is not, so a damaged profile still gives a usable one
  const profile = parseProfile(JSON.stringify(file.profile));
  let run: Run | null = null;
  if (file.run !== null && file.run !== undefined) {
    run = parseRun(JSON.stringify(file.run));
    if (run === null || run.phase !== "shop") return { ok: false, error: t("The run inside that save is damaged.") };
  }
  return { ok: true, profile, run, exported: typeof file.exported === "string" ? file.exported.slice(0, 40) : "" };
}

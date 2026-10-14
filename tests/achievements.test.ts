import { describe, expect, it } from "vitest";

import { TROPHIES, bondTiers, hasTrophy, newTrophies, trophy, type Facts } from "../src/engine/achievements.js";
import { SPECIES_LIST, species } from "../src/engine/data.js";
import type { Unit } from "../src/engine/types.js";
import { MAX_RECORDS, parseProfile } from "../src/web/session.js";

const u = (uid: number, sp: string, extra: Partial<Unit> = {}): Unit => ({ uid, sp, atk: species(sp).atk, hp: species(sp).hp, level: 1, exp: 0, ...extra });
const earned = (facts: Facts, owned: string[] = []) => newTrophies(owned, facts);

describe("trophies", () => {
  it("are well formed", () => {
    expect(TROPHIES.length).toBeGreaterThanOrEqual(14);
    expect(new Set(TROPHIES.map((t) => t.id)).size).toBe(TROPHIES.length);
    for (const t of TROPHIES) {
      expect(t.name.length).toBeGreaterThan(3);
      expect(t.text.endsWith(".")).toBe(true);
      expect(trophy(t.id)).toBe(t);
      expect(hasTrophy(t.id)).toBe(true);
    }
    expect(hasTrophy("nope")).toBe(false);
    expect(trophy("nope")).toBeUndefined();
  });

  it("awards nothing for nothing", () => {
    expect(earned({})).toEqual([]);
    expect(earned({ team: [null, null, null, null, null], battle: { outcome: "draw", round: 2, bonds: [] } })).toEqual([]);
  });

  it("awards battle trophies", () => {
    expect(earned({ battle: { outcome: "win", round: 1, bonds: [] } })).toEqual(["first-blood"]);
    expect(earned({ battle: { outcome: "lose", round: 4, bonds: [] } })).toEqual([]);
    expect(earned({ battle: { outcome: "win", round: 4, bonds: [2] } })).toEqual(["first-blood", "better-together", "goblin-toppled"]);
    expect(earned({ battle: { outcome: "win", round: 8, bonds: [2, 4] } })).toEqual(["first-blood", "better-together", "united-front", "two-banners", "lich-laid-to-rest"]);
  });

  it("awards shop trophies from the team and the boons", () => {
    expect(earned({ team: [u(1, "wolf", { level: 2 }), null, null, null, null] })).toEqual(["growing-up"]);
    expect(earned({ team: [u(1, "wolf", { level: 3 })] })).toEqual(["growing-up", "fully-grown"]);
    const armed = [1, 2, 3, 4, 5].map((i) => u(i, "wolf", { relic: "whetstone" }));
    expect(earned({ team: armed })).toEqual(["armed"]);
    expect(earned({ team: [...armed.slice(0, 4), u(9, "wolf")] })).toEqual([]);
    expect(earned({ boons: ["purse"] })).toEqual([]);
    expect(earned({ boons: ["purse", "tonic"] })).toEqual(["twice-blessed"]);
  });

  it("awards the crowns for winning on each rank, plus the flourishes", () => {
    const won = (difficulty: "squire" | "knight" | "champion", lives: number, lost: boolean): Facts => ({ end: { won: true, difficulty, lives, lost } });
    expect(earned(won("squire", 3, true))).toEqual(["squire-crown"]);
    expect(earned(won("knight", 4, false))).toEqual(["knight-crown", "untouched"]);
    expect(earned(won("champion", 1, true))).toEqual(["champion-crown", "by-a-thread"]);
    expect(earned({ end: { won: false, difficulty: "knight", lives: 0, lost: true } })).toEqual([]);
  });

  it("awards the Naturalist for meeting everything", () => {
    expect(earned({ seen: SPECIES_LIST.length - 1 })).toEqual([]);
    expect(earned({ seen: SPECIES_LIST.length })).toEqual(["naturalist"]);
  });

  it("never awards a trophy twice", () => {
    expect(earned({ battle: { outcome: "win", round: 1, bonds: [] } }, ["first-blood"])).toEqual([]);
  });

  it("counts the bonds of a team", () => {
    expect(bondTiers([u(1, "wolf"), u(2, "boar"), null, null, null])).toEqual([2]);
    expect(bondTiers([u(1, "wolf"), u(2, "wolf")])).toEqual([]);
    expect(bondTiers([u(1, "wolf"), u(2, "boar"), u(3, "bear"), u(4, "tiger"), u(5, "skeleton")])).toEqual([4]);
    expect(bondTiers([u(1, "wolf"), u(2, "boar"), u(3, "skeleton"), u(4, "zombie")])).toEqual([2, 2]);
    expect(bondTiers([u(1, "wolf"), u(2, "boar"), u(3, "bear")], ["bond-sage"])).toEqual([4]);
  });
});

describe("the saved profile", () => {
  it("starts empty and sound", () => {
    const p = parseProfile(null);
    expect(p).toMatchObject({ seen: [], trophies: [], muted: false, seenHelp: false, speed: 1, runs: 0 });
    expect(p.sfxVolume).toBeGreaterThan(0);
    expect(p.musicVolume).toBeGreaterThan(0);
  });

  it("keeps good values and drops bad ones", () => {
    const good = parseProfile(JSON.stringify({ seen: ["wolf", "nope", 5], trophies: ["first-blood", "x", "first-blood"], speed: 4, sfxVolume: 0.3, musicVolume: 0.2, muted: true, seenHelp: true, runs: 3, best: { knight: { round: 9, wins: 2 } } }));
    expect(good).toMatchObject({ seen: ["wolf"], trophies: ["first-blood"], speed: 4, sfxVolume: 0.3, musicVolume: 0.2, muted: true, seenHelp: true, runs: 3 });
    expect(good.best.knight).toEqual({ round: 9, wins: 2 });
    const bad = parseProfile(JSON.stringify({ speed: 3, sfxVolume: 7, musicVolume: -1, muted: "yes", trophies: "all", best: { knight: { round: 99, wins: 1 } }, runs: -2 }));
    expect(bad).toMatchObject({ speed: 1, muted: false, trophies: [], runs: 0 });
    expect(bad.sfxVolume).toBeLessThanOrEqual(1);
    expect(bad.best.knight.round).toBe(0);
  });

  it("keeps well-formed run records and drops the rest", () => {
    const good = { t: 1700000000000, difficulty: "knight", seed: 42, outcome: "won", round: 12, endless: false, wins: 11, team: ["wolf", "boar"] };
    const profile = parseProfile(JSON.stringify({ records: [good, { ...good, outcome: "tie" }, { ...good, team: ["wolf", "nope"] }, { ...good, round: 0 }, { ...good, difficulty: "easy" }, { ...good, team: Array(6).fill("wolf") }, "x", null, { ...good, seed: -1 }, { ...good, endless: "no" }, { ...good, round: 20, endless: true, outcome: "lost" }] }));
    expect(profile.records).toEqual([good, { ...good, round: 20, endless: true, outcome: "lost" }]);
    expect(parseProfile(JSON.stringify({ records: Array(40).fill(good) })).records).toHaveLength(MAX_RECORDS);
    expect(parseProfile(JSON.stringify({ records: "all of them" })).records).toEqual([]);
  });

  it("survives garbage", () => {
    for (const text of ["", "{{{", "null", "[]", "42", '"x"']) expect(parseProfile(text).seen).toEqual([]);
  });
});

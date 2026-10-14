import { describe, expect, it } from "vitest";

import { TROPHIES, newTrophies, pointsEarned } from "../src/engine/achievements.js";
import { simulateBattle } from "../src/engine/battle.js";
import { BRANCHES, SKILLS, buySkill, hasSkill, skill, totalCost, validTree } from "../src/engine/skills.js";
import { START_GOLD, buy, buyRelic, fight, newRun, offerSlots, relicCost, roll, rollCost, sell, sellGold, shopTier, type Run } from "../src/engine/run.js";
import { parseRun, serializeRun } from "../src/engine/save.js";
import { RELICS, species } from "../src/engine/data.js";
import { parseProfile } from "../src/web/session.js";
import { playRun } from "../src/sim/bots.js";
import { events, resetUids, setup, unit } from "./helpers.js";

const withPerks = (perks: string[], round = 1): Run => setup(newRun(5, "knight", [], perks), { round });

describe("the skill tree", () => {
  it("has three branches of four distinct skills with sensible costs and requirements", () => {
    expect(SKILLS).toHaveLength(12);
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(12);
    for (const b of BRANCHES) {
      const list = SKILLS.filter((s) => s.branch === b);
      expect(list, b).toHaveLength(4);
      expect(list[0]!.requires, `${b} root`).toEqual([]);
    }
    for (const s of SKILLS) {
      expect(s.cost).toBeGreaterThan(0);
      expect(s.text.length).toBeGreaterThan(15);
      expect(s.icon).toBeLessThan(132);
      expect(skill(s.id)).toBe(s);
      for (const r of s.requires) {
        expect(hasSkill(r), `${s.id} requires ${r}`).toBe(true);
        expect(skill(r).branch, "requirements stay within a branch").toBe(s.branch);
        expect(skill(r).cost, "a skill costs more than what it needs").toBeLessThan(s.cost + 1);
      }
    }
    expect(() => skill("nope")).toThrow();
  });

  it("cannot be bought out by the points of the challenges alone", () => {
    const all = TROPHIES.reduce((sum, t) => sum + t.points, 0);
    expect(totalCost(SKILLS.map((s) => s.id))).toBeLessThanOrEqual(all);
    expect(all).toBeGreaterThan(0);
    expect(pointsEarned(TROPHIES.map((t) => t.id))).toBe(all);
    expect(pointsEarned([])).toBe(0);
    expect(pointsEarned(["nope"])).toBe(0);
  });

  it("is bought one skill at a time, with points, in order", () => {
    expect(buySkill([], "lucky-start", 1)).toMatchObject({ ok: false, error: expect.stringContaining("costs 2") });
    const first = buySkill([], "lucky-start", 2);
    expect(first).toEqual({ ok: true, skills: ["lucky-start"] });
    expect(buySkill(["lucky-start"], "lucky-start", 99)).toMatchObject({ ok: false });
    expect(buySkill([], "haggle", 99)).toMatchObject({ ok: false, error: expect.stringContaining("Lucky Start") });
    expect(buySkill(["lucky-start", "haggle"], "keen-eye", 99)).toMatchObject({ ok: false, error: expect.stringContaining("Quick Sale") });
    expect(buySkill(["lucky-start"], "haggle", 5)).toMatchObject({ ok: false }); // 5 earned, 2 spent: 3 left, it costs 4
    expect(buySkill(["lucky-start"], "haggle", 6)).toEqual({ ok: true, skills: ["lucky-start", "haggle"] });
    expect(buySkill([], "nope", 99)).toMatchObject({ ok: false });
  });

  it("checks that a set of skills adds up", () => {
    expect(validTree([])).toBe(true);
    expect(validTree(["lucky-start", "haggle"])).toBe(true);
    expect(validTree(["haggle"])).toBe(false);
    expect(validTree(["lucky-start", "lucky-start"])).toBe(false);
    expect(validTree(["bogus"])).toBe(false);
    expect(validTree(SKILLS.map((s) => s.id))).toBe(true);
  });
});

describe("skills in a run", () => {
  it("start with none, and keep only known, distinct ones", () => {
    expect(newRun(1, "knight").perks).toEqual([]);
    expect(newRun(1, "knight", [], ["tough", "tough", "bogus"]).perks).toEqual(["tough"]);
  });

  it("Lucky Start gives one more gold on each of the first six turns, and then stops", () => {
    expect(withPerks(["lucky-start"]).gold).toBe(START_GOLD + 1);
    const late = setup(newRun(5, "knight", [], ["lucky-start"]), { round: 7 });
    const r = fight({ ...late, team: [unit("wolf", 90, 99), null, null, null, null], nextUid: 99 });
    expect(r.ok && r.run.round).toBe(8);
    expect(r.ok && r.run.gold).toBe(START_GOLD);
    const early = fight({ ...setup(newRun(5, "knight", [], ["lucky-start"]), { round: 3 }), team: [unit("wolf", 90, 99), null, null, null, null], nextUid: 99 });
    expect(early.ok && early.run.gold).toBe(START_GOLD + 1);
  });

  it("Sharp Haggler takes a gold off every relic", () => {
    const plain = withPerks([]);
    const haggler = withPerks(["haggle"]);
    for (const def of RELICS) expect(relicCost(haggler, def)).toBe(Math.max(2, relicCost(plain, def) - 1));
  });

  it("Quick Sale pays more for a tier 2 creature, not for a tier 1", () => {
    const run = withPerks(["thrifty"]);
    expect(sellGold(run, unit("squirrel"))).toBe(1);
    expect(sellGold(run, unit("boar"))).toBe(2);
    expect(sellGold(withPerks([]), unit("boar"))).toBe(1);
  });

  it("Keen Eye makes the first roll of a turn free, and pays one more gold from round 7", () => {
    const run = withPerks(["keen-eye"]);
    expect(rollCost(run)).toBe(0);
    const rolled = roll(run);
    expect(rolled.ok && rolled.run.gold).toBe(run.gold);
    expect(rolled.ok && rollCost(rolled.run)).toBe(1);
    const late = fight({ ...setup(newRun(5, "knight", [], ["keen-eye"]), { round: 7 }), team: [unit("wolf", 90, 99), null, null, null, null], nextUid: 99 });
    expect(late.ok && late.run.gold).toBe(START_GOLD + 1);
    expect(late.ok && late.run.freeRolls).toBe(1);
  });

  it("Early Bird adds an offer in the first two rounds only", () => {
    expect(offerSlots(withPerks(["early-bird"], 1))).toBe(offerSlots(withPerks([], 1)) + 1);
    expect(offerSlots(withPerks(["early-bird"], 2))).toBe(offerSlots(withPerks([], 2)) + 1);
    expect(offerSlots(withPerks(["early-bird"], 3))).toBe(offerSlots(withPerks([], 3)));
    expect(newRun(5, "knight", [], ["early-bird"]).offers).toHaveLength(4);
  });

  it("Scholar's Eye raises the shop tier from round 8", () => {
    expect(shopTier(withPerks(["scholar-eye"], 7))).toBe(shopTier(withPerks([], 7)));
    expect(shopTier(withPerks(["scholar-eye"], 8))).toBe(shopTier(withPerks([], 8)) + 1);
    expect(shopTier(withPerks(["scholar-eye"], 12))).toBe(5);
  });

  it("Apprentice's Care helps the weakest creature on every third round", () => {
    const next = (from: number, perks: string[]) => {
      const done = fight({ ...setup(newRun(5, "knight", [], perks), { round: from }), team: [unit("wolf", 90, 99), unit("bones", 1, 1), null, null, null], nextUid: 99 });
      if (!done.ok) throw new Error(done.error);
      return done.run;
    };
    const weakest = (r: Run) => r.team[1]!;
    expect([weakest(next(2, ["apprentice"])).atk, weakest(next(2, ["apprentice"])).hp]).toEqual([2, 2]); // the turn of round 3 begins
    expect([weakest(next(3, ["apprentice"])).atk, weakest(next(3, ["apprentice"])).hp]).toEqual([1, 1]); // round 4: nothing
    expect(weakest(next(2, [])).atk).toBe(1);
  });

  it("Second Chance starts the run with one more life, and stacks with the oath that takes one away", () => {
    expect(newRun(1, "knight", [], ["second-chance"]).lives).toBe(5);
    expect(newRun(1, "knight", ["fragile"], ["second-chance"]).lives).toBe(4);
  });
});

describe("skills in battle", () => {
  const stats = (r: ReturnType<typeof simulateBattle>) => r.steps[1]!.teams[0].map((u) => [u.atk, u.hp]);
  const team = () => [unit("bones", 2, 5), unit("bones", 2, 5), unit("bones", 2, 5)];
  const foe = () => [unit("bones", 1, 60)];

  it("Toughened adds a health to the front creature, Shield Wall an attack", () => {
    resetUids();
    expect(stats(simulateBattle(team(), foe(), 1, { perks: ["tough"] }))).toEqual([[2, 6], [2, 5], [2, 5]]);
    expect(stats(simulateBattle(team(), foe(), 1, { perks: ["front-guard"] }))).toEqual([[3, 5], [2, 5], [2, 5]]);
  });

  it("Sharpened gives one creature an attack", () => {
    const r = simulateBattle(team(), foe(), 1, { perks: ["sharp"] });
    const gained = stats(r).filter(([atk]) => atk === 3);
    expect(gained).toHaveLength(1);
  });

  it("Last Stand brings the first fallen creature back with 30% of its stats", () => {
    resetUids();
    const r = simulateBattle([unit("wolf", 1, 1), unit("bones", 1, 30)], [unit("bones", 9, 40)], 1, { perks: ["last-stand"] });
    expect(events(r).some((e) => e.t === "revive")).toBe(true);
    const none = simulateBattle([unit("wolf", 1, 1), unit("bones", 1, 30)], [unit("bones", 9, 40)], 1);
    expect(events(none).some((e) => e.t === "revive")).toBe(false);
  });

  it("are passed to the fight by the run", () => {
    const run = setup(newRun(11, "knight", [], ["front-guard"]), { team: [unit("wolf", 3, 5), null, null, null, null], nextUid: 20 });
    const r = fight(run);
    expect(r.ok && r.battle.steps[1]!.teams[0][0]!.atk).toBe(4);
  });
});

describe("saving skills", () => {
  it("round-trips a run's skills, and old saves load with none", () => {
    const run = newRun(21, "knight", ["glass"], ["lucky-start", "haggle"]);
    expect(parseRun(serializeRun(run))).toEqual(run);
    const old = JSON.parse(serializeRun(newRun(21, "knight")));
    delete old.perks;
    expect(parseRun(JSON.stringify(old))?.perks).toEqual([]);
  });

  it("refuses skills that do not add up", () => {
    const load = (perks: unknown) => {
      const raw = JSON.parse(serializeRun(newRun(21, "knight")));
      raw.perks = perks;
      return parseRun(JSON.stringify(raw));
    };
    expect(load(["tough"])).not.toBeNull();
    for (const bad of [["nope"], ["tough", "tough"], ["sharp"], "tough", [1], [null], SKILLS.map((s) => s.id).concat("tough")]) expect(load(bad), JSON.stringify(bad)).toBeNull();
  });

  it("keeps the tree in the profile, and drops one that does not add up", () => {
    const profile = (skills: unknown, trophies: string[]) => parseProfile(JSON.stringify({ trophies, skills }));
    const earned = TROPHIES.map((t) => t.id);
    expect(profile(["lucky-start", "haggle"], earned).skills).toEqual(["lucky-start", "haggle"]);
    expect(profile(["haggle"], earned).skills).toEqual([]); // missing requirement
    expect(profile(["bogus"], earned).skills).toEqual([]);
    expect(profile(["lucky-start", "lucky-start"], earned).skills).toEqual([]);
    expect(profile(["lucky-start"], []).skills).toEqual([]); // more spent than earned
    expect(profile("lucky-start", earned).skills).toEqual([]);
    expect(parseProfile(null).skills).toEqual([]);
  });
});

describe("the new challenges", () => {
  it("all give points, and the bigger ones give more", () => {
    for (const t of TROPHIES) expect(Number.isInteger(t.points) && t.points >= 1, t.id).toBe(true);
    const points = (id: string) => TROPHIES.find((t) => t.id === id)!.points;
    expect(points("champion-crown")).toBeGreaterThan(points("squire-crown"));
    expect(points("abyss-walker")).toBeGreaterThan(points("first-blood"));
  });

  it("are awarded by what they say", () => {
    const u = (sp: string, extra = {}) => ({ ...unit(sp), ...extra });
    const five = ["wolf", "skeleton", "ember", "fairy", "lizard"].map((sp) => u(sp));
    expect(newTrophies([], { team: five })).toContain("full-house");
    expect(newTrophies([], { team: five.slice(0, 4) })).not.toContain("full-house");
    expect(newTrophies([], { team: [u("wolf", { atk: 30 })] })).toContain("mighty");
    expect(newTrophies([], { team: [u("wolf", { atk: 29 })] })).not.toContain("mighty");
    expect(newTrophies([], { team: [u("wolf", { hp: 50 })] })).toContain("titan");
    expect(newTrophies([], { boons: ["a", "b", "c"] })).toContain("triple-blessed");
    expect(newTrophies([], { boons: ["a", "b"] })).not.toContain("triple-blessed");
    expect(newTrophies([], { runs: 10 })).toEqual(expect.arrayContaining(["seasoned"]));
    expect(newTrophies([], { runs: 9 })).not.toContain("seasoned");
    expect(newTrophies([], { runs: 50 })).toEqual(expect.arrayContaining(["seasoned", "veteran"]));
  });
});

describe("a bot with every skill", () => {
  it("plays a legal run", () => {
    const { run } = playRun(newRun(33, "champion", [], SKILLS.map((s) => s.id)), "greedy");
    expect(["won", "lost"]).toContain(run.phase);
    expect(run.perks).toHaveLength(12);
  });

  it("wins more than a bot with none, because the skills are worth having", () => {
    const rate = (perks: string[]) => {
      let wins = 0;
      for (let i = 1; i <= 120; i++) if (playRun(newRun(i * 7919, "knight", [], perks), "greedy").log.won) wins++;
      return wins / 120;
    };
    expect(rate(SKILLS.map((s) => s.id))).toBeGreaterThan(rate([]) + 0.15);
  });
});

void buy; void buyRelic; void sell; void species;

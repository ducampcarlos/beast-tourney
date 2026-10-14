import { describe, expect, it } from "vitest";

import { newTrophies } from "../src/engine/achievements.js";
import { simulateBattle } from "../src/engine/battle.js";
import { OATHS, hasOath, oath } from "../src/engine/data.js";
import { OATH_POWER, enemyTeam, oathPower, targetPower } from "../src/engine/enemy.js";
import { LIVES, START_GOLD, buy, fight, newRun, roll } from "../src/engine/run.js";
import { parseRun, serializeRun } from "../src/engine/save.js";
import { playRun } from "../src/sim/bots.js";
import { setup, unit } from "./helpers.js";

describe("oaths", () => {
  it("are a short list of distinct, described vows", () => {
    expect(OATHS.length).toBe(5);
    expect(new Set(OATHS.map((o) => o.id)).size).toBe(OATHS.length);
    for (const o of OATHS) {
      expect(o.name.length).toBeGreaterThan(3);
      expect(o.text.length).toBeGreaterThan(10);
      expect(hasOath(o.id)).toBe(true);
      expect(oath(o.id)).toBe(o);
    }
    expect(() => oath("nope")).toThrow();
    expect(hasOath("nope")).toBe(false);
  });

  it("start with none, and keep only known, distinct vows", () => {
    expect(newRun(1, "knight").oaths).toEqual([]);
    expect(newRun(1, "knight", ["glass", "glass", "bogus", "pauper"]).oaths).toEqual(["glass", "pauper"]);
  });

  it("Pauper's Oath takes a gold from every turn, the first included", () => {
    expect(newRun(3, "knight").gold).toBe(START_GOLD);
    const poor = newRun(3, "knight", ["pauper"]);
    expect(poor.gold).toBe(START_GOLD - 1);
    const next = fight(buyOne(poor));
    expect(next.ok && next.run.gold).toBe(START_GOLD - 1);
  });

  it("One Life Fewer costs a life, but never the last one", () => {
    expect(newRun(1, "champion", ["fragile"]).lives).toBe(LIVES.champion - 1);
    expect(newRun(1, "squire", ["fragile"]).lives).toBe(LIVES.squire - 1);
  });

  it("Bare Hands leaves the relic shelf empty for the whole run", () => {
    expect(newRun(5, "knight").relics.length).toBe(0); // round 1 has none anyway
    let run = setup(newRun(5, "knight", ["bare"]), { round: 6 });
    for (let i = 0; i < 6; i++) {
      const r = roll(run);
      if (r.ok) run = r.run;
    }
    expect(run.relics).toEqual([]);
    const plain = setup(newRun(5, "knight"), { round: 6 });
    const rolled = roll(plain);
    expect(rolled.ok && rolled.run.relics.length).toBeGreaterThan(0);
  });

  it("The Hunted and Bare Hands change how strong the opponents are, together too", () => {
    const base = targetPower(6, "knight");
    expect(targetPower(6, "knight", ["hunted"])).toBeCloseTo(base * OATH_POWER.hunted!);
    expect(targetPower(6, "knight", ["bare"])).toBeCloseTo(base * OATH_POWER.bare!);
    expect(oathPower(["hunted", "bare"])).toBeCloseTo(1.1 * 0.92);
    expect(oathPower(["glass", "pauper", "fragile"])).toBe(1);
    const total = (t: ReturnType<typeof enemyTeam>) => t.reduce((s, u) => s + u.atk + u.hp, 0);
    expect(total(enemyTeam(9, 7, 0, "knight", ["hunted"]))).toBeGreaterThan(total(enemyTeam(9, 7, 0, "knight")));
    expect(enemyTeam(9, 7, 0, "knight", [])).toEqual(enemyTeam(9, 7, 0, "knight"));
  });

  it("Glass Cannons trade two health for two attack, down to a single health point", () => {
    const team = [unit("wolf", 3, 5), unit("bones", 1, 1)];
    const foes = [unit("bones", 1, 30)];
    const glass = simulateBattle(team, foes, 4, { oaths: ["glass"] });
    const plain = simulateBattle(team, foes, 4);
    const start = (r: typeof glass) => r.steps[1]!.teams[0].map((u) => [u.atk, u.hp]);
    expect(start(plain)).toEqual([[3, 5], [1, 1]]);
    expect(start(glass)).toEqual([[5, 3], [3, 1]]);
    // the enemy is untouched
    expect(glass.steps[1]!.teams[1].map((u) => [u.atk, u.hp])).toEqual([[1, 30]]);
  });

  it("are passed to the fight by the run", () => {
    const base = setup(newRun(11, "knight", ["glass"]), { team: [unit("wolf", 3, 5), null, null, null, null], nextUid: 20 });
    const r = fight(base);
    expect(r.ok && r.battle.steps[1]!.teams[0][0]!.atk).toBe(5);
  });

  it("survive a save, and old saves without them load with none", () => {
    const run = newRun(21, "knight", ["bare", "hunted"]);
    expect(parseRun(serializeRun(run))).toEqual(run);
    const old = JSON.parse(serializeRun(newRun(21, "knight")));
    delete old.oaths;
    expect(parseRun(JSON.stringify(old))?.oaths).toEqual([]);
  });

  it("are checked when a save is loaded", () => {
    const load = (oaths: unknown) => {
      const raw = JSON.parse(serializeRun(newRun(21, "knight")));
      raw.oaths = oaths;
      return parseRun(JSON.stringify(raw));
    };
    expect(load(["glass"])).not.toBeNull();
    for (const bad of [["nope"], ["glass", "glass"], "glass", [1], [null], OATHS.map((o) => o.id).concat("pauper")]) expect(load(bad), JSON.stringify(bad)).toBeNull();
  });

  it("are rewarded with trophies only for a won tournament", () => {
    const end = (won: boolean, oaths: number) => newTrophies([], { end: { won, difficulty: "knight", lives: 2, lost: true, oaths } });
    expect(end(true, 0)).not.toContain("oathsworn");
    expect(end(false, 3)).not.toContain("oathsworn");
    expect(end(true, 1)).toContain("oathsworn");
    expect(end(true, 1)).not.toContain("unbowed");
    expect(end(true, 3)).toEqual(expect.arrayContaining(["oathsworn", "unbowed"]));
  });

  it("keep a bot's whole run legal, with every oath at once", () => {
    const { run } = playRun(newRun(33, "squire", OATHS.map((o) => o.id)), "greedy");
    expect(["won", "lost"]).toContain(run.phase);
    expect(run.oaths.length).toBe(5);
  });
});

function buyOne(run: ReturnType<typeof newRun>) {
  const r = buy(run, 0, 0);
  return r.ok ? r.run : run;
}

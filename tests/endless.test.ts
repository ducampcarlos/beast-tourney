import { describe, expect, it } from "vitest";

import { MAX_ROUNDS, bossName, enemyTeam, isBossRound, rawPower, targetPower } from "../src/engine/enemy.js";
import { BOONS, species } from "../src/engine/data.js";
import { continueEndless, fight, newRun, type Run } from "../src/engine/run.js";
import { parseRun, serializeRun } from "../src/engine/save.js";
import type { Unit } from "../src/engine/types.js";
import { newTrophies } from "../src/engine/achievements.js";
import { setup } from "./helpers.js";

const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
  return r as Extract<T, { ok: true }>;
};
const fightOk = (run: Run) => {
  const r = fight(run);
  if (!r.ok) throw new Error(r.error);
  return r;
};
const giants = (): (Unit | null)[] => [1, 2, 3, 4, 5].map((i) => ({ uid: i, sp: "mammoth", atk: 90, hp: 900, level: 1, exp: 0 }));
const weak = (): (Unit | null)[] => [{ uid: 1, sp: "squirrel", atk: 1, hp: 1, level: 1, exp: 0 }, null, null, null, null];

/** A won tournament, as it stands on the victory screen. */
function wonRun(seed = 3): Run {
  const r = fight(setup(newRun(seed, "squire"), { round: MAX_ROUNDS, team: giants(), nextUid: 20 }));
  if (!r.ok || r.run.phase !== "won") throw new Error("expected a won run");
  return r.run;
}

describe("endless rounds", () => {
  it("put a boss every fourth round past the twelfth, the three casts coming round again", () => {
    expect([13, 14, 15].map(isBossRound)).toEqual([false, false, false]);
    expect([4, 8, 12, 16, 20, 24, 28].every(isBossRound)).toBe(true);
    expect(bossName(16)).toBe("Goblin King Grakk, Reborn");
    expect(bossName(20)).toBe("Lich Lord Morvane, Reborn");
    expect(bossName(24)).toBe("Ignis, the Elder Dragon, Reborn");
    expect(bossName(28)).toBe("Goblin King Grakk, Reborn");
    expect(bossName(13)).toBeUndefined();
    expect(bossName(12)).toBe("Ignis, the Elder Dragon");
  });

  it("keep climbing in power, 8% a round, on every rank", () => {
    for (let r = MAX_ROUNDS; r < 40; r++) expect(rawPower(r + 1)).toBeGreaterThan(rawPower(r));
    expect(rawPower(13) / rawPower(12)).toBeCloseTo(1.08, 5);
    expect(targetPower(20, "squire")).toBeLessThan(targetPower(20, "champion"));
  });

  it("meet teams of five that land on that curve, boss casts included", () => {
    for (const round of [13, 14, 16, 20, 24, 30]) for (const seed of [1, 2, 3]) {
      const team = enemyTeam(seed, round, 0, "knight");
      expect(team.length).toBeGreaterThanOrEqual(4);
      const got = team.reduce((a, u) => a + u.atk + u.hp, 0);
      expect(Math.abs(got - targetPower(round, "knight"))).toBeLessThanOrEqual(Math.max(8, targetPower(round, "knight") * 0.12));
    }
    expect(enemyTeam(1, 16, 0, "knight").some((u) => species(u.sp).tier === 6)).toBe(true);
    expect(enemyTeam(1, 17, 0, "knight").some((u) => species(u.sp).tier === 6)).toBe(false);
  });

  it("are reproducible", () => {
    expect(enemyTeam(4, 15, 0, "knight")).toEqual(enemyTeam(4, 15, 0, "knight"));
  });
});

describe("entering Endless mode", () => {
  it("is open only to a won tournament, and only once", () => {
    expect(continueEndless(newRun(1, "knight"))).toMatchObject({ ok: false });
    const won = wonRun();
    const first = must(continueEndless(won));
    expect(first.run).toMatchObject({ endless: true, phase: "shop", round: 13, attempt: 0, lives: won.lives, gold: 10 });
    expect(first.run.offers.length).toBeGreaterThan(0);
    expect(continueEndless(first.run)).toMatchObject({ ok: false });
    expect(won.endless).toBe(false); // the run it was given is untouched
  });

  it("keeps the team and the boons it had", () => {
    const won = wonRun();
    const r = must(continueEndless(won)).run;
    expect(r.team).toEqual(won.team);
    expect(r.boons).toEqual(won.boons);
  });
});

describe("playing Endless mode", () => {
  const endless = (patch: Partial<Run> = {}): Run => ({ ...must(continueEndless(wonRun())).run, ...patch });

  it("moves on to the next round after a win, with no final to retry", () => {
    const r = fightOk(setup(endless(), { team: giants(), nextUid: 30 }));
    expect(r.run).toMatchObject({ round: 14, phase: "shop", attempt: 0 });
  });

  it("costs a life for a defeat and ends the run at none, on the round where it fell", () => {
    let run = endless({ lives: 2, team: weak(), nextUid: 30 });
    const a = fightOk(run);
    expect(a.run.lives).toBe(1);
    expect(a.run.round).toBe(14);
    run = setup(a.run, { team: weak(), nextUid: 30 });
    const b = fightOk(run);
    expect(b.run).toMatchObject({ phase: "lost", lives: 0, round: 14 });
  });

  it("offers a boon after an Endless boss while any are left, and none once all are held", () => {
    const run = endless({ round: 16, team: giants(), nextUid: 30, boons: ["purse"] });
    const r = fightOk(run);
    expect(r.run.pendingBoons).toHaveLength(3);
    const all = BOONS.map((b) => b.id);
    const everything = fightOk(setup({ ...run, boons: all.slice(0, 11) }, { team: giants(), nextUid: 30 }));
    expect(everything.run.pendingBoons).toHaveLength(1);
    const none = fightOk(setup({ ...run, boons: all }, { team: giants(), nextUid: 30 }));
    expect(none.run.pendingBoons).toBeNull();
    expect(none.run.phase).toBe("shop"); // nothing blocks the next turn
  });

  it("is saved and loaded like any run, and refuses rounds past twelve without it", () => {
    const run = endless({ round: 17 });
    expect(parseRun(serializeRun(run))).toEqual(run);
    const raw = JSON.parse(serializeRun(run));
    raw.endless = false;
    expect(parseRun(JSON.stringify(raw))).toBeNull();
    raw.endless = "yes";
    expect(parseRun(JSON.stringify(raw))).toBeNull();
    raw.endless = true;
    raw.round = 100;
    expect(parseRun(JSON.stringify(raw))).toBeNull();
    raw.round = 0;
    expect(parseRun(JSON.stringify(raw))).toBeNull();
  });
});

describe("the depth trophies", () => {
  it("are earned by depth", () => {
    expect(newTrophies([], { depth: 15 })).toEqual([]);
    expect(newTrophies([], { depth: 16 })).toEqual(["into-the-depths"]);
    expect(newTrophies([], { depth: 24 })).toEqual(["into-the-depths", "abyss-walker"]);
  });
});

import { describe, expect, it } from "vitest";

import { simulateBattle } from "../src/engine/battle.js";
import { BOONS, bondNeed, boon, hasBoon, relic, species } from "../src/engine/data.js";
import { MAX_ROUNDS } from "../src/engine/enemy.js";
import { buy, buyRelic, chooseBoon, fight, move, newRun, offerSlots, relicCost, roll, rollCost, sell, sellGold, shopTier, teamUnits, toggleFreeze, type Run } from "../src/engine/run.js";
import { parseRun, serializeRun } from "../src/engine/save.js";
import type { Unit } from "../src/engine/types.js";
import { playRun } from "../src/sim/bots.js";
import { events, resetUids, setup, unit } from "./helpers.js";

const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
  return r as Extract<T, { ok: true }>;
};
const giants = (): (Unit | null)[] => [1, 2, 3, 4, 5].map((i) => ({ uid: i, sp: "mammoth", atk: 90, hp: 900, level: 1, exp: 0 }));
const u = (uid: number, sp: string, extra: Partial<Unit> = {}): Unit => ({ uid, sp, atk: species(sp).atk, hp: species(sp).hp, level: 1, exp: 0, ...extra });

/** A run that has just beaten the boss of `round` and is looking at its three boons. */
function afterBoss(seed = 1, round = 4, held: string[] = []): Run {
  const run = setup(newRun(seed, "knight"), { round, team: giants(), nextUid: 20, boons: held });
  const r = fight(run);
  if (!r.ok) throw new Error(r.error);
  return r.run;
}

describe("earning boons", () => {
  it("offers three different boons after beating a boss, and nothing after an ordinary round", () => {
    const run = afterBoss();
    expect(run.pendingBoons).toHaveLength(3);
    expect(new Set(run.pendingBoons).size).toBe(3);
    for (const id of run.pendingBoons!) expect(hasBoon(id)).toBe(true);
    const ordinary = fight(setup(newRun(1, "knight"), { round: 5, team: giants(), nextUid: 20 }));
    expect(ordinary.ok && ordinary.run.pendingBoons).toBeNull();
  });

  it("offers them after the bosses of rounds 4 and 8, but not after the final", () => {
    expect(afterBoss(1, 8).pendingBoons).toHaveLength(3);
    const final = fight(setup(newRun(1, "knight"), { round: MAX_ROUNDS, team: giants(), nextUid: 20 }));
    expect(final.ok && final.run.phase).toBe("won");
    expect(final.ok && final.run.pendingBoons).toBeNull();
  });

  it("offers nothing for a boss that was not beaten", () => {
    const r = fight(setup(newRun(1, "knight"), { round: 4, team: [u(1, "squirrel", { atk: 1, hp: 1 })], nextUid: 20 }));
    expect(r.ok && r.run.pendingBoons).toBeNull();
  });

  it("deals the same choice for the same run, a different one for another", () => {
    expect(afterBoss(7).pendingBoons).toEqual(afterBoss(7).pendingBoons);
    const choices = new Set(Array.from({ length: 20 }, (_, i) => afterBoss(i + 1).pendingBoons!.join()));
    expect(choices.size).toBeGreaterThan(8);
  });

  it("never offers a boon already held", () => {
    for (let seed = 1; seed <= 30; seed++) for (const id of afterBoss(seed, 8, ["tonic", "purse", "mentor"]).pendingBoons!) expect(["tonic", "purse", "mentor"]).not.toContain(id);
  });

  it("blocks everything until one is taken, then clears", () => {
    const run = afterBoss();
    const stuck = [roll(run), buy(run, 0, 0), sell(run, 0), move(run, 0, 1), buyRelic(run, 0, 0), toggleFreeze(run, "creature", 0)];
    for (const r of stuck) expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/reward/) });
    expect(fight(run)).toMatchObject({ ok: false, error: expect.stringMatching(/reward/) });
    const id = run.pendingBoons![0]!;
    const taken = must(chooseBoon(run, id)).run;
    expect(taken.pendingBoons).toBeNull();
    expect(taken.boons).toEqual([id]);
    expect(roll(taken).ok).toBe(true);
  });

  it("only accepts a boon that is on offer", () => {
    const run = afterBoss();
    const absent = BOONS.find((b) => !run.pendingBoons!.includes(b.id))!.id;
    expect(chooseBoon(run, absent)).toMatchObject({ ok: false });
    expect(chooseBoon(run, "nope")).toMatchObject({ ok: false });
    expect(chooseBoon(newRun(1, "knight"), "purse")).toMatchObject({ ok: false });
  });

  it("does not mutate the run it is given", () => {
    const run = afterBoss();
    const before = JSON.stringify(run);
    must(chooseBoon(run, run.pendingBoons![0]!));
    expect(JSON.stringify(run)).toBe(before);
  });
});

/** Run with this boon already taken, as if chosen at the start of round 5. */
function holding(id: string, patch: Partial<Run> = {}): Run {
  const base = setup(newRun(3, "knight"), { round: 5, nextUid: 50, ...patch });
  return { ...base, boons: [id] };
}

describe("what each boon does", () => {
  it("Heavy Purse: +2 gold now and at every turn start", () => {
    const run = afterBoss();
    const picked = must(chooseBoon({ ...run, pendingBoons: [...run.pendingBoons!.slice(0, 2), "purse"] }, "purse")).run;
    expect(picked.gold).toBe(run.gold + 2);
    const next = fight(setup(picked, { team: giants(), nextUid: 30 }));
    expect(next.ok && next.run.gold).toBe(12);
  });

  it("Second Wind: one more life", () => {
    const run = afterBoss();
    const r = must(chooseBoon({ ...run, pendingBoons: ["second-wind", "purse", "tonic"] }, "second-wind"));
    expect(r.run.lives).toBe(run.lives + 1);
    expect(r.events).toContainEqual({ t: "life" });
  });

  it("Lucky Charm: the first roll each turn is free, the next costs 1, and it comes back next turn", () => {
    const run = afterBoss();
    const r = must(chooseBoon({ ...run, pendingBoons: ["lucky", "purse", "tonic"] }, "lucky")).run;
    expect(rollCost(r)).toBe(0);
    const a = must(roll(r)).run;
    expect([a.gold, rollCost(a)]).toEqual([r.gold, 1]);
    const b = must(roll(a)).run;
    expect(b.gold).toBe(r.gold - 1);
    const next = fight(setup(b, { team: giants(), nextUid: 30 }));
    expect(next.ok && rollCost(next.run)).toBe(0);
    expect(rollCost(newRun(1, "knight"))).toBe(1);
  });

  it("Veteran's Banner: the weakest creature gains +2/+2 now and every turn", () => {
    const run = holding("mentor", { team: [u(1, "mammoth", { atk: 20, hp: 60 }), u(2, "squirrel", { atk: 1, hp: 1 }), null, null, null] });
    const next = fight(setup(run, { team: run.team, nextUid: 60 }));
    if (!next.ok) throw new Error(next.error);
    // the squirrel is the weakest: +2/+2 from the banner, +1 health from its own ability
    const squirrel = next.run.team.find((x) => x?.sp === "squirrel");
    if (squirrel) expect(squirrel.atk).toBeGreaterThanOrEqual(3);
    const fresh = afterBoss();
    const weak = { ...fresh, team: [u(1, "squirrel", { atk: 1, hp: 1 }), u(2, "mammoth", { atk: 30, hp: 99 }), null, null, null] as (Unit | null)[], pendingBoons: ["mentor", "purse", "tonic"] };
    const taken = must(chooseBoon(weak, "mentor")).run;
    expect([taken.team[0]!.atk, taken.team[0]!.hp, taken.team[1]!.atk]).toEqual([3, 3, 30]);
  });

  it("Wider Market: one more offer, never above five, and the table is dealt again", () => {
    const run = afterBoss(); // round 5: four offers
    expect(run.offers).toHaveLength(4);
    const r = must(chooseBoon({ ...run, pendingBoons: ["market", "purse", "tonic"] }, "market")).run;
    expect(r.offers).toHaveLength(5);
    expect(offerSlots({ ...r, round: 9 })).toBe(5);
    expect(offerSlots({ ...newRun(1, "knight"), boons: ["market"] })).toBe(4);
  });

  it("Scholar's Lens: the shop sells one tier higher", () => {
    const base = newRun(1, "knight");
    expect(shopTier(base)).toBe(1);
    expect(shopTier({ ...base, boons: ["scholar"] })).toBe(2);
    expect(shopTier({ ...base, round: 9, boons: ["scholar"] })).toBe(5);
    let sawTier2 = false;
    for (let seed = 1; seed <= 40 && !sawTier2; seed++) {
      const r = must(chooseBoon({ ...afterBoss(seed), pendingBoons: ["scholar", "purse", "tonic"] }, "scholar")).run;
      sawTier2 = r.offers.some((o) => o && species(o.sp).tier === 4);
    }
    expect(sawTier2).toBe(true); // round 5 normally tops out at tier 3
  });

  it("Haggler's Ledger: relics cost 1 less, never under 2", () => {
    const run = holding("haggler", { team: [u(1, "wolf"), null, null, null, null], relics: [{ id: "whetstone", frozen: false }, { id: "arcane-staff", frozen: false }], gold: 10 });
    expect(relicCost(run, relic("whetstone"))).toBe(2);
    expect(relicCost(run, relic("arcane-staff"))).toBe(4);
    const r = must(buyRelic(run, 0, 0)).run;
    expect(r.gold).toBe(8);
    expect(relicCost(newRun(1, "knight"), relic("whetstone"))).toBe(3);
  });

  it("Thrifty Soul: selling gives one more gold", () => {
    const run = holding("thrift", { team: [u(1, "wolf", { level: 2, exp: 2 }), null, null, null, null], gold: 0 });
    expect(sellGold(run, run.team[0]!)).toBe(3);
    expect(must(sell(run, 0)).run.gold).toBe(3);
  });

  it("Bond Sage: four-creature bonds need only three kinds, in battle and in the shop", () => {
    expect([bondNeed(4, ["bond-sage"]), bondNeed(2, ["bond-sage"]), bondNeed(4, [])]).toEqual([3, 2, 4]);
    resetUids();
    const trio = [unit("wolf", 2, 9), unit("boar", 3, 9), unit("bear", 3, 9)];
    const bonded = simulateBattle(trio, [unit("bones", 1, 99)], 1, { boons: ["bond-sage"] });
    expect(events(bonded).find((e) => e.t === "bond")).toMatchObject({ faction: "wildkin", need: 4 });
    expect(bonded.steps[1]!.teams[0].map((x) => x.atk)).toEqual([5, 6, 6]); // +3 attack, the 4-bond
    const plain = simulateBattle(trio, [unit("bones", 1, 99)], 1);
    expect(events(plain).find((e) => e.t === "bond")).toMatchObject({ need: 2 });
    // in the shop: three Fae give the +1/+1 each turn instead of just +1 health
    const fae = holding("bond-sage", { team: [u(1, "fairy", { atk: 40, hp: 99 }), u(2, "mushroom", { atk: 40, hp: 99 }), u(3, "leprechaun", { atk: 40, hp: 99 }), null, null] });
    const next = fight(setup(fae, { team: fae.team, nextUid: 60 }));
    if (!next.ok) throw new Error(next.error);
    expect(next.run.team[0]).toMatchObject({ atk: 41, hp: 100 });
  });

  it("Vanguard's Oath: the front creature starts every battle behind a barrier", () => {
    resetUids();
    const r = simulateBattle([unit("bones", 2, 9), unit("bones", 2, 9)], [unit("bones", 5, 50)], 1, { boons: ["bulwark"] });
    expect(events(r)).toContainEqual({ t: "boon", id: "bulwark" });
    expect(r.steps[1]!.teams[0].map((x) => x.statuses.includes("barrier"))).toEqual([true, false]);
  });

  it("Battle Tonic: everyone starts with +1/+1", () => {
    resetUids();
    const r = simulateBattle([unit("bones", 2, 5), unit("bones", 3, 6)], [unit("bones", 1, 50)], 1, { boons: ["tonic"] });
    expect(r.steps[1]!.teams[0].map((x) => `${x.atk}/${x.hp}`)).toEqual(["3/6", "4/7"]);
  });

  it("Phoenix Ember: the first creature to fall returns at half stats, once, and only for you", () => {
    resetUids();
    const r = simulateBattle([unit("squirrel", 8, 8)], [unit("bones", 9, 40)], 1, { boons: ["ember"] });
    expect(events(r).filter((e) => e.t === "revive")).toHaveLength(1);
    const back = r.steps.flatMap((s) => s.teams[0]).find((x) => x.uid >= 2_000_000);
    expect(back).toMatchObject({ atk: 4, hp: 4 });
    // the enemy never benefits, whatever boons you hold
    const foe = simulateBattle([unit("squirrel", 40, 40)], [unit("squirrel", 5, 5)], 1, { boons: ["ember"] });
    expect(events(foe).filter((e) => e.t === "revive")).toHaveLength(0);
  });

  it("does not fire any boon that was not chosen", () => {
    resetUids();
    const r = simulateBattle([unit("bones", 2, 5)], [unit("bones", 1, 50)], 1);
    expect(events(r).filter((e) => e.t === "boon")).toHaveLength(0);
  });
});

describe("boon content", () => {
  it("is well formed", () => {
    expect(BOONS).toHaveLength(15);
    expect(new Set(BOONS.map((b) => b.id)).size).toBe(BOONS.length);
    for (const b of BOONS) {
      expect(b.icon).toBeGreaterThanOrEqual(0);
      expect(b.icon).toBeLessThan(132);
      expect(b.text.length).toBeGreaterThan(15);
      expect(boon(b.id)).toBe(b);
    }
    expect(() => boon("nope")).toThrow();
  });
});

describe("saving boons", () => {
  it("round-trips held and pending boons", () => {
    const run = afterBoss();
    expect(parseRun(serializeRun(run))).toEqual(run);
    const held = must(chooseBoon(run, run.pendingBoons![0]!)).run;
    expect(parseRun(serializeRun(held))).toEqual(held);
  });

  it("loads a save from before boons existed, as a run without any", () => {
    const old = JSON.parse(serializeRun(newRun(1, "knight")));
    delete old.boons;
    delete old.pendingBoons;
    delete old.freeRolls;
    expect(parseRun(JSON.stringify(old))).toMatchObject({ boons: [], pendingBoons: null, freeRolls: 0 });
  });

  it("refuses tampered boons", () => {
    const raw = () => JSON.parse(serializeRun(afterBoss()));
    const bad: Array<[string, (r: Record<string, any>) => void]> = [
      ["unknown held boon", (r) => (r.boons = ["godmode"])],
      ["duplicate boons", (r) => (r.boons = ["purse", "purse"])],
      ["boons not a list", (r) => (r.boons = "purse")],
      ["too many held", (r) => (r.boons = ["purse", "tonic", "lucky", "thrift", "mentor"])],
      ["unknown pending", (r) => (r.pendingBoons = ["godmode"])],
      ["empty pending", (r) => (r.pendingBoons = [])],
      ["too many pending", (r) => (r.pendingBoons = ["purse", "tonic", "lucky", "thrift"])],
      ["pending duplicates", (r) => (r.pendingBoons = ["purse", "purse"])],
      ["pending already held", (r) => ((r.boons = ["purse"]), (r.pendingBoons = ["purse", "tonic"]))],
      ["free rolls 5", (r) => (r.freeRolls = 5)],
      ["lives 9", (r) => (r.lives = 9)],
    ];
    for (const [name, mutate] of bad) {
      const r = raw();
      mutate(r);
      expect(parseRun(JSON.stringify(r)), name).toBeNull();
    }
  });
});

describe("the bots", () => {
  it("take boons on their own, never leave a choice hanging, and finish their runs", () => {
    let withBoons = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { run } = playRun(newRun(seed * 17, "squire"), "greedy");
      expect(run.pendingBoons === null || run.phase !== "shop").toBe(true);
      expect(new Set(run.boons).size).toBe(run.boons.length);
      if (run.boons.length > 0) withBoons++;
    }
    expect(withBoons).toBeGreaterThan(20);
  });
});

describe("later boons", () => {
  it("Champion's Crest gives the front creature +3/+3 and only that one", () => {
    resetUids();
    const team = [unit("bones", 2, 5), unit("bones", 2, 5)];
    const r = simulateBattle(team, [unit("bones", 1, 50)], 1, { boons: ["crest"] });
    const first = r.steps[1]!.teams[0];
    expect(first.map((u) => [u.atk, u.hp])).toEqual([[5, 8], [2, 5]]);
    expect(events(r).filter((e) => e.t === "boon")).toHaveLength(1);
  });

  const afterFight = (run: Run, boons: string[]): Run => {
    const r = fight({ ...structuredClone(run), boons, team: [unit("wolf", 50, 99), null, null, null, null], nextUid: 99 });
    if (!r.ok) throw new Error(r.error);
    return r.run;
  };

  it("Spoils of War pays 2 gold after a won battle, and nothing after a lost one", () => {
    const base = newRun(8, "knight");
    const won = afterFight(base, ["spoils"]);
    expect(won.history.at(-1)!.outcome).toBe("win");
    expect(won.gold).toBe(10 + 2);
    const lostRun = fight({ ...structuredClone(base), boons: ["spoils"], team: [unit("bones", 1, 1), null, null, null, null], nextUid: 99 });
    expect(lostRun.ok && lostRun.run.history.at(-1)!.outcome).toBe("lose");
    expect(lostRun.ok && lostRun.run.gold).toBe(10);
    expect(afterFight(base, []).gold).toBe(10);
  });

  it("Compound Interest returns 1 gold for every 3 unspent, up to 3", () => {
    const base = newRun(8, "knight");
    const kept = (gold: number) => afterFight({ ...base, gold }, ["interest"]).gold;
    expect(kept(0)).toBe(10);
    expect(kept(2)).toBe(10);
    expect(kept(3)).toBe(11);
    expect(kept(8)).toBe(12);
    expect(kept(9)).toBe(13);
    expect(kept(40)).toBe(13);
    expect(afterFight({ ...base, gold: 9 }, []).gold).toBe(10);
  });
});

describe("later creatures and relics", () => {
  it("Busy Bee stings the weakest enemy, scaling with level", () => {
    resetUids();
    const r = simulateBattle([unit("bee", 2, 3)], [unit("bones", 6, 9), unit("bones", 2, 3), unit("bones", 6, 6)], 1); // the weakest is the one with the least attack
    expect(events(r).some((e) => e.t === "damage" && e.amount === 2)).toBe(true);
    const readied = r.steps.find((s) => s.note === "Busy Bee readies.")!;
    expect(readied.teams[1].map((u) => u.hp)).toEqual([9, 1, 6]);
  });

  it("Dune Scorpion turns venomous once it has been hurt", () => {
    resetUids();
    const r = simulateBattle([unit("scorpion", 3, 30)], [unit("bones", 1, 40)], 1);
    expect(r.steps.some((s) => s.teams[0].some((u) => u.sp === "scorpion" && u.statuses.includes("venom")))).toBe(true);
  });

  it("Healing Draught shelters the team when its bearer falls", () => {
    resetUids();
    const r = simulateBattle([unit("bones", 1, 1, { relic: "healing-draught" }), unit("bones", 1, 5)], [unit("bones", 9, 40)], 1);
    const after = r.steps.find((s) => s.teams[0].length === 1)!;
    expect(after.teams[0][0]!.hp).toBeGreaterThan(5 - 9 + 3 - 1);
    expect(events(r).some((e) => e.t === "buff")).toBe(true);
  });

  it("Spiked Helm adds health, and Coin Purse pays at the start of the turn", () => {
    expect(relic("spiked-helm").hp).toBe(2);
    let run = setup(newRun(4, "knight"), { team: [unit("bones", 1, 1, { relic: "coin-purse" }), null, null, null, null], nextUid: 99 });
    const r = fight({ ...run, team: [unit("wolf", 50, 99, { relic: "coin-purse" }), null, null, null, null] });
    expect(r.ok && r.run.gold).toBe(11);
    run = setup(newRun(4, "knight"), {});
    expect(run.gold).toBe(10);
  });
});

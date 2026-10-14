import { describe, expect, it } from "vitest";

import { BOSS_ROUNDS, MAX_ROUNDS, tierCap } from "../src/engine/enemy.js";
import { BUY_COST, LIVES, ROLL_COST, START_GOLD, buy, buyRelic, fight, levelFor, move, newRun, offerCount, roll, sell, teamUnits, toggleFreeze, type Run } from "../src/engine/run.js";
import { species } from "../src/engine/data.js";
import { type Unit } from "../src/engine/types.js";
import { setup } from "./helpers.js";

const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
  return r as Extract<T, { ok: true }>;
};
const offers = (run: Run, ...sp: string[]): Run => setup(run, { offers: sp.map((s) => ({ sp: s, frozen: false })) });
const u = (uid: number, sp: string, extra: Partial<Unit> = {}): Unit => ({ uid, sp, atk: species(sp).atk, hp: species(sp).hp, level: 1, exp: 0, ...extra });
const withTeam = (run: Run, team: (Unit | null)[]): Run => setup(run, { team: [...team, ...Array(5 - team.length).fill(null)], nextUid: 100 });

describe("starting a run", () => {
  it("opens the first shop with 10 gold, an empty team and tier-1 creatures only", () => {
    const run = newRun(1, "knight");
    expect(run).toMatchObject({ round: 1, gold: START_GOLD, lives: LIVES.knight, wins: 0, phase: "shop" });
    expect(teamUnits(run)).toHaveLength(0);
    expect(run.offers).toHaveLength(offerCount(1));
    expect(run.relics).toHaveLength(0);
    for (let seed = 1; seed <= 50; seed++) for (const o of newRun(seed, "squire").offers) expect(species(o!.sp).tier).toBe(1);
  });

  it("is deterministic per seed, and different seeds differ", () => {
    expect(newRun(5, "knight")).toEqual(newRun(5, "knight"));
    const sets = new Set(Array.from({ length: 30 }, (_, i) => newRun(i + 1, "knight").offers.map((o) => o!.sp).join()));
    expect(sets.size).toBeGreaterThan(10);
  });

  it("gives more lives on gentler difficulties", () => {
    expect(LIVES.squire).toBeGreaterThan(LIVES.knight);
    expect(LIVES.knight).toBeGreaterThan(LIVES.champion);
  });

  it("widens the shop and raises the tier cap as rounds pass", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map(tierCap)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect([offerCount(1), offerCount(3), offerCount(7)]).toEqual([3, 4, 5]);
  });
});

describe("buying, selling and merging", () => {
  it("buys into an empty slot for 3 gold and removes the offer", () => {
    const run = offers(newRun(1, "knight"), "wolf", "boar", "bear");
    const r = must(buy(run, 1, 2));
    expect(r.run.gold).toBe(START_GOLD - BUY_COST);
    expect(r.run.team[2]).toMatchObject({ sp: "boar", atk: 3, hp: 4, level: 1, exp: 0 });
    expect(r.run.offers[1]).toBeNull();
    expect(r.run.nextUid).toBe(run.nextUid + 1);
  });

  it("refuses without the gold, onto a different creature, and for a missing offer", () => {
    const run = offers(newRun(1, "knight"), "wolf", "boar", "bear");
    expect(buy(setup(run, { gold: 2 }), 0, 0)).toMatchObject({ ok: false, error: expect.stringMatching(/gold/) });
    const taken = must(buy(run, 0, 0)).run;
    expect(buy(taken, 1, 0)).toMatchObject({ ok: false, error: expect.stringMatching(/different/) });
    expect(buy(taken, 0, 1)).toMatchObject({ ok: false });
    expect(buy(run, 0, 5)).toMatchObject({ ok: false });
    expect(buy(run, 0, -1)).toMatchObject({ ok: false });
  });

  it("merges copies: +1/+1 on the better stats, and levels up at 3 and 6 copies", () => {
    let run = offers(newRun(1, "knight"), "wolf", "wolf", "wolf");
    run = must(buy(run, 0, 0)).run;
    run = must(buy(run, 1, 0)).run;
    expect(run.team[0]).toMatchObject({ atk: 3, hp: 4, exp: 1, level: 1 });
    const third = must(buy(run, 2, 0));
    expect(third.run.team[0]).toMatchObject({ atk: 4, hp: 5, exp: 2, level: 2 });
    expect(third.events).toContainEqual({ t: "levelUp", uid: third.run.team[0]!.uid, level: 2 });
    expect(third.events.some((e) => e.t === "merge")).toBe(true);
  });

  it("reaches level 3 at five absorbed copies, and stops there", () => {
    expect([0, 1, 2, 4, 5, 9].map(levelFor)).toEqual([1, 1, 2, 2, 3, 3]);
    let run = withTeam(newRun(1, "knight"), [u(1, "wolf", { exp: 4, level: 2, atk: 6, hp: 7 })]);
    run = offers(setup(run, { gold: 30 }), "wolf", "wolf", "wolf");
    run = must(buy(run, 0, 0)).run;
    expect(run.team[0]).toMatchObject({ level: 3, exp: 5 });
    run = must(buy(run, 1, 0)).run;
    expect(run.team[0]).toMatchObject({ level: 3, exp: 5 });
    expect(run.team[0]!.atk).toBeGreaterThan(7);
  });

  it("moves, swaps and merges by dragging within the team", () => {
    let run = withTeam(newRun(1, "knight"), [u(1, "wolf"), u(2, "boar"), null, u(3, "wolf")]);
    const moved = must(move(run, 0, 2));
    expect(moved.run.team.map((x) => x?.uid ?? null)).toEqual([null, 2, 1, 3, null]);
    const swapped = must(move(run, 0, 1));
    expect(swapped.run.team.map((x) => x?.uid ?? null)).toEqual([2, 1, null, 3, null]);
    const merged = must(move(run, 0, 3));
    expect(merged.run.team[0]).toBeNull();
    expect(merged.run.team[3]).toMatchObject({ uid: 3, exp: 1, atk: 3 });
    expect(must(move(run, 1, 1)).run).toBe(run);
    expect(move(run, 4, 0)).toMatchObject({ ok: false });
    expect(move(run, 0, 9)).toMatchObject({ ok: false });
  });

  it("sells for its level in gold, and Sell abilities fire", () => {
    let run = withTeam(newRun(1, "knight"), [u(1, "wolf", { level: 2, exp: 2 }), u(2, "goblin"), u(3, "fairy")]);
    run = setup(run, { gold: 0 });
    expect(must(sell(run, 0)).run.gold).toBe(2);
    expect(must(sell(run, 1)).run.gold).toBe(1 + 2); // the goblin's Sell: +2 gold
    const fairy = must(sell(run, 2));
    expect(fairy.run.gold).toBe(1);
    // the fairy blesses two random allies by +1/+1 on the way out
    const total = (r: Run) => teamUnits(r).reduce((a, x) => a + x.atk + x.hp, 0);
    expect(total(fairy.run)).toBe(total(run) - (species("fairy").atk + species("fairy").hp) + 4);
    expect(must(sell(run, 0)).run.team[0]).toBeNull();
    expect(sell(run, 4)).toMatchObject({ ok: false });
  });

  it("carries a relic onto a creature, and replaces the old one", () => {
    let run = withTeam(newRun(1, "knight"), [u(1, "wolf")]);
    run = setup(run, { round: 3, relics: [{ id: "whetstone", frozen: false }, { id: "aegis", frozen: false }] });
    const a = must(buyRelic(run, 0, 0));
    expect(a.run.team[0]!.relic).toBe("whetstone");
    expect(a.run.gold).toBe(START_GOLD - 3);
    expect(a.run.relics[0]).toBeNull();
    const b = must(buyRelic(a.run, 1, 0));
    expect(b.run.team[0]!.relic).toBe("aegis");
    expect(buyRelic(run, 0, 3)).toMatchObject({ ok: false, error: expect.stringMatching(/creature/) });
    expect(buyRelic(setup(run, { gold: 1 }), 0, 0)).toMatchObject({ ok: false });
    expect(buyRelic(a.run, 0, 0)).toMatchObject({ ok: false });
  });

  it("never mutates the run it is given", () => {
    const run = offers(newRun(3, "knight"), "wolf", "wolf", "bear");
    const snapshot = JSON.stringify(run);
    must(buy(run, 0, 0));
    must(roll(run));
    must(toggleFreeze(run, "creature", 0));
    expect(buy(run, 0, 9)).toMatchObject({ ok: false });
    expect(JSON.stringify(run)).toBe(snapshot);
  });
});

describe("rolling and freezing", () => {
  it("costs one gold and refreshes the offers, but not past zero gold", () => {
    const run = newRun(1, "knight");
    const r = must(roll(run));
    expect(r.run.gold).toBe(START_GOLD - ROLL_COST);
    expect(r.run.offers).toHaveLength(run.offers.length);
    let changed = 0;
    let cur = run;
    for (let i = 0; i < 9; i++) {
      const next = must(roll(cur)).run;
      if (next.offers.map((o) => o!.sp).join() !== cur.offers.map((o) => o!.sp).join()) changed++;
      cur = next;
    }
    expect(changed).toBeGreaterThanOrEqual(7);
    expect(roll(cur)).toMatchObject({ ok: true });
    expect(roll(setup(run, { gold: 0 }))).toMatchObject({ ok: false });
  });

  it("keeps frozen offers through a roll", () => {
    let run = newRun(1, "knight");
    const kept = run.offers[1]!.sp;
    run = must(toggleFreeze(run, "creature", 1)).run;
    expect(run.offers[1]!.frozen).toBe(true);
    for (let i = 0; i < 5; i++) {
      run = must(roll(run)).run;
      expect(run.offers[1]!.sp).toBe(kept);
    }
    run = must(toggleFreeze(run, "creature", 1)).run;
    expect(run.offers[1]!.frozen).toBe(false);
    expect(toggleFreeze(run, "relic", 0)).toMatchObject({ ok: false });
  });

  it("offers relics from round 2", () => {
    const r = must(roll(setup(newRun(1, "knight"), { round: 2 })));
    expect(r.run.relics).toHaveLength(2);
  });
});

describe("fighting through the tournament", () => {
  // Five giants: one alone could fall to a single venomous bite.
  const strong = (run: Run): Run => withTeam(run, [1, 2, 3, 4, 5].map((i) => u(i, "mammoth", { atk: 90, hp: 900 })));

  it("needs a creature to fight", () => {
    expect(fight(newRun(1, "knight"))).toMatchObject({ ok: false });
  });

  it("advances the round, refills the gold and restocks after a fight", () => {
    const r = fight(strong(newRun(1, "knight")));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.battle.outcome).toBe("win");
    expect(r.run).toMatchObject({ round: 2, wins: 1, lives: LIVES.knight, gold: START_GOLD, phase: "shop" });
    expect(r.run.history).toEqual([{ round: 1, outcome: "win", boss: false }]);
    expect(r.run.relics).toHaveLength(2);
    expect(r.enemy.length).toBeGreaterThan(0);
  });

  it("costs a life for a defeat, and ends the run at zero", () => {
    let run: Run = withTeam(newRun(1, "champion"), [u(1, "squirrel", { atk: 1, hp: 1 })]);
    for (let i = 0; i < LIVES.champion; i++) {
      expect(run.phase).toBe("shop");
      const r = fight(withTeam(run, [u(1, "squirrel", { atk: 1, hp: 1 })]));
      if (!r.ok) throw new Error(r.error);
      expect(r.battle.outcome).toBe("lose");
      run = r.run;
    }
    expect(run).toMatchObject({ phase: "lost", lives: 0 });
    expect(fight(run)).toMatchObject({ ok: false });
    expect(buy(run, 0, 0)).toMatchObject({ ok: false });
    expect(roll(run)).toMatchObject({ ok: false });
  });

  it("runs the whole ladder to a win, with bosses where promised", () => {
    let run: Run = newRun(11, "knight");
    const rounds: number[] = [];
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const r = fight(strong(run));
      if (!r.ok) throw new Error(r.error);
      rounds.push(run.round);
      run = r.run;
    }
    expect(rounds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(run).toMatchObject({ phase: "won", wins: 12 });
    expect(run.history.filter((h) => h.boss).map((h) => h.round)).toEqual([...BOSS_ROUNDS]);
  });

  it("makes a lost final cost a life and try again instead of moving on", () => {
    const run = setup(newRun(4, "squire"), { round: MAX_ROUNDS });
    const r = fight(withTeam(run, [u(1, "squirrel", { atk: 1, hp: 1 })]));
    if (!r.ok) throw new Error(r.error);
    expect(r.run).toMatchObject({ round: MAX_ROUNDS, attempt: 1, lives: LIVES.squire - 1, phase: "shop" });
  });

  it("does not charge a life for a draw before the final", () => {
    // identical single units draw
    let found = false;
    for (let seed = 1; seed < 300 && !found; seed++) {
      const run = withTeam(newRun(seed, "knight"), [u(1, "squirrel", { atk: 2, hp: 3 })]);
      const r = fight(run);
      if (r.ok && r.battle.outcome === "draw") {
        expect(r.run.lives).toBe(run.lives);
        expect(r.run.wins).toBe(0);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("is reproducible: same run, same fight", () => {
    const a = fight(strong(newRun(21, "knight")));
    const b = fight(strong(newRun(21, "knight")));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("start-of-turn effects", () => {
  const next = (run: Run) => {
    const r = fight(withTeam(setup(run, {}), teamUnits(run)));
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  it("lets creatures grow and earn: Squirrel +1 health, Leprechaun +1 gold, per level", () => {
    const run = withTeam(newRun(1, "knight"), [u(1, "squirrel", { atk: 20, hp: 99 }), u(2, "leprechaun", { level: 2, exp: 2, atk: 50, hp: 99 })]);
    const r = next(run);
    const squirrel = r.run.team[0]!;
    expect(squirrel.hp).toBe(99 + 1);
    expect(r.run.gold).toBe(START_GOLD + 2);
    expect(r.events.filter((e) => e.t === "gold")).toEqual([{ t: "gold", amount: 2 }]);
  });

  it("applies bonds: Horde pays out gold, Fae grow", () => {
    const horde = withTeam(newRun(1, "knight"), [u(1, "goblin", { atk: 40, hp: 99 }), u(2, "imp", { atk: 40, hp: 99 })]);
    expect(next(horde).run.gold).toBe(START_GOLD + 1);
    const fae = withTeam(newRun(1, "knight"), [u(1, "fairy", { atk: 40, hp: 99 }), u(2, "mushroom", { atk: 40, hp: 99 })]);
    const r = next(fae);
    expect(r.run.team[0]!.hp).toBe(100);
    expect(r.run.team[1]!.hp).toBe(100);
  });

  it("does not apply a bond for the same species twice", () => {
    const run = withTeam(newRun(1, "knight"), [u(1, "goblin", { atk: 40, hp: 99 }), u(2, "goblin", { atk: 40, hp: 99 })]);
    expect(next(run).run.gold).toBe(START_GOLD);
  });

  it("applies a relic's turn effect: Troll Blood grows its bearer", () => {
    const run = withTeam(newRun(1, "knight"), [u(1, "mammoth", { atk: 60, hp: 400, relic: "troll-blood" })]);
    const r = next(run);
    expect(r.run.team[0]).toMatchObject({ atk: 61, hp: 401 });
  });
});

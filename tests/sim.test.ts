import { describe, expect, it } from "vitest";

import { MAX_ROUNDS } from "../src/engine/enemy.js";
import { Rng } from "../src/engine/rng.js";
import { buy, buyRelic, fight, move, newRun, roll, sell, teamUnits, toggleFreeze, type Run } from "../src/engine/run.js";
import { parseRun, serializeRun } from "../src/engine/save.js";
import { DIFFICULTIES, SLOTS } from "../src/engine/types.js";
import { playRun } from "../src/sim/bots.js";

function invariants(run: Run): void {
  expect(run.gold).toBeGreaterThanOrEqual(0);
  expect(run.team).toHaveLength(SLOTS);
  expect(run.lives).toBeGreaterThanOrEqual(0);
  expect(run.round).toBeGreaterThanOrEqual(1);
  expect(run.round).toBeLessThanOrEqual(MAX_ROUNDS);
  const uids = teamUnits(run).map((u) => u.uid);
  expect(new Set(uids).size).toBe(uids.length);
  for (const u of teamUnits(run)) {
    expect(u.atk).toBeGreaterThanOrEqual(0);
    expect(u.hp).toBeGreaterThanOrEqual(1);
    expect(u.uid).toBeLessThan(run.nextUid);
    expect(u.level).toBeGreaterThanOrEqual(1);
    expect(u.level).toBeLessThanOrEqual(3);
  }
}

describe("bots play full runs", () => {
  it("finish every run, always in a consistent state", () => {
    for (const difficulty of DIFFICULTIES) for (let seed = 1; seed <= 25; seed++) {
      const { run } = playRun(newRun(seed * 31, difficulty), "greedy");
      expect(["won", "lost"]).toContain(run.phase);
      invariants(run);
      if (run.phase === "won") expect(run.lives).toBeGreaterThan(0);
      if (run.phase === "lost") expect(run.lives).toBe(0);
    }
  });

  it("are reproducible", () => {
    expect(JSON.stringify(playRun(newRun(5, "knight"), "greedy").run)).toBe(JSON.stringify(playRun(newRun(5, "knight"), "greedy").run));
  });

  it("survive a save and load in the middle of a run", () => {
    let run = newRun(9, "knight");
    for (let i = 0; i < 5 && run.phase === "shop"; i++) {
      const played = playRun({ ...run }, "greedy").run;
      void played;
      const r = fight({ ...run, team: [{ uid: 1, sp: "mammoth", atk: 50, hp: 300, level: 1, exp: 0 }, null, null, null, null], nextUid: 2 });
      if (!r.ok) throw new Error(r.error);
      run = parseRun(serializeRun(r.run))!;
      expect(run).toEqual(r.run);
    }
  });
});

describe("random command fuzzing", () => {
  it("never breaks the invariants, whatever order commands arrive in", () => {
    const rng = new Rng(4242);
    for (let game = 0; game < 40; game++) {
      let run = newRun(rng.int(1 << 30), rng.pick(DIFFICULTIES));
      for (let step = 0; step < 150 && run.phase === "shop"; step++) {
        const pick = rng.int(8);
        let result: { ok: boolean; run?: Run } | undefined;
        if (pick === 0) result = roll(run);
        else if (pick === 1) result = buy(run, rng.int(6) - 1, rng.int(7) - 1);
        else if (pick === 2) result = sell(run, rng.int(7) - 1);
        else if (pick === 3) result = move(run, rng.int(7) - 1, rng.int(7) - 1);
        else if (pick === 4) result = buyRelic(run, rng.int(4) - 1, rng.int(7) - 1);
        else if (pick === 5) result = toggleFreeze(run, rng.chance(0.5) ? "creature" : "relic", rng.int(6) - 1);
        else {
          const f = fight(run);
          if (f.ok) run = f.run;
        }
        if (result?.ok && result.run) run = result.run;
        invariants(run);
      }
    }
  });
});

describe("balance bands (guards against accidental power creep)", () => {
  // A decent bot, not a strong player. Wide bands: the point is to catch big swings, not to pin exact numbers.
  const winRate = (difficulty: (typeof DIFFICULTIES)[number], n: number) => {
    let wins = 0;
    for (let seed = 1; seed <= n; seed++) if (playRun(newRun(seed * 7919, difficulty), "greedy").log.won) wins++;
    return wins / n;
  };

  it("keeps the three difficulties in order and in a sensible range", () => {
    const squire = winRate("squire", 300);
    const knight = winRate("knight", 300);
    const champion = winRate("champion", 300);
    expect(squire).toBeGreaterThan(0.3);
    expect(squire).toBeLessThan(0.75);
    expect(knight).toBeGreaterThan(0.07);
    expect(knight).toBeLessThan(0.3);
    expect(champion).toBeLessThan(0.1);
    expect(squire).toBeGreaterThan(knight);
    expect(knight).toBeGreaterThan(champion);
  });

  it("rewards playing well: a random player does far worse than the bot", () => {
    let randomWins = 0;
    let reached = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { run, log } = playRun(newRun(seed, "squire"), "random");
      if (log.won) randomWins++;
      reached += run.round;
    }
    expect(randomWins).toBe(0);
    expect(reached / 60).toBeLessThan(9);
  });

  it("is winnable on the first fights: the greedy bot almost never loses round 1-3 on Squire", () => {
    let losses = 0;
    let fights = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const f of playRun(newRun(seed * 13, "squire"), "greedy").log.fights.filter((x) => x.round <= 3)) {
        fights++;
        if (f.outcome === "lose") losses++;
      }
    }
    expect(losses / fights).toBeLessThan(0.1);
  });
});

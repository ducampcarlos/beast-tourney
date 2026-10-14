import { describe, expect, it } from "vitest";

import { BOSS_ROUNDS, DIFFICULTY_MULT, MAX_ROUNDS, POWER, bossName, dominantFaction, enemyTeam, targetPower, tierCap } from "../src/engine/enemy.js";
import { relic, species } from "../src/engine/data.js";
import { DIFFICULTIES, FACTIONS, type Unit } from "../src/engine/types.js";

// What the battle will actually see: base stats plus whatever the relic adds.
const power = (team: Unit[]) => team.reduce((a, u) => a + u.atk + u.hp + (u.relic ? (relic(u.relic).atk ?? 0) + (relic(u.relic).hp ?? 0) : 0), 0);
const rounds = Array.from({ length: MAX_ROUNDS }, (_, i) => i + 1);

describe("enemy teams", () => {
  it("are reproducible from the seed, and vary between seeds in ordinary rounds", () => {
    expect(enemyTeam(7, 5, 0, "knight")).toEqual(enemyTeam(7, 5, 0, "knight"));
    const variants = new Set(Array.from({ length: 30 }, (_, s) => JSON.stringify(enemyTeam(s, 6, 0, "knight"))));
    expect(variants.size).toBeGreaterThan(20);
  });

  it("grow from two to five creatures", () => {
    expect(enemyTeam(1, 1, 0, "knight")).toHaveLength(2);
    expect(enemyTeam(1, 12, 0, "knight")).toHaveLength(5);
    for (const r of rounds) {
      const n = enemyTeam(3, r, 0, "knight").length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("land close to the target power in every round and on every difficulty", () => {
    for (const d of DIFFICULTIES) for (const r of rounds) for (let seed = 1; seed <= 25; seed++) {
      const got = power(enemyTeam(seed, r, 0, d));
      const want = targetPower(r, d);
      // rounding each stat moves the total by at most 1 per stat
      expect(Math.abs(got - want), `${d} R${r} seed ${seed}: ${got} vs ${want}`).toBeLessThanOrEqual(Math.max(8, want * 0.12));
    }
  });

  it("get harder with difficulty, and rise across the ladder", () => {
    for (const r of rounds) {
      expect(targetPower(r, "squire")).toBeLessThan(targetPower(r, "knight"));
      expect(targetPower(r, "knight")).toBeLessThan(targetPower(r, "champion"));
    }
    expect(DIFFICULTY_MULT.knight).toBe(1);
    // bosses stand out from the rounds around them
    for (const b of BOSS_ROUNDS) if (b < MAX_ROUNDS) expect(POWER[b - 1]!).toBeGreaterThan(POWER[b]!);
    expect(POWER[MAX_ROUNDS - 1]!).toBe(Math.max(...POWER));
  });

  it("only use creatures the shop could have offered by then, plus the bosses", () => {
    for (const r of rounds) {
      if (BOSS_ROUNDS.includes(r)) continue;
      for (let seed = 1; seed <= 30; seed++) for (const u of enemyTeam(seed, r, 0, "knight")) expect(species(u.sp).tier, `${u.sp} in R${r}`).toBeLessThanOrEqual(tierCap(r));
    }
  });

  it("have valid stats, levels and unique ids", () => {
    for (const r of rounds) for (let seed = 1; seed <= 20; seed++) {
      const team = enemyTeam(seed, r, 0, "champion");
      expect(new Set(team.map((u) => u.uid)).size).toBe(team.length);
      for (const u of team) {
        expect(u.atk).toBeGreaterThanOrEqual(1);
        expect(u.hp).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(u.atk) && Number.isInteger(u.hp)).toBe(true);
        expect([1, 2, 3]).toContain(u.level);
      }
    }
  });

  it("show enemy levels and relics only later in the run", () => {
    const early = Array.from({ length: 40 }, (_, s) => enemyTeam(s, 3, 0, "knight")).flat();
    expect(early.every((u) => u.level === 1 && !u.relic)).toBe(true);
    const late = Array.from({ length: 40 }, (_, s) => enemyTeam(s, 11, 0, "knight")).flat();
    expect(late.some((u) => u.level >= 2)).toBe(true);
    expect(late.some((u) => u.relic)).toBe(true);
  });
});

describe("bosses", () => {
  it("appear on rounds 4, 8 and 12 with their own names", () => {
    expect(BOSS_ROUNDS).toEqual([4, 8, 12]);
    expect(bossName(4)).toBe("Goblin King Grakk");
    expect(bossName(8)).toBe("Lich Lord Morvane");
    expect(bossName(12)).toBe("Ignis, the Elder Dragon");
    expect(bossName(5)).toBeUndefined();
    for (const b of BOSS_ROUNDS) expect(enemyTeam(1, b, 0, "knight").some((u) => species(u.sp).tier === 6)).toBe(true);
  });

  it("are the same cast for every seed, and the boss is the strongest unit", () => {
    for (const b of BOSS_ROUNDS) {
      const cast = (seed: number) => enemyTeam(seed, b, 0, "knight").map((u) => u.sp).join();
      expect(cast(1)).toBe(cast(99));
      const team = enemyTeam(1, b, 0, "knight");
      const boss = team.find((u) => species(u.sp).tier === 6)!;
      expect(boss.hp).toBe(Math.max(...team.map((u) => u.hp)));
    }
  });

  it("never light up a 4-bond on their own", () => {
    for (const b of BOSS_ROUNDS) {
      const team = enemyTeam(1, b, 0, "knight");
      for (const f of FACTIONS) expect(new Set(team.filter((u) => species(u.sp).faction === f).map((u) => u.sp)).size, `${b} ${f}`).toBeLessThan(4);
    }
  });

  it("have room for their summons", () => {
    expect(enemyTeam(1, 8, 0, "knight").length).toBeLessThan(5); // Lich Lord raises bones at battle start
  });
});

describe("preview", () => {
  it("names the faction an enemy team leans on", () => {
    const team = enemyTeam(5, 9, 0, "knight");
    const dom = dominantFaction(team);
    expect(dom.count).toBeGreaterThanOrEqual(1);
    expect(dom.name.length).toBeGreaterThan(2);
    expect(FACTIONS).toContain(dom.faction);
  });
});

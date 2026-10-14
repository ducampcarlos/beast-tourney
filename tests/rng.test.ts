import { describe, expect, it } from "vitest";

import { Rng, hashSeed } from "../src/engine/rng.js";

describe("rng", () => {
  it("is deterministic for a seed and different across seeds", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it("stays within range and covers it", () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = rng.int(6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      seen.add(n);
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    expect(seen.size).toBe(6);
  });

  it("can be saved and restored through its state", () => {
    const a = new Rng(99);
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });

  it("shuffles into a permutation without touching the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = new Rng(5).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort()).toEqual(input);
    expect(out).not.toEqual(input);
  });

  it("picks from lists and refuses an empty one", () => {
    expect([10, 20, 30]).toContain(new Rng(3).pick([10, 20, 30]));
    expect(() => new Rng(3).pick([])).toThrow();
  });

  it("hashes parts into different seeds", () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3));
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(3, 2, 1));
    expect(hashSeed(1)).not.toBe(hashSeed(2));
  });
});

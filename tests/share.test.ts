import { describe, expect, it } from "vitest";

import { newRun } from "../src/engine/run.js";
import { roundTrail, shareText } from "../src/engine/share.js";
import { setup } from "./helpers.js";

describe("share text", () => {
  const history = [
    { round: 1, outcome: "win" as const, boss: false },
    { round: 2, outcome: "draw" as const, boss: false },
    { round: 3, outcome: "lose" as const, boss: false },
    { round: 4, outcome: "win" as const, boss: true },
  ];

  it("draws one square per round", () => {
    expect(roundTrail(history)).toBe("🟩🟨🟥🟦");
    expect(roundTrail([])).toBe("");
  });

  it("states the verdict, the seed and the trail", () => {
    const run = setup(newRun(42, "knight"), { history, round: 5, lives: 2, phase: "lost" });
    const lines = shareText(run).split("\n");
    expect(lines[0]).toBe("Beast Tourney - knight, seed 42");
    expect(lines[1]).toBe("Out in round 5 - 2 rounds won, 2 lives left");
    expect(lines[2]).toBe("🟩🟨🟥🟦");
  });

  it("calls a winner champion and an endless run by its depth", () => {
    const won = setup(newRun(1, "squire"), { history, phase: "won" });
    expect(shareText(won)).toContain("Champion - 2 rounds won");
    const deep = setup(newRun(1, "squire"), { history, phase: "lost", endless: true, round: 17 });
    expect(shareText(deep)).toContain("Endless depth 17");
  });
});

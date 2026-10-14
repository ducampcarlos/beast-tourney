import { describe, expect, it } from "vitest";

import { fight, newRun, buy, type Run } from "../src/engine/run.js";
import { SAVE_VERSION, parseRun, serializeRun } from "../src/engine/save.js";
import { setup } from "./helpers.js";

const played = (): Run => {
  let run = setup(newRun(77, "knight"), { offers: [{ sp: "wolf", frozen: false }, { sp: "boar", frozen: true }, { sp: "bear", frozen: false }] });
  const b = buy(run, 0, 1);
  if (b.ok) run = b.run;
  const r = fight(run);
  return r.ok ? r.run : run;
};

describe("saving", () => {
  it("round-trips a run exactly", () => {
    const run = played();
    expect(parseRun(serializeRun(run))).toEqual(run);
    expect(parseRun(serializeRun(newRun(1, "squire")))).toEqual(newRun(1, "squire"));
  });

  it("reads a restored run the same as the original", () => {
    const run = played();
    const a = fight(run);
    const b = fight(parseRun(serializeRun(run))!);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("refuses text that is not a save", () => {
    for (const text of ["", "nope", "null", "[]", "42", '"x"', "{}", "{\"v\":1}", "{\"v\":2}"]) expect(parseRun(text), text).toBeNull();
    expect(SAVE_VERSION).toBe(1);
  });

  const tamper = (mutate: (r: Record<string, any>) => void): string | null => {
    const raw = JSON.parse(serializeRun(played()));
    mutate(raw);
    return parseRun(JSON.stringify(raw)) === null ? null : "accepted";
  };

  it("refuses impossible values", () => {
    const cases: Array<[string, (r: Record<string, any>) => void]> = [
      ["unknown creature", (r) => (r.team[1].sp = "dragon-god")],
      ["boss in the team", (r) => (r.team[1].sp = "elder-dragon")],
      ["token in the team", (r) => (r.team[1].sp = "bones")],
      ["unknown relic", (r) => (r.team[1].relic = "excalibur")],
      ["negative attack", (r) => (r.team[1].atk = -1)],
      ["zero health", (r) => (r.team[1].hp = 0)],
      ["huge stats", (r) => (r.team[1].atk = 1e9)],
      ["fractional stats", (r) => (r.team[1].atk = 1.5)],
      ["level 9", (r) => (r.team[1].level = 9)],
      ["string stats", (r) => (r.team[1].hp = "99")],
      ["duplicate uid", (r) => (r.team[2] = { ...r.team[1] })],
      ["uid from the future", (r) => (r.team[1].uid = r.nextUid + 5)],
      ["six slots", (r) => r.team.push(null)],
      ["three slots", (r) => (r.team = r.team.slice(0, 3))],
      ["no gold field", (r) => delete r.gold],
      ["negative gold", (r) => (r.gold = -4)],
      ["round 0", (r) => (r.round = 0)],
      ["round 13", (r) => (r.round = 13)],
      ["too many lives", (r) => (r.lives = 99)],
      ["unknown difficulty", (r) => (r.difficulty = "nightmare")],
      ["unknown phase", (r) => (r.phase = "paused")],
      ["bad offer", (r) => (r.offers[0] = { sp: "bones", frozen: false })],
      ["offer not an object", (r) => (r.offers[0] = "wolf")],
      ["too many offers", (r) => (r.offers = Array(9).fill(null))],
      ["bad relic offer", (r) => (r.relics = [{ id: "nope", frozen: false }])],
      ["bad history", (r) => (r.history = [{ round: 1, outcome: "tie", boss: false }])],
      ["history not a list", (r) => (r.history = {})],
      ["seed out of range", (r) => (r.seed = -1)],
    ];
    for (const [name, mutate] of cases) expect(tamper(mutate), name).toBeNull();
  });

  it("ignores unknown fields and cannot be used to pollute prototypes", () => {
    const raw = JSON.parse(serializeRun(newRun(1, "knight")));
    raw.extra = { evil: true };
    const parsed = parseRun(JSON.stringify({ ...raw, ["__proto__"]: { polluted: 1 } }).replace('"__proto__"', '"__proto__"'));
    expect(parsed).not.toBeNull();
    expect((parsed as unknown as Record<string, unknown>).extra).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

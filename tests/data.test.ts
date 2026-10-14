import { describe, expect, it } from "vitest";

import { BOSS_SPECIES, FACTION_DEFS, RELICS, SPECIES_LIST, TOKENS, relic, species } from "../src/engine/data.js";
import { describeAbility, describeEffect } from "../src/engine/text.js";
import { type Ability, FACTIONS, type Effect } from "../src/engine/types.js";

const ALL = [...SPECIES_LIST, ...TOKENS, ...BOSS_SPECIES];
const effectsOf = (a: Ability | undefined): Effect[] => a?.effects ?? [];

describe("content integrity", () => {
  it("has unique ids and valid sprite frames (the sheet has 180)", () => {
    expect(new Set(ALL.map((s) => s.id)).size).toBe(ALL.length);
    for (const s of ALL) for (const f of s.frames) expect(Number.isInteger(f) && f >= 0 && f < 180, `${s.id} frame ${f}`).toBe(true);
  });

  it("has the 7 factions, each with creatures across the tiers", () => {
    expect(FACTIONS).toHaveLength(7);
    for (const f of FACTIONS) {
      const list = SPECIES_LIST.filter((s) => s.faction === f);
      expect(list.length, f).toBeGreaterThanOrEqual(6);
      expect(new Set(list.map((s) => s.tier)).size, `${f} tiers`).toBeGreaterThanOrEqual(5);
      expect(FACTION_DEFS[f].bonds[0].need).toBeLessThan(FACTION_DEFS[f].bonds[1].need);
    }
    expect(SPECIES_LIST.length).toBeGreaterThanOrEqual(55);
  });

  it("keeps shop creatures in tiers 1-5 with sane stats, and gives every one an ability", () => {
    for (const s of SPECIES_LIST) {
      expect(s.tier, s.id).toBeGreaterThanOrEqual(1);
      expect(s.tier, s.id).toBeLessThanOrEqual(5);
      expect(s.atk, s.id).toBeGreaterThan(0);
      expect(s.hp, s.id).toBeGreaterThan(0);
      expect(s.ability, `${s.id} has no ability`).toBeDefined();
      expect(s.name.length).toBeGreaterThan(2);
    }
  });

  it("gets stronger with the tier on average", () => {
    const avg = (t: number) => {
      const l = SPECIES_LIST.filter((s) => s.tier === t);
      return l.reduce((a, s) => a + s.atk + s.hp, 0) / l.length;
    };
    for (let t = 1; t < 5; t++) expect(avg(t + 1), `tier ${t + 1}`).toBeGreaterThan(avg(t));
  });

  it("only summons species that exist and never gives summons an ability to chain", () => {
    for (const s of ALL) {
      for (const e of effectsOf(s.ability)) if (e.kind === "summon") expect(species(e.id).ability, `${s.id} summons ${e.id}`).toBeUndefined();
    }
    for (const r of RELICS) for (const e of effectsOf(r.ability)) if (e.kind === "summon") expect(species(e.id).ability).toBeUndefined();
  });

  it("uses shop triggers only with effects that work in the shop, and battle triggers only with effects that work in battle", () => {
    const check = (id: string, a: Ability | undefined) => {
      if (!a) return;
      const shop = a.trigger === "sell" || a.trigger === "turnStart";
      for (const e of a.effects) {
        if (shop) expect(["buff", "gold"], `${id}: ${a.trigger} + ${e.kind} does nothing`).toContain(e.kind);
        else expect(e.kind, `${id}: gold in battle does nothing`).not.toBe("gold");
        if (e.kind === "revive") expect(a.trigger, `${id}: revive belongs to faint`).toBe("faint");
      }
    };
    for (const s of ALL) check(s.id, s.ability);
    for (const r of RELICS) check(r.id, r.ability);
  });

  it("has valid relics", () => {
    expect(new Set(RELICS.map((r) => r.id)).size).toBe(RELICS.length);
    for (const r of RELICS) {
      expect(r.icon).toBeGreaterThanOrEqual(0);
      expect(r.icon).toBeLessThan(132);
      expect(r.cost).toBeGreaterThanOrEqual(3);
      expect(r.cost).toBeLessThanOrEqual(5);
      expect(r.atk || r.hp || r.status || r.ability, r.id).toBeTruthy();
      expect(relic(r.id)).toBe(r);
    }
    expect(() => relic("nope")).toThrow();
    expect(() => species("nope")).toThrow();
  });

  it("makes every bond tier carry some effect and some text", () => {
    for (const f of FACTIONS) for (const b of FACTION_DEFS[f].bonds) {
      expect(b.text.length).toBeGreaterThan(10);
      expect(Boolean(b.battle?.length || b.turn?.length || b.revive), `${f} ${b.need}`).toBe(true);
    }
  });
});

describe("ability text", () => {
  it("describes every ability and relic without gaps", () => {
    for (const s of SPECIES_LIST) for (const level of [1, 2, 3]) {
      const text = describeAbility(s.ability!, level, s.faction);
      expect(text, s.id).not.toContain("its faction");
      expect(text, s.id).not.toMatch(/undefined|NaN|\[object/);
      expect(text.endsWith("."), s.id).toBe(true);
    }
    for (const s of BOSS_SPECIES) expect(describeAbility(s.ability!)).toMatch(/:/);
  });

  it("scales numbers with the level and reads naturally", () => {
    const ranger = species("ranger").ability!;
    expect(describeAbility(ranger, 1)).toBe("Battle start: Deal 2 damage to a random enemy.");
    expect(describeAbility(ranger, 3)).toBe("Battle start: Deal 6 damage to a random enemy.");
    expect(describeAbility(species("bear").ability!, 2)).toBe("Faint: Give all allies +2/+2.");
    expect(describeAbility(species("viper").ability!)).toBe("Battle start: Give itself venom.");
    expect(describeAbility(species("wizard").ability!)).toBe("Battle start: Give 2 random allies +2 attack.");
    expect(describeAbility(species("mammoth").ability!, 1, "wildkin")).toBe("Battle start: Give all Wildkin +2/+2, then give itself a barrier.");
    expect(describeEffect({ kind: "revive", pct: 0.5 }, 1)).toBe("return once with 50% of its stats");
    expect(describeAbility(species("lich").ability!, 2)).toBe("Ally faints: Summon a Pile of Bones (10/10).");
  });
});

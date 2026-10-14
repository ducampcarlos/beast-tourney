import { beforeEach, describe, expect, it } from "vitest";

import { MAX_CLASHES, simulateBattle } from "../src/engine/battle.js";
import { species } from "../src/engine/data.js";
import { Rng } from "../src/engine/rng.js";
import { SPECIES_LIST, RELICS } from "../src/engine/data.js";
import { events, fight, foe, resetUids, unit } from "./helpers.js";

beforeEach(resetUids);

const finalHp = (r: ReturnType<typeof fight>, side: 0 | 1) => r.steps.at(-1)!.teams[side].map((u) => `${u.sp}:${u.atk}/${u.hp}`);

describe("the clash", () => {
  it("trades blows at the same time, so equal fighters draw", () => {
    const r = fight([unit("bones", 3, 3)], [unit("bones", 3, 3)]);
    expect(r.outcome).toBe("draw");
    expect(r.survivors).toEqual([0, 0]);
    expect(r.clashes).toBe(1);
  });

  it("lets the survivor carry its damage into the next clash", () => {
    const r = fight([unit("bones", 3, 7)], [unit("bones", 2, 3), unit("bones", 2, 3)]);
    expect(r.outcome).toBe("win");
    // clash 1: takes 2 (5 left); clash 2: takes 2 (3 left)
    expect(finalHp(r, 0)).toEqual(["bones:3/3"]);
  });

  it("fights front against front and closes the line", () => {
    const mine = [unit("bones", 5, 1), unit("bones", 1, 9)];
    const theirs = [unit("bones", 1, 5), unit("bones", 1, 5)];
    const clashes = events(fight(mine, theirs)).filter((e) => e.t === "clash");
    expect(clashes[0]).toMatchObject({ a: mine[0]!.uid, b: foe(theirs[0]!) });
    // the front pair trades (5 dmg kills the enemy front, 1 dmg kills ours); then the seconds meet
    expect(clashes[1]).toMatchObject({ a: mine[1]!.uid, b: foe(theirs[1]!) });
  });

  it("wins, loses and draws by what is left standing", () => {
    expect(fight([unit("bones", 9, 9)], [unit("bones", 1, 1)]).outcome).toBe("win");
    expect(fight([unit("bones", 1, 1)], [unit("bones", 9, 9)]).outcome).toBe("lose");
    expect(fight([], [unit("bones", 1, 1)]).outcome).toBe("lose");
    expect(fight([unit("bones", 1, 1)], []).outcome).toBe("win");
    expect(fight([], []).outcome).toBe("draw");
  });

  it("ends a stalemate after the clash limit and judges on what is left", () => {
    const weak = fight([unit("bones", 0, 5)], [unit("bones", 0, 4)]);
    expect(weak.clashes).toBe(MAX_CLASHES);
    expect(weak.outcome).toBe("win");
    expect(fight([unit("bones", 0, 4)], [unit("bones", 0, 5)]).outcome).toBe("lose");
    expect(fight([unit("bones", 0, 5)], [unit("bones", 0, 5)]).outcome).toBe("draw");
  });

  it("ignores more than five units per side", () => {
    const six = Array.from({ length: 6 }, () => unit("bones", 1, 1));
    expect(fight(six, [unit("bones", 1, 100)]).steps[0]!.teams[0]).toHaveLength(5);
  });
});

describe("statuses", () => {
  it("a barrier absorbs one hit completely, then breaks", () => {
    const run = (relic?: string) => {
      const holder = unit("bones", 2, 4, { relic });
      const r = fight([holder], [unit("bones", 3, 30)]);
      return { r, taken: events(r).filter((e) => e.t === "damage" && e.uid === holder.uid).map((e) => (e as { amount: number }).amount) };
    };
    const plain = run();
    const shielded = run("aegis");
    expect(events(shielded.r).filter((e) => e.t === "barrier")).toHaveLength(1);
    expect(plain.taken).toEqual([3, 3]); // 4 health: dead on the second hit
    expect(shielded.taken).toEqual([3, 3]); // the first hit did nothing, so it survives one clash longer
    expect(shielded.r.clashes).toBe(plain.r.clashes + 1);
  });

  it("a barrier does not stop the attacker taking damage", () => {
    const foeUnit = unit("bones", 3, 10);
    const r = fight([unit("bones", 4, 4, { relic: "aegis" })], [foeUnit]);
    expect(events(r).find((e) => e.t === "damage" && e.uid === foe(foeUnit))).toMatchObject({ amount: 4 });
  });

  it("venom kills whatever it damages, but not through a barrier", () => {
    const venom = fight([unit("bones", 1, 3, { relic: "viper-draught" })], [unit("bones", 1, 50)]);
    expect(events(venom).some((e) => e.t === "venom")).toBe(true);
    expect(venom.survivors[1]).toBe(0);
    const blocked = events(fight([unit("bones", 1, 9, { relic: "viper-draught" })], [unit("bones", 1, 50, { relic: "aegis" })]));
    const barrier = blocked.findIndex((e) => e.t === "barrier");
    const lethal = blocked.findIndex((e) => e.t === "venom");
    expect(barrier).toBeGreaterThanOrEqual(0);
    expect(lethal).toBeGreaterThan(barrier); // the first bite is swallowed by the barrier; only the next one is lethal
  });

  it("venom is only for attacks, not for ability damage", () => {
    const archer = unit("ranger", 1, 5, { relic: "viper-draught" });
    const r = fight([archer], [unit("bones", 1, 50), unit("bones", 1, 50)]);
    const arrow = events(r).find((e) => e.t === "damage" && e.src === archer.uid && e.amount === 2);
    expect(arrow).toBeDefined(); // the arrow hurt but did not kill a 50-health target
    expect(r.steps[1]!.teams[1].every((u) => u.hp > 0)).toBe(true);
  });
});

describe("abilities", () => {
  it("battle start abilities fire before the first clash, in order of attack", () => {
    const r = fight([unit("ranger", 2, 5)], [unit("bones", 1, 9)]);
    const ev = events(r);
    expect(ev.findIndex((e) => e.t === "trigger")).toBeLessThan(ev.findIndex((e) => e.t === "clash"));
  });

  it("hits land on random enemies: different seeds pick differently, the same seed picks the same", () => {
    const target = (seed: number) => {
      resetUids();
      const archer = unit("ranger", 1, 5);
      const r = fight([archer], [unit("bones", 1, 9), unit("sprout", 1, 9), unit("wisp", 1, 9)], seed);
      return (events(r).find((e) => e.t === "damage" && e.amount === 2 && e.src === archer.uid) as { uid: number }).uid;
    };
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) seen.add(target(seed));
    expect(seen.size).toBe(3);
    expect(target(5)).toBe(target(5));
  });

  it("scales with level", () => {
    const dmg = (level: number) => {
      const archer = unit("ranger", 1, 5, { level });
      const r = fight([archer], [unit("bones", 1, 99)]);
      return (events(r).find((e) => e.t === "damage" && e.src === archer.uid) as { amount: number }).amount;
    };
    expect([dmg(1), dmg(2), dmg(3)]).toEqual([2, 4, 6]);
  });

  it("hurt: Pack Wolf grows when it survives a blow", () => {
    const r = fight([unit("wolf", 2, 9)], [unit("bones", 1, 3)]);
    expect(events(r).find((e) => e.t === "buff")).toMatchObject({ atk: 1, hp: 0 });
    expect(finalHp(r, 0)).toEqual(["wolf:4/7"]); // bitten twice, grew twice
  });

  it("hurt does not fire when the unit is killed, or when a barrier absorbs the hit", () => {
    const dead = fight([unit("wolf", 2, 1)], [unit("bones", 5, 9)]);
    expect(events(dead).some((e) => e.t === "buff")).toBe(false);
    const shielded = fight([unit("wolf", 2, 9, { relic: "aegis" })], [unit("bones", 1, 1)]);
    expect(events(shielded).some((e) => e.t === "buff")).toBe(false);
  });

  it("kill: Stalking Tiger grows on a kill", () => {
    const r = fight([unit("tiger", 6, 9)], [unit("bones", 1, 2), unit("bones", 1, 2)]);
    expect(events(r).filter((e) => e.t === "buff")).toHaveLength(2);
    expect(finalHp(r, 0)[0]).toMatch(/^tiger:10\//);
  });

  it("faint: Bone Soldier leaves a pile of bones in its place", () => {
    const r = fight([unit("skeleton", 1, 1)], [unit("bones", 5, 1), unit("bones", 1, 30)]);
    expect(events(r).some((e) => e.t === "summon")).toBe(true);
    expect(r.steps.some((s) => s.teams[0].some((u) => u.sp === "bones"))).toBe(true);
  });

  it("allyFaint: Shambling Corpse feeds on its comrades", () => {
    const r = fight([unit("bones", 1, 1), unit("zombie", 2, 20)], [unit("bones", 9, 30)]);
    expect(events(r).some((e) => e.t === "buff" && e.atk === 1)).toBe(true);
  });

  it("summons go behind their owner, and only when there is room", () => {
    // The front ally falls, which opens a slot; the lich fills it with bones right behind itself.
    const roomy = fight([unit("bones", 1, 1), unit("lich", 7, 30)], [unit("bones", 1, 99)]);
    const after = roomy.steps.find((s) => s.events.some((e) => e.t === "summon"))!;
    expect(after.teams[0].map((u) => u.sp)).toEqual(["lich", "bones"]);
    // With five on the team and nobody falling, there is nowhere to put anything.
    const crowded = fight([unit("lich", 7, 90), unit("bones", 1, 90), unit("bones", 1, 90), unit("bones", 1, 90), unit("bones", 1, 90)], [unit("bones", 1, 5)]);
    expect(events(crowded).some((e) => e.t === "summon")).toBe(false);
  });

  it("faint summons never exceed five units", () => {
    const team = [unit("mushroom", 1, 1), unit("bones", 1, 9), unit("bones", 1, 9), unit("bones", 1, 9), unit("bones", 1, 9)];
    const r = fight(team, [unit("bones", 9, 9), unit("bones", 1, 99)]);
    for (const s of r.steps) expect(s.teams[0].length).toBeLessThanOrEqual(5);
  });

  it("revive: Phoenix Tear brings a creature back once, at half stats", () => {
    const r = fight([unit("bones", 8, 8, { relic: "phoenix-tear" })], [unit("bones", 9, 40)]);
    expect(events(r).filter((e) => e.t === "revive")).toHaveLength(1);
    const revived = r.steps.flatMap((s) => s.teams[0]).find((u) => u.uid >= 2_000_000);
    expect(revived).toMatchObject({ atk: 4, hp: 4 });
  });

  it("a Death Knight and relic abilities both fire", () => {
    const r = fight([unit("mummy", 3, 20, { relic: "thornmail" })], [unit("bones", 2, 50), unit("bones", 2, 50)]);
    const triggers = events(r).filter((e) => e.t === "trigger");
    expect(triggers.length).toBeGreaterThanOrEqual(2);
  });

  it("relic stats apply in battle, and health never drops below one", () => {
    const axe = fight([unit("bones", 1, 1, { relic: "berserker-axe" })], [unit("bones", 1, 50)]);
    const first = axe.steps[0]!.teams[0][0]!;
    expect(first).toMatchObject({ atk: 7, hp: 1 }); // 6 attack gained, health floored at 1
  });

  it("uses the strongest/weakest/front/back selectors on the right side", () => {
    const foes = [unit("bones", 1, 30), unit("sprout", 7, 30), unit("wisp", 3, 30)];
    const giant = unit("giant", 1, 99);
    const hit = events(fight([giant], foes)).find((e) => e.t === "damage" && e.src === giant.uid && e.amount === 9) as { uid: number };
    expect(hit.uid).toBe(foe(foes[1]!)); // the strongest (attack 7)
    const eagle = unit("eagle", 1, 99);
    const dive = events(fight([eagle], foes)).find((e) => e.t === "damage" && e.src === eagle.uid && e.amount === 6) as { uid: number };
    expect(dive.uid).toBe(foe(foes[2]!)); // the last in line
  });
});

describe("bonds", () => {
  const bondEvents = (r: ReturnType<typeof fight>) => events(r).filter((e) => e.t === "bond");

  it("count distinct species, not copies", () => {
    const twice = fight([unit("wolf"), unit("wolf")], [unit("bones", 1, 99)]);
    expect(bondEvents(twice)).toHaveLength(0);
    const pair = fight([unit("wolf"), unit("boar")], [unit("bones", 1, 99)]);
    expect(bondEvents(pair)).toEqual([{ t: "bond", side: 0, faction: "wildkin", need: 2 }]);
  });

  it("Wildkin 2 gives +1 attack, Wildkin 4 gives +3/+1 (and replaces the 2)", () => {
    const two = fight([unit("wolf", 2, 9), unit("boar", 3, 9)], [unit("bones", 1, 99)]);
    expect(two.steps[1]!.teams[0].map((u) => u.atk)).toEqual([3, 4]); // +1 each, before any ability fires
    const four = fight([unit("wolf", 2, 9), unit("boar", 3, 9), unit("bear", 3, 9), unit("tiger", 5, 9)], [unit("bones", 1, 99)]);
    expect(bondEvents(four).map((e) => (e as { need: number }).need)).toEqual([4]);
    expect(four.steps[1]!.teams[0].map((u) => `${u.atk}/${u.hp}`)).toEqual(["5/10", "6/10", "6/10", "8/10"]);
  });

  it("apply to both sides independently", () => {
    const r = fight([unit("wolf"), unit("boar")], [unit("skeleton"), unit("zombie")]);
    const sides = bondEvents(r).map((e) => (e as { side: number }).side).sort();
    expect(sides).toEqual([0, 1]);
  });

  it("Elemental 2 shields only the front Elemental; Elemental 4 shields all", () => {
    const two = fight([unit("ember"), unit("droplet"), unit("bones", 1, 9)], [unit("bones", 1, 99)]);
    expect(two.steps[1]!.teams[0].filter((u) => u.statuses.includes("barrier"))).toHaveLength(1);
    const four = fight([unit("ember"), unit("droplet"), unit("pebble"), unit("gust"), unit("bones", 1, 9)], [unit("bones", 1, 99)]);
    expect(four.steps[1]!.teams[0].filter((u) => u.statuses.includes("barrier")).length).toBeGreaterThanOrEqual(4);
  });

  it("Undead 4: the first Undead to fall rises once at half stats, tokens excluded", () => {
    // (no creature here fills the slot first: a faint summon would take the last free place)
    const team = [unit("zombie", 2, 2), unit("mummy", 3, 40), unit("vampire", 4, 40), unit("wraith", 3, 40), unit("bones", 1, 40)];
    const r = fight(team, [unit("bones", 9, 60)]);
    expect(events(r).filter((e) => e.t === "revive")).toHaveLength(1);
  });

  it("Dragonkin 2 burns a random enemy for 3 at the start", () => {
    const r = fight([unit("lizard"), unit("viper")], [unit("bones", 1, 30), unit("sprout", 1, 30)]);
    const burn = events(r).find((e) => e.t === "damage" && e.amount === 3);
    expect(burn).toBeDefined();
  });
});

describe("determinism and invariants", () => {
  it("gives identical results for identical input", () => {
    const team = [unit("wolf"), unit("ember"), unit("fairy"), unit("hag"), unit("ranger")];
    const foe = [unit("skeleton"), unit("zombie"), unit("mummy"), unit("vampire")];
    expect(JSON.stringify(fight(team, foe, 9))).toBe(JSON.stringify(fight(team, foe, 9)));
  });

  it("never produces impossible states across thousands of random fights", () => {
    const rng = new Rng(2024);
    const pool = SPECIES_LIST;
    const relics = RELICS;
    let uid = 1000;
    const randomTeam = () =>
      Array.from({ length: 1 + rng.int(5) }, () => {
        const sp = rng.pick(pool);
        const u = { uid: ++uid, sp: sp.id, atk: sp.atk + rng.int(12), hp: sp.hp + rng.int(15), level: 1 + rng.int(3), exp: 0, ...(rng.chance(0.4) ? { relic: rng.pick(relics).id } : {}) };
        return u;
      });
    for (let i = 0; i < 1500; i++) {
      const r = simulateBattleLoose(randomTeam(), randomTeam(), rng.int(1 << 30));
      expect(r.clashes).toBeLessThanOrEqual(MAX_CLASHES);
      const final = r.steps.at(-1)!;
      expect(r.survivors).toEqual([final.teams[0].length, final.teams[1].length]);
      if (r.outcome === "win" && r.clashes < MAX_CLASHES) expect(r.survivors[1]).toBe(0);
      if (r.outcome === "lose" && r.clashes < MAX_CLASHES) expect(r.survivors[0]).toBe(0);
      for (const step of r.steps) {
        const uids = new Set<number>();
        for (const team of step.teams) {
          expect(team.length).toBeLessThanOrEqual(5);
          for (const u of team) {
            expect(Number.isFinite(u.atk) && Number.isFinite(u.hp)).toBe(true);
            expect(u.atk).toBeGreaterThanOrEqual(0);
            expect(uids.has(u.uid), `duplicate uid ${u.uid}`).toBe(false);
            uids.add(u.uid);
          }
        }
      }
    }
  });
});

// The random test reuses unit uids across sides; the battle offsets the enemy's, so it still must be unique.
function simulateBattleLoose(a: ReturnType<typeof unit>[], b: ReturnType<typeof unit>[], seed: number) {
  return simulateBattle(a, b, seed);
}

describe("sanity of the data the tests rely on", () => {
  it("bones is a vanilla token", () => {
    expect(species("bones").ability).toBeUndefined();
  });
});

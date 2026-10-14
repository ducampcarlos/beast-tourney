/**
 * Battle simulation. Pure and deterministic: the same two teams and the same seed always give the
 * same fight. The result carries an event log plus a snapshot after each phase, so the renderer
 * replays the fight without needing to know any rules.
 *
 * Rules in short: the front units of both teams hit each other at the same time. A unit that
 * reaches 0 health faints and the line closes up. Abilities fire on battle start, when hurt, on
 * a kill, on fainting and when an ally faints. A barrier cancels the next hit; venom makes a unit's
 * attacks lethal. Bonds and relics are applied before the first clash.
 */

import { FACTION_DEFS, bondNeed, relic as relicDef, species as speciesDef } from "./data.js";
import { Rng } from "./rng.js";
import { type Slotted, selectAllies, selectEnemies } from "./targets.js";
import { type Ability, type Effect, FACTIONS, type FactionId, type RelicDef, SLOTS, type Species, type Status, type Trigger, type Unit } from "./types.js";

export const MAX_CLASHES = 100;
const TRIGGER_BUDGET = 600;
const ENEMY_UID_BASE = 1_000_000;
const SUMMON_UID_BASE = 2_000_000;

export type Side = 0 | 1;

export interface UnitView {
  uid: number;
  sp: string;
  side: Side;
  atk: number;
  hp: number;
  level: number;
  statuses: Status[];
  relic?: string;
}

export type BattleEvent =
  | { t: "bond"; side: Side; faction: FactionId; need: number }
  | { t: "boon"; id: string }
  | { t: "trigger"; uid: number; trigger: Trigger }
  | { t: "clash"; a: number; b: number }
  | { t: "damage"; uid: number; amount: number; src?: number }
  | { t: "barrier"; uid: number }
  | { t: "venom"; uid: number }
  | { t: "buff"; uid: number; atk: number; hp: number; src?: number }
  | { t: "status"; uid: number; status: Status }
  | { t: "faint"; uid: number }
  | { t: "summon"; uid: number; side: Side }
  | { t: "revive"; uid: number };

export interface BattleStep {
  note: string;
  events: BattleEvent[];
  teams: [UnitView[], UnitView[]];
}

export type Outcome = "win" | "lose" | "draw";

export interface BattleResult {
  outcome: Outcome;
  steps: BattleStep[];
  clashes: number;
  /** Units left standing on each side. */
  survivors: [number, number];
}

interface BUnit extends Slotted {
  side: Side;
  sp: Species;
  hp: number;
  level: number;
  statuses: Set<Status>;
  relic?: RelicDef;
  startAtk: number;
  startHp: number;
  revived: boolean;
  killedBy?: number;
}

const scale = (n: number | undefined, level: number): number => (n ?? 0) * level;

export interface BattleOptions {
  /** Boons the player holds; the enemy never has any. */
  boons?: readonly string[];
  /** Oaths the player took; some of them change how the player's creatures fight. */
  oaths?: readonly string[];
}

export function simulateBattle(player: readonly Unit[], enemy: readonly Unit[], seed: number, options: BattleOptions = {}): BattleResult {
  return new Battle(player, enemy, seed, options.boons ?? [], options.oaths ?? []).run();
}

class Battle {
  private readonly rng: Rng;
  private readonly teams: [BUnit[], BUnit[]];
  private readonly steps: BattleStep[] = [];
  private events: BattleEvent[] = [];
  private readonly hurtQueue: BUnit[] = [];
  private readonly bondRevive: [number, number] = [0, 0];
  private boonRevive = 0;
  private budget = TRIGGER_BUDGET;
  private nextUid = SUMMON_UID_BASE;
  private clashes = 0;

  constructor(player: readonly Unit[], enemy: readonly Unit[], seed: number, private readonly boons: readonly string[], private readonly oaths: readonly string[]) {
    this.rng = new Rng(seed);
    this.teams = [player.slice(0, SLOTS).map((u) => this.make(u, 0, 0)), enemy.slice(0, SLOTS).map((u) => this.make(u, 1, ENEMY_UID_BASE))];
  }

  private make(u: Unit, side: Side, uidBase: number): BUnit {
    const sp = speciesDef(u.sp);
    const rel = u.relic ? relicDef(u.relic) : undefined;
    const atk = Math.max(0, u.atk + (rel?.atk ?? 0));
    const hp = Math.max(1, u.hp + (rel?.hp ?? 0));
    const statuses = new Set<Status>();
    if (rel?.status) statuses.add(rel.status);
    return { uid: uidBase + u.uid, side, sp, faction: sp.faction, atk, hp, level: u.level, statuses, relic: rel, startAtk: atk, startHp: hp, revived: false };
  }

  // ---- bookkeeping ----------------------------------------------------------------------

  private view(u: BUnit): UnitView {
    return { uid: u.uid, sp: u.sp.id, side: u.side, atk: u.atk, hp: Math.max(0, u.hp), level: u.level, statuses: [...u.statuses].sort(), relic: u.relic?.id };
  }

  private snapshot(note: string): void {
    this.steps.push({ note, events: this.events, teams: [this.teams[0].map((u) => this.view(u)), this.teams[1].map((u) => this.view(u))] });
    this.events = [];
  }

  private emit(e: BattleEvent): void {
    this.events.push(e);
  }

  // ---- damage ---------------------------------------------------------------------------

  private damage(target: BUnit, amount: number, src: BUnit | undefined, clash: boolean): void {
    if (amount <= 0 || target.hp <= 0) return;
    if (target.statuses.delete("barrier")) {
      this.emit({ t: "barrier", uid: target.uid });
      return;
    }
    target.hp -= amount;
    this.emit({ t: "damage", uid: target.uid, amount, src: src?.uid });
    if (clash && src?.statuses.has("venom") && target.hp > 0) {
      target.hp = 0;
      this.emit({ t: "venom", uid: target.uid });
    }
    if (target.hp <= 0) target.killedBy = src?.uid;
    else this.hurtQueue.push(target);
  }

  // ---- abilities ------------------------------------------------------------------------

  private abilities(u: BUnit, trigger: Trigger): Ability[] {
    return [u.sp.ability, u.relic?.ability].filter((a): a is Ability => a !== undefined && a.trigger === trigger);
  }

  private fire(u: BUnit, trigger: Trigger, deathIndex?: number): void {
    for (const ability of this.abilities(u, trigger)) {
      if (this.budget-- <= 0) return;
      this.emit({ t: "trigger", uid: u.uid, trigger });
      for (const effect of ability.effects) this.apply(u, effect, deathIndex);
    }
  }

  /** `level` is the owner's level unless the effect comes from a bond, which never scales. */
  private apply(owner: BUnit, effect: Effect, deathIndex?: number, level = owner.level): void {
    const own = this.teams[owner.side];
    const foes = this.teams[owner.side === 0 ? 1 : 0];
    const alive = deathIndex === undefined;
    const at = alive ? own.indexOf(owner) : deathIndex;
    switch (effect.kind) {
      case "buff":
        for (const t of selectAllies(own, owner, alive, at, effect, this.rng)) this.grow(t, scale(effect.atk, level), scale(effect.hp, level), owner.uid);
        return;
      case "status":
        for (const t of selectAllies(own, owner, alive, at, effect, this.rng)) this.grant(t, effect.status);
        return;
      case "hit":
        for (const t of selectEnemies(foes, effect.to, effect.count ?? 1, this.rng)) this.damage(t, scale(effect.dmg, level), owner, false);
        return;
      case "summon": {
        for (let i = 0; i < (effect.count ?? 1); i++) {
          if (own.length >= SLOTS) break;
          const sp = speciesDef(effect.id);
          const stats = { atk: Math.max(1, scale(effect.atk, level)), hp: Math.max(1, scale(effect.hp, level)) };
          const unit: BUnit = { uid: this.nextUid++, side: owner.side, sp, faction: sp.faction, atk: stats.atk, hp: stats.hp, level, statuses: new Set(), startAtk: stats.atk, startHp: stats.hp, revived: false };
          const slot = alive ? Math.min(own.length, at + 1 + i) : Math.min(own.length, at);
          own.splice(slot, 0, unit);
          this.emit({ t: "summon", uid: unit.uid, side: owner.side });
        }
        return;
      }
      case "revive":
        this.revive(owner, effect.pct, deathIndex ?? own.length);
        return;
      case "gold":
        return; // only meaningful in the shop
    }
  }

  private grow(t: BUnit, atk: number, hp: number, src?: number): void {
    if (atk === 0 && hp === 0) return;
    t.atk = Math.max(0, t.atk + atk);
    t.hp += hp;
    this.emit({ t: "buff", uid: t.uid, atk, hp, src });
  }

  private grant(t: BUnit, status: Status): void {
    if (t.statuses.has(status)) return;
    t.statuses.add(status);
    this.emit({ t: "status", uid: t.uid, status });
  }

  private revive(dead: BUnit, pct: number, index: number): void {
    const own = this.teams[dead.side];
    if (dead.revived || own.length >= SLOTS) return;
    const atk = Math.max(1, Math.floor(dead.startAtk * pct));
    const hp = Math.max(1, Math.floor(dead.startHp * pct));
    const back: BUnit = { ...dead, uid: this.nextUid++, atk, hp, startAtk: atk, startHp: hp, statuses: new Set(), relic: undefined, revived: true, killedBy: undefined };
    own.splice(Math.min(own.length, index), 0, back);
    this.emit({ t: "revive", uid: back.uid });
  }

  // ---- deaths ---------------------------------------------------------------------------

  private flushHurt(): boolean {
    let any = false;
    while (this.hurtQueue.length > 0) {
      const u = this.hurtQueue.shift()!;
      if (u.hp <= 0 || !this.teams[u.side].includes(u)) continue;
      any = true;
      this.fire(u, "hurt");
    }
    return any;
  }

  private resolve(): void {
    for (let guard = 0; guard < 400; guard++) {
      if (this.flushHurt()) continue;
      const dead = this.firstDead();
      if (!dead) return;
      const own = this.teams[dead.side];
      const index = own.indexOf(dead);
      own.splice(index, 1);
      this.emit({ t: "faint", uid: dead.uid });
      this.fire(dead, "faint", index);
      for (const ally of [...own]) if (ally.hp > 0) this.fire(ally, "allyFaint");
      const killer = [...this.teams[0], ...this.teams[1]].find((u) => u.uid === dead.killedBy);
      if (killer && killer.hp > 0 && killer.side !== dead.side) this.fire(killer, "kill");
      if (dead.side === 0 && this.boonRevive > 0 && !dead.revived && dead.sp.tier > 0) {
        this.revive(dead, this.boonRevive, index);
        this.boonRevive = 0; // once per battle
      } else if (this.bondRevive[dead.side] > 0 && !dead.revived && dead.faction === "undead" && dead.sp.tier > 0) {
        this.revive(dead, this.bondRevive[dead.side], index);
        this.bondRevive[dead.side] = 0; // once per battle
      }
    }
  }

  private firstDead(): BUnit | undefined {
    for (const team of this.teams) {
      const found = team.find((u) => u.hp <= 0);
      if (found) return found;
    }
    return undefined;
  }

  // ---- the fight ------------------------------------------------------------------------

  private applyBonds(): void {
    for (const side of [0, 1] as Side[]) {
      const team = this.teams[side];
      for (const faction of FACTIONS) {
        const members = new Set(team.filter((u) => u.faction === faction && u.sp.tier > 0).map((u) => u.sp.id));
        const def = FACTION_DEFS[faction];
        const held = side === 0 ? this.boons : [];
        const tier = [...def.bonds].reverse().find((b) => members.size >= bondNeed(b.need, held));
        if (!tier) continue;
        this.emit({ t: "bond", side, faction, need: tier.need });
        const anchor = team.find((u) => u.faction === faction)!;
        for (const effect of tier.battle ?? []) this.apply(anchor, effect, undefined, 1);
        if (tier.revive) this.bondRevive[side] = tier.revive;
      }
    }
  }

  private applyBoons(): void {
    const team = this.teams[0];
    if (team.length === 0) return;
    if (this.oaths.includes("glass")) {
      for (const u of team) {
        u.atk += 2;
        u.hp = Math.max(1, u.hp - 2);
        u.startAtk = u.atk;
        u.startHp = u.hp;
      }
    }
    if (this.boons.includes("tonic")) {
      this.emit({ t: "boon", id: "tonic" });
      this.apply(team[0]!, { kind: "buff", to: "all", atk: 1, hp: 1 }, undefined, 1);
    }
    if (this.boons.includes("crest")) {
      this.emit({ t: "boon", id: "crest" });
      this.apply(team[0]!, { kind: "buff", to: "self", atk: 3, hp: 3 }, undefined, 1);
    }
    if (this.boons.includes("bulwark")) {
      this.emit({ t: "boon", id: "bulwark" });
      this.grant(team[0]!, "barrier");
    }
    if (this.boons.includes("ember")) {
      this.emit({ t: "boon", id: "ember" });
      this.boonRevive = 0.5;
    }
  }

  run(): BattleResult {
    this.snapshot("The teams line up.");
    this.applyBonds();
    this.applyBoons();
    this.snapshot("Bonds awaken.");

    const order = [...this.teams[0], ...this.teams[1]].map((u, i) => ({ u, i })).sort((a, b) => b.u.atk - a.u.atk || a.u.side - b.u.side || a.i - b.i).map((x) => x.u);
    for (const u of order) {
      if (u.hp <= 0 || !this.teams[u.side].includes(u)) continue;
      this.fire(u, "battleStart");
      this.resolve();
      if (this.events.length > 0) this.snapshot(`${u.sp.name} readies.`);
    }

    while (this.teams[0].length > 0 && this.teams[1].length > 0 && this.clashes < MAX_CLASHES) {
      this.clashes++;
      const a = this.teams[0][0]!;
      const b = this.teams[1][0]!;
      this.emit({ t: "clash", a: a.uid, b: b.uid });
      this.damage(b, a.atk, a, true);
      this.damage(a, b.atk, b, true);
      this.snapshot("Clash.");
      this.resolve();
      this.snapshot("Aftermath.");
    }

    const [p, e] = [this.teams[0], this.teams[1]];
    let outcome: Outcome;
    if (p.length === 0 && e.length === 0) outcome = "draw";
    else if (e.length === 0) outcome = "win";
    else if (p.length === 0) outcome = "lose";
    else {
      const total = (t: BUnit[]) => t.reduce((s, u) => s + u.hp + u.atk, 0);
      outcome = total(p) > total(e) ? "win" : total(p) < total(e) ? "lose" : "draw"; // stalemate: judged on what is left
    }
    return { outcome, steps: this.steps, clashes: this.clashes, survivors: [p.length, e.length] };
  }
}

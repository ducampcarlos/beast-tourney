/** Shared types for the engine. Nothing here depends on the browser or on Phaser. */

export const SLOTS = 5;
export const MAX_LEVEL = 3;
/** Experience needed to reach level 2 and level 3 (a level-2 unit has absorbed two copies, a level-3 unit five). */
export const LEVEL_EXP = [0, 0, 2, 5] as const;

export const FACTIONS = ["wildkin", "undead", "elemental", "fae", "dragonkin", "horde", "order"] as const;
export type FactionId = (typeof FACTIONS)[number];

export type Status = "barrier" | "venom";

/** Who an effect lands on, from the owner's point of view. */
export type AllyTarget = "self" | "ahead" | "behind" | "adjacent" | "random" | "all" | "others" | "faction" | "strongest" | "weakest";
export type EnemyTarget = "front" | "back" | "random" | "all" | "strongest" | "weakest";

/** Numbers in an effect are for level 1; atk, hp, dmg, amount and pct-free stats are multiplied by the unit's level. */
export type Effect =
  | { kind: "buff"; to: AllyTarget; atk?: number; hp?: number; count?: number; faction?: FactionId }
  | { kind: "hit"; to: EnemyTarget; dmg: number; count?: number }
  | { kind: "summon"; id: string; atk: number; hp: number; count?: number }
  | { kind: "status"; to: AllyTarget; status: Status; count?: number; faction?: FactionId }
  | { kind: "gold"; amount: number }
  /** The unit that fainted returns once, with this share of its starting stats. */
  | { kind: "revive"; pct: number };

export type Trigger = "battleStart" | "faint" | "hurt" | "kill" | "allyFaint" | "sell" | "turnStart";
export const BATTLE_TRIGGERS: readonly Trigger[] = ["battleStart", "faint", "hurt", "kill", "allyFaint"];
export const SHOP_TRIGGERS: readonly Trigger[] = ["sell", "turnStart"];

export interface Ability {
  trigger: Trigger;
  effects: Effect[];
}

export interface Species {
  id: string;
  name: string;
  faction: FactionId;
  /** 1-5 in the shop. 0 marks a token and 6 a boss, neither of which is ever offered. */
  tier: number;
  atk: number;
  hp: number;
  /** Sprite frame in the creature sheet for levels 1, 2 and 3. */
  frames: [number, number, number];
  ability?: Ability;
  flavor?: string;
  /** Drawn larger than normal. */
  scale?: number;
}

export interface RelicDef {
  id: string;
  name: string;
  cost: number;
  /** Frame in the dungeon sheet. */
  icon: number;
  atk?: number;
  hp?: number;
  status?: Status;
  ability?: Ability;
  text: string;
}

/** A creature on the team (or one that is part of an enemy team). */
export interface Unit {
  uid: number;
  sp: string;
  atk: number;
  hp: number;
  level: number;
  exp: number;
  relic?: string;
}

export type Difficulty = "squire" | "knight" | "champion";
export const DIFFICULTIES: readonly Difficulty[] = ["squire", "knight", "champion"];

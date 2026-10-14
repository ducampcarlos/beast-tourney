/**
 * Content: factions and bonds, creatures, tokens, bosses and relics.
 * Every number here is a level-1 value; abilities scale with the unit's level (see battle.ts).
 * The `frames` index the 10-column creature sheet (Tiny Creatures, CC0); a creature that has
 * no bigger form of its own shows the same sprite at every level.
 */

import type { Ability, Effect, FactionId, RelicDef, Species } from "./types.js";

// ---- factions and bonds ------------------------------------------------------------------

export interface BondTier {
  /** Distinct species of the faction needed on the team. */
  need: number;
  text: string;
  /** Applied at the start of every battle. */
  battle?: Effect[];
  /** Applied at the start of every shop turn. */
  turn?: Effect[];
  /** The first member to faint each battle rises again with this share of its stats. */
  revive?: number;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  color: number;
  blurb: string;
  bonds: [BondTier, BondTier];
}

export const FACTION_DEFS: Record<FactionId, FactionDef> = {
  wildkin: {
    id: "wildkin", name: "Wildkin", color: 0xc98b4a, blurb: "Beasts of the wild hunt as a pack.",
    bonds: [
      { need: 2, text: "Wildkin gain +1 attack.", battle: [{ kind: "buff", to: "faction", faction: "wildkin", atk: 1 }] },
      { need: 4, text: "Wildkin gain +3 attack and +1 health.", battle: [{ kind: "buff", to: "faction", faction: "wildkin", atk: 3, hp: 1 }] },
    ],
  },
  undead: {
    id: "undead", name: "Undead", color: 0x9a8fc0, blurb: "Death is only an interruption.",
    bonds: [
      { need: 2, text: "Undead gain +2 health.", battle: [{ kind: "buff", to: "faction", faction: "undead", hp: 2 }] },
      { need: 4, text: "Undead gain +2 health, and the first one to fall rises again with half its stats.", battle: [{ kind: "buff", to: "faction", faction: "undead", hp: 2 }], revive: 0.5 },
    ],
  },
  elemental: {
    id: "elemental", name: "Elemental", color: 0x4fb4e8, blurb: "Raw forces given shape.",
    bonds: [
      { need: 2, text: "Your front Elemental starts with a barrier.", battle: [{ kind: "status", to: "faction", faction: "elemental", status: "barrier", count: 1 }] },
      { need: 4, text: "Every Elemental starts with a barrier.", battle: [{ kind: "status", to: "faction", faction: "elemental", status: "barrier", count: 5 }] },
    ],
  },
  fae: {
    id: "fae", name: "Fae", color: 0x6fd08c, blurb: "They grow while you are not looking.",
    bonds: [
      { need: 2, text: "At the start of each turn, Fae gain +1 health.", turn: [{ kind: "buff", to: "faction", faction: "fae", hp: 1 }] },
      { need: 4, text: "At the start of each turn, Fae gain +1 attack and +1 health.", turn: [{ kind: "buff", to: "faction", faction: "fae", atk: 1, hp: 1 }] },
    ],
  },
  dragonkin: {
    id: "dragonkin", name: "Dragonkin", color: 0xe0584a, blurb: "Scaled, proud and fond of fire.",
    bonds: [
      { need: 2, text: "At the start of battle, a random enemy takes 3 damage.", battle: [{ kind: "hit", to: "random", dmg: 3 }] },
      { need: 4, text: "At the start of battle, every enemy takes 3 damage.", battle: [{ kind: "hit", to: "all", dmg: 3 }] },
    ],
  },
  horde: {
    id: "horde", name: "Horde", color: 0x8bb34a, blurb: "Loud, greedy and everywhere.",
    bonds: [
      { need: 2, text: "Earn +1 gold each turn, and Horde gain +1 attack.", turn: [{ kind: "gold", amount: 1 }], battle: [{ kind: "buff", to: "faction", faction: "horde", atk: 1 }] },
      { need: 4, text: "Earn +2 gold each turn, and Horde gain +3 attack.", turn: [{ kind: "gold", amount: 2 }], battle: [{ kind: "buff", to: "faction", faction: "horde", atk: 3 }] },
    ],
  },
  order: {
    id: "order", name: "Order", color: 0xe8d070, blurb: "Disciplined, blessed and well equipped.",
    bonds: [
      { need: 2, text: "Order gain +1 attack and +1 health.", battle: [{ kind: "buff", to: "faction", faction: "order", atk: 1, hp: 1 }] },
      { need: 4, text: "Order gain +2/+1 and start with a barrier.", battle: [{ kind: "buff", to: "faction", faction: "order", atk: 2, hp: 1 }, { kind: "status", to: "faction", faction: "order", status: "barrier", count: 5 }] },
    ],
  },
};

// ---- creatures ---------------------------------------------------------------------------

const when = (trigger: Ability["trigger"], ...effects: Effect[]): Ability => ({ trigger, effects });
const buff = (to: Effect extends infer E ? (E extends { kind: "buff"; to: infer T } ? T : never) : never, atk = 0, hp = 0, count?: number): Effect => ({ kind: "buff", to, atk, hp, ...(count ? { count } : {}) });

type Row = [id: string, name: string, tier: number, atk: number, hp: number, frames: number | [number, number, number], ability: Ability | undefined, flavor: string];

function build(faction: FactionId, rows: Row[]): Species[] {
  return rows.map(([id, name, tier, atk, hp, frames, ability, flavor]) => ({
    id, name, faction, tier, atk, hp, ability, flavor,
    frames: typeof frames === "number" ? [frames, frames, frames] : frames,
  }));
}

const WILDKIN = build("wildkin", [
  ["squirrel", "Hoarder Squirrel", 1, 2, 1, 175, when("turnStart", buff("self", 0, 1)), "Buries a little more every day."],
  ["wolf", "Pack Wolf", 1, 2, 3, [142, 23, 24], when("hurt", buff("self", 1, 0)), "Gets meaner with every bite taken."],
  ["boar", "Tusked Boar", 2, 3, 4, 160, when("battleStart", buff("self", 3, 0)), "Always charges first."],
  ["bear", "Cave Bear", 2, 3, 6, [101, 163, 165], when("faint", buff("all", 1, 1)), "Its fall rallies the pack."],
  ["tiger", "Stalking Tiger", 3, 5, 5, [169, 157, 156], when("kill", buff("self", 2, 2)), "Every kill makes it bolder."],
  ["stag", "Great Stag", 3, 5, 6, [161, 162, 162], when("faint", buff("all", 2, 0)), "Its last charge inspires the herd."],
  ["eagle", "Sky Eagle", 4, 5, 5, [135, 134, 104], when("battleStart", { kind: "hit", to: "back", dmg: 6 }), "Dives on the weakest from above."],
  ["mammoth", "Tundra Mammoth", 5, 8, 12, [158, 158, 171], when("battleStart", { kind: "buff", to: "faction", atk: 2, hp: 2 }, { kind: "status", to: "self", status: "barrier" }), "A living wall."],
]);

const UNDEAD = build("undead", [
  ["skeleton", "Bone Soldier", 1, 2, 2, 1, when("faint", { kind: "summon", id: "bones", atk: 1, hp: 1 }), "Falls apart. Then falls back together."],
  ["zombie", "Shambling Corpse", 1, 2, 4, [0, 99, 98], when("allyFaint", buff("self", 1, 0)), "Hungry for company."],
  ["mummy", "Tomb Mummy", 2, 3, 6, 95, when("hurt", { kind: "hit", to: "random", dmg: 2 }), "Strike it and the curse strikes back."],
  ["watcher", "Watcher Eye", 2, 2, 5, 5, when("battleStart", { kind: "hit", to: "front", dmg: 3 }), "It sees you first."],
  ["vampire", "Night Vampire", 3, 4, 5, 2, when("battleStart", { kind: "hit", to: "random", dmg: 3 }, buff("self", 0, 3)), "Drinks first, introduces itself later."],
  ["wraith", "Grave Wraith", 3, 3, 4, 4, when("faint", { kind: "hit", to: "all", dmg: 2 }), "Its last breath is a scream."],
  ["deathknight", "Death Knight", 4, 7, 7, 97, when("allyFaint", buff("self", 2, 2)), "Collects the fallen."],
  ["reaper", "Pale Reaper", 4, 7, 6, 19, when("kill", { kind: "hit", to: "random", dmg: 5 }), "Takes one, then another."],
  ["lich", "Lich Sovereign", 5, 8, 11, 96, when("allyFaint", { kind: "summon", id: "bones", atk: 5, hp: 5 }), "Every fallen ally rises again as bones."],
]);

const ELEMENTAL = build("elemental", [
  ["ember", "Living Ember", 1, 3, 2, [55, 45, 3], when("faint", { kind: "hit", to: "random", dmg: 2 }), "Goes out with a spark."],
  ["droplet", "Dew Spirit", 1, 2, 3, [56, 46, 46], when("turnStart", buff("random", 0, 1)), "Refreshes whoever it passes."],
  ["pebble", "Stone Sprite", 2, 2, 6, [57, 47, 128], when("battleStart", { kind: "status", to: "self", status: "barrier" }), "Hard to bruise."],
  ["tidehorse", "Tide Charger", 3, 3, 6, 53, when("battleStart", { kind: "status", to: "behind", status: "barrier" }), "Shelters whoever stands behind it."],
  ["gust", "Gale Spirit", 3, 4, 4, [58, 48, 48], when("battleStart", { kind: "hit", to: "random", dmg: 2, count: 2 }), "Cuts from two directions."],
  ["frost", "Frost Warden", 4, 5, 7, [59, 49, 49], when("battleStart", { kind: "hit", to: "all", dmg: 2 }), "The air turns on your enemies."],
  ["core", "Arcane Core", 5, 6, 7, 89, when("battleStart", { kind: "status", to: "all", status: "barrier" }), "A heart of raw power; it shelters everyone."],
]);

const FAE = build("fae", [
  ["fairy", "Meadow Fairy", 1, 2, 2, 12, when("sell", buff("random", 1, 1, 2)), "Leaves a blessing behind."],
  ["mushroom", "Spore Cap", 1, 1, 4, 13, when("faint", { kind: "summon", id: "sprout", atk: 1, hp: 2 }), "Spreads when stepped on."],
  ["leprechaun", "Lucky Leprechaun", 2, 2, 3, 9, when("turnStart", { kind: "gold", amount: 1 }), "Finds a coin every morning."],
  ["thornbloom", "Thornbloom", 2, 2, 5, 122, when("hurt", { kind: "hit", to: "front", dmg: 3 }), "Pretty. Do not touch."],
  ["treant", "Elder Treant", 3, 3, 8, [114, 113, 116], when("turnStart", buff("self", 1, 1)), "Grows slowly and certainly."],
  ["maneater", "Maneater Bloom", 3, 3, 5, 8, when("turnStart", buff("random", 2, 1)), "Feeds the whole garden."],
  ["dryad", "Forest Dryad", 4, 4, 5, 25, when("battleStart", buff("all", 1, 1)), "The woods lend a hand."],
  ["unicorn", "Moon Unicorn", 5, 5, 6, [51, 51, 52], when("battleStart", { kind: "status", to: "random", status: "barrier" }, buff("all", 1, 1)), "Shelters the worthy."],
]);

const DRAGONKIN = build("dragonkin", [
  ["lizard", "Ember Lizard", 1, 2, 2, 146, when("faint", { kind: "hit", to: "random", dmg: 3 }), "Spits its last spark."],
  ["viper", "Fang Viper", 1, 1, 2, [40, 41, 41], when("battleStart", { kind: "status", to: "self", status: "venom" }), "One bite is plenty."],
  ["croc", "Marsh Crocodile", 2, 4, 5, 148, when("kill", { kind: "hit", to: "random", dmg: 3 }), "Death roll."],
  ["drakeling", "Young Drake", 3, 4, 5, [79, 78, 33], when("battleStart", { kind: "hit", to: "random", dmg: 3 }), "Practising its breath."],
  ["wyvern", "Frost Wyvern", 4, 6, 7, [31, 31, 30], when("battleStart", { kind: "hit", to: "random", dmg: 3, count: 2 }), "Two frozen gusts."],
  ["gorgon", "Gorgon Queen", 4, 4, 7, 7, when("battleStart", { kind: "hit", to: "strongest", dmg: 6 }), "One look at the strongest."],
  ["wyrm", "Shadow Wyrm", 5, 8, 9, 32, when("battleStart", { kind: "hit", to: "all", dmg: 4 }), "Darkness with teeth."],
]);

const HORDE = build("horde", [
  ["imp", "Cackling Imp", 1, 3, 2, [39, 38, 123], when("faint", { kind: "hit", to: "front", dmg: 2 }), "Laughs all the way down."],
  ["goblin", "Goblin Looter", 1, 3, 3, [10, 124, 11], when("sell", { kind: "gold", amount: 2 }), "Everything has a price."],
  ["hag", "Marsh Hag", 2, 3, 5, 100, when("battleStart", buff("random", 2, 0)), "A hex for a favour."],
  ["orc", "Orc Raider", 3, 6, 5, 125, when("kill", buff("all", 2, 0)), "Blood calls for more."],
  ["minotaur", "Maze Minotaur", 3, 6, 6, 20, when("kill", buff("self", 3, 0)), "Gored, and gloating."],
  ["troll", "Bridge Troll", 4, 6, 9, 42, when("hurt", buff("self", 0, 2)), "Heals what you hurt."],
  ["cyclops", "Lone Cyclops", 4, 7, 8, 75, when("battleStart", { kind: "hit", to: "front", dmg: 6 }), "Throws first."],
  ["giant", "Hill Giant", 5, 11, 12, [14, 126, 126], when("battleStart", { kind: "hit", to: "strongest", dmg: 9 }), "Picks the biggest rock and the biggest enemy."],
]);

const ORDER = build("order", [
  ["squire", "Shield Squire", 1, 2, 3, [16, 17, 18], when("battleStart", buff("behind", 0, 2)), "Covers the one behind."],
  ["ranger", "Scout Ranger", 1, 2, 2, 67, when("battleStart", { kind: "hit", to: "random", dmg: 2 }), "First arrow, first blood."],
  ["cherub", "Little Cherub", 2, 2, 4, [36, 35, 37], when("faint", { kind: "status", to: "random", status: "barrier" }), "A parting blessing."],
  ["wizard", "Court Wizard", 3, 3, 4, 65, when("battleStart", buff("random", 2, 0, 2)), "Empowers two allies."],
  ["centaur", "Centaur Lancer", 3, 4, 5, 50, when("hurt", buff("behind", 1, 0)), "Spurs the line on."],
  ["gargoyle", "Stone Gargoyle", 3, 3, 6, 69, when("faint", buff("all", 1, 2)), "Crumbles, and shelters the rest."],
  ["genie", "Wish Genie", 4, 4, 6, 109, when("sell", { kind: "gold", amount: 3 }), "Grants exactly one wish: gold."],
  ["pegasus", "Winged Pegasus", 5, 7, 9, 52, when("battleStart", buff("all", 2, 2)), "A banner in the sky."],
]);

export const SPECIES_LIST: Species[] = [...WILDKIN, ...UNDEAD, ...ELEMENTAL, ...FAE, ...DRAGONKIN, ...HORDE, ...ORDER];

/** Summoned creatures: never offered in the shop and without abilities. */
const token = (id: string, name: string, faction: FactionId, frame: number): Species => ({ id, name, faction, tier: 0, atk: 1, hp: 1, frames: [frame, frame, frame] });
export const TOKENS: Species[] = [
  token("bones", "Pile of Bones", "undead", 88),
  token("sprout", "Sprout", "fae", 122),
  token("wisp", "Wisp", "elemental", 85),
  token("whelp", "Whelp", "dragonkin", 146),
];

/** Bosses: a fixed lineup on rounds 4, 8 and 12. Their stats live in enemy.ts. */
export const BOSS_SPECIES: Species[] = [
  { id: "goblin-king", name: "Goblin King Grakk", faction: "horde", tier: 6, atk: 10, hp: 18, frames: [11, 11, 11], scale: 1.5, ability: when("battleStart", buff("faction", 2, 0)), flavor: "Taxes everything that moves." },
  { id: "lich-lord", name: "Lich Lord Morvane", faction: "undead", tier: 6, atk: 9, hp: 24, frames: [96, 96, 96], scale: 1.5, ability: when("battleStart", { kind: "summon", id: "bones", atk: 6, hp: 6 }), flavor: "Has been dead for a very long time." },
  { id: "elder-dragon", name: "Ignis, the Elder Dragon", faction: "dragonkin", tier: 6, atk: 13, hp: 34, frames: [33, 33, 33], scale: 1.75, ability: when("battleStart", { kind: "hit", to: "all", dmg: 3 }, { kind: "status", to: "self", status: "barrier" }), flavor: "The last trial of the tournament." },
];

const ALL_SPECIES = new Map<string, Species>([...SPECIES_LIST, ...TOKENS, ...BOSS_SPECIES].map((s) => [s.id, s]));

export function species(id: string): Species {
  const found = ALL_SPECIES.get(id);
  if (!found) throw new Error(`Unknown species "${id}"`);
  return found;
}

export const hasSpecies = (id: string): boolean => ALL_SPECIES.has(id);
export const speciesByTier = (maxTier: number): Species[] => SPECIES_LIST.filter((s) => s.tier <= maxTier);

// ---- relics ------------------------------------------------------------------------------

export const RELICS: RelicDef[] = [
  { id: "whetstone", name: "Whetstone", cost: 3, icon: 103, atk: 3, text: "+3 attack." },
  { id: "buckler", name: "Oak Buckler", cost: 3, icon: 101, hp: 4, text: "+4 health." },
  { id: "berserker-axe", name: "Berserker Axe", cost: 3, icon: 118, atk: 6, hp: -2, text: "+6 attack, -2 health." },
  { id: "aegis", name: "Steel Aegis", cost: 4, icon: 102, status: "barrier", text: "Starts the battle with a barrier." },
  { id: "viper-draught", name: "Viper's Draught", cost: 4, icon: 114, status: "venom", text: "Its attacks are venomous." },
  { id: "thornmail", name: "Thornmail", cost: 4, icon: 97, ability: when("hurt", { kind: "hit", to: "random", dmg: 3 }), text: "When hurt, 3 damage to a random enemy." },
  { id: "rally-blade", name: "Rallying Blade", cost: 4, icon: 107, ability: when("battleStart", { kind: "buff", to: "all", atk: 1 }), text: "At battle start, allies gain +1 attack." },
  { id: "troll-blood", name: "Troll Blood", cost: 4, icon: 113, ability: when("turnStart", buff("self", 1, 1)), text: "At the start of each turn, +1/+1." },
  { id: "war-spear", name: "War Spear", cost: 4, icon: 131, ability: when("battleStart", { kind: "hit", to: "front", dmg: 4 }), text: "At battle start, 4 damage to the front enemy." },
  { id: "phoenix-tear", name: "Phoenix Tear", cost: 5, icon: 115, ability: when("faint", { kind: "revive", pct: 0.5 }), text: "When it faints, it returns once with half its stats." },
  { id: "arcane-staff", name: "Arcane Staff", cost: 5, icon: 129, ability: when("battleStart", buff("random", 2, 2)), text: "At battle start, a random ally gains +2/+2." },
  { id: "merchant-ring", name: "Merchant's Ring", cost: 3, icon: 89, ability: when("sell", { kind: "gold", amount: 3 }), text: "When sold, gain 3 gold." },
  { id: "great-hammer", name: "Great Hammer", cost: 4, icon: 117, atk: 2, ability: when("kill", buff("self", 2, 0)), text: "+2 attack, and +2 more for every kill." },
];

const RELIC_MAP = new Map(RELICS.map((r) => [r.id, r]));
export function relic(id: string): RelicDef {
  const found = RELIC_MAP.get(id);
  if (!found) throw new Error(`Unknown relic "${id}"`);
  return found;
}
export const hasRelic = (id: string): boolean => RELIC_MAP.has(id);

// ---- boons -------------------------------------------------------------------------------
// Rewards for beating a boss: pick one of three, and keep it for the rest of the run.

export interface BoonDef {
  id: string;
  name: string;
  /** Frame in the dungeon sheet. */
  icon: number;
  text: string;
}

export const BOONS: BoonDef[] = [
  { id: "purse", name: "Heavy Purse", icon: 89, text: "+2 gold at the start of every turn." },
  { id: "market", name: "Wider Market", icon: 66, text: "One more creature for sale each turn (up to five)." },
  { id: "lucky", name: "Lucky Charm", icon: 116, text: "The first roll of every turn is free." },
  { id: "haggler", name: "Haggler's Ledger", icon: 90, text: "Relics cost 1 less." },
  { id: "thrift", name: "Thrifty Soul", icon: 91, text: "Selling a creature gives 1 more gold." },
  { id: "mentor", name: "Veteran's Banner", icon: 17, text: "At the start of each turn, your weakest creature gains +2/+2." },
  { id: "scholar", name: "Scholar's Lens", icon: 130, text: "The shop sells creatures of one tier higher." },
  { id: "bond-sage", name: "Bond Sage", icon: 111, text: "Four-creature bonds need only three different kinds." },
  { id: "bulwark", name: "Vanguard's Oath", icon: 96, text: "Your front creature starts every battle with a barrier." },
  { id: "tonic", name: "Battle Tonic", icon: 126, text: "Your creatures start every battle with +1/+1." },
  { id: "ember", name: "Phoenix Ember", icon: 115, text: "The first creature to fall in each battle returns with half its stats." },
  { id: "second-wind", name: "Second Wind", icon: 114, text: "Gain a life right away." },
];

const BOON_MAP = new Map(BOONS.map((b) => [b.id, b]));
export function boon(id: string): BoonDef {
  const found = BOON_MAP.get(id);
  if (!found) throw new Error(`Unknown boon "${id}"`);
  return found;
}
export const hasBoon = (id: string): boolean => BOON_MAP.has(id);

/** How many different creatures of a faction a bond needs, given the boons held. */
export const bondNeed = (need: number, boons: readonly string[]): number => (boons.includes("bond-sage") && need >= 4 ? need - 1 : need);

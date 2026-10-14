import { afterEach, describe, expect, it } from "vitest";

import { LANGS, LANG_NAMES, detectLang, fill, getLang, hasTranslation, isLang, rankName, setLang, t, tn, translate, type Lang } from "../src/i18n/index.js";
import { ES } from "../src/i18n/es.js";
import { PT } from "../src/i18n/pt.js";
import { SPECIES_LIST, BOSS_SPECIES, FACTION_DEFS, RELICS } from "../src/engine/data.js";
import { bossName } from "../src/engine/enemy.js";
import { newRun, buy } from "../src/engine/run.js";
import { shareText } from "../src/engine/share.js";
import { buySkill } from "../src/engine/skills.js";
import { TRIGGER_TEXT, describeAbility, describeEffect, statusText, triggerText } from "../src/engine/text.js";
import { allKeys, placeholders } from "./support/i18nKeys.js";

afterEach(() => setLang("en"));

const TRANSLATED: Array<[Lang, Record<string, string>]> = [["es", ES], ["pt", PT]];

describe("translating", () => {
  it("returns the English text itself when there is no translation, and fills placeholders", () => {
    expect(t("Not a text anyone translated")).toBe("Not a text anyone translated");
    expect(t("Round {n}/{max}", { n: 3, max: 12 })).toBe("Round 3/12");
    expect(fill("{a} and {b}", { a: 1 })).toBe("1 and {b}");
    expect(fill("no placeholders")).toBe("no placeholders");
  });

  it("speaks the language that is set, and goes back", () => {
    expect(getLang()).toBe("en");
    setLang("es");
    expect(t("Back")).toBe(ES["Back"]);
    expect(t("Back")).not.toBe("Back");
    setLang("pt");
    expect(t("Back")).toBe(PT["Back"]);
    setLang("en");
    expect(t("Back")).toBe("Back");
  });

  it("chooses between singular and plural, and fills the number", () => {
    expect(tn(1, "{n} point to spend", "{n} points to spend")).toBe("1 point to spend");
    expect(tn(0, "{n} point to spend", "{n} points to spend")).toBe("0 points to spend");
    expect(tn(5, "{n} point to spend", "{n} points to spend")).toBe("5 points to spend");
    setLang("es");
    expect(tn(1, "{n} point to spend", "{n} points to spend")).toMatch(/^1 /);
    expect(tn(3, "{n} point to spend", "{n} points to spend")).toMatch(/^3 /);
  });

  it("translates by language without touching the current one", () => {
    expect(translate("es", "Back")).toBe(ES["Back"]);
    expect(translate("en", "Back")).toBe("Back");
    expect(getLang()).toBe("en");
    expect(hasTranslation("en", "anything")).toBe(true);
    expect(hasTranslation("es", "Back")).toBe(true);
    expect(hasTranslation("es", "constructor")).toBe(false); // not inherited from Object
    expect(hasTranslation("pt", "toString")).toBe(false);
  });

  it("recognises the languages, and picks the first one the browser prefers that the game speaks", () => {
    expect(LANGS).toEqual(["en", "es", "pt"]);
    for (const l of LANGS) expect(LANG_NAMES[l].length).toBeGreaterThan(1);
    expect(isLang("es")).toBe(true);
    expect(isLang("fr")).toBe(false);
    expect(isLang(null)).toBe(false);
    expect(detectLang(["es-AR", "en"])).toBe("es");
    expect(detectLang(["pt-BR"])).toBe("pt");
    expect(detectLang(["fr-FR", "de", "pt"])).toBe("pt");
    expect(detectLang(["fr"])).toBe("en");
    expect(detectLang([])).toBe("en");
    expect(detectLang(["EN-us"])).toBe("en");
  });

  it("names the ranks", () => {
    expect(rankName("knight")).toBe("Knight");
    setLang("es");
    expect(rankName("knight")).toBe(ES["Knight"]);
  });
});

describe.each(TRANSLATED)("the %s translation", (lang, dictionary) => {
  const keys = allKeys();

  it("has every text of the game", () => {
    const missing = keys.filter((e) => !Object.prototype.hasOwnProperty.call(dictionary, e.key)).map((e) => e.key);
    expect(missing, `${missing.length} missing`).toEqual([]);
  });

  it("has nothing the game no longer uses", () => {
    const known = new Set(keys.map((e) => e.key));
    expect(Object.keys(dictionary).filter((k) => !known.has(k))).toEqual([]);
  });

  it("keeps the placeholders of every text, no more and no fewer", () => {
    for (const [key, value] of Object.entries(dictionary)) expect(placeholders(value), `"${key}"`).toEqual(placeholders(key));
  });

  it("has no empty text and no leftover marks", () => {
    for (const [key, value] of Object.entries(dictionary)) {
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(value, key).not.toMatch(/TODO|FIXME|undefined|\[object/);
    }
  });

  it("stays about as short as the English, so it fits the screen", () => {
    const tooLong = Object.entries(dictionary).filter(([key, value]) => value.length > key.length * 1.6 + 14).map(([key, value]) => `${key} -> ${value}`);
    expect(tooLong).toEqual([]);
  });

  it("really translates most of it (names of places and people may stay)", () => {
    const same = Object.entries(dictionary).filter(([k, v]) => k === v).length;
    expect(same / Object.keys(dictionary).length).toBeLessThan(0.2);
  });

  it("describes every ability in words of its own language", () => {
    setLang(lang);
    const english = /\b(give|deal|damage|allies|ally|enemy|enemies|summon|gain|random|attack|health|barrier|its|itself|then|battle|start)\b/i;
    for (const sp of [...SPECIES_LIST, ...BOSS_SPECIES]) {
      if (!sp.ability) continue;
      for (const level of [1, 2, 3]) {
        const text = describeAbility(sp.ability, level, sp.faction);
        expect(text, `${sp.id} L${level}`).not.toMatch(english);
        expect(text).toMatch(/^\S.*: \S.*\.$/);
        expect(text).not.toMatch(/undefined|NaN|\{|\}/);
      }
    }
    for (const r of RELICS) if (r.ability) expect(describeAbility(r.ability, 1), r.id).not.toMatch(english);
  });

  it("names the triggers, statuses, bosses and the share text", () => {
    setLang(lang);
    for (const trigger of ["battleStart", "faint", "hurt", "kill", "allyFaint", "sell", "turnStart"] as const) expect(triggerText(trigger), trigger).not.toBe(TRIGGER_TEXT[trigger]);
    expect(statusText("barrier")).not.toMatch(/^Barrier: ignores/);
    expect(statusText("venom")).not.toMatch(/^Venom: any/);
    expect(bossName(4)).toBe(dictionary["Goblin King Grakk"]);
    expect(bossName(16)).toBe(t("{name}, Reborn", { name: dictionary["Goblin King Grakk"]! }));
    const run = newRun(42, "knight", ["glass"]);
    const share = shareText(run);
    expect(share).toContain("42");
    expect(share).not.toMatch(/rounds won, \d+ lives left/);
    expect(share).toContain(dictionary["Glass Cannons"]);
  });

  it("gives faction names and engine messages in the language", () => {
    setLang(lang);
    for (const f of Object.values(FACTION_DEFS)) expect(t(f.name)).toBe(dictionary[f.name]);
    const r = buy(newRun(1, "knight"), 0, 9);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(dictionary["No such slot."]);
    const s = buySkill([], "haggle", 99);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.error).toContain(dictionary["Lucky Start"]!);
  });
});

describe("the English text generator is unchanged", () => {
  it("still reads the way it always did", () => {
    const wolf = SPECIES_LIST.find((s) => s.id === "wolf")!;
    expect(describeAbility(wolf.ability!, 1, wolf.faction)).toBe("Hurt: Give itself +1 attack.");
    const mammoth = SPECIES_LIST.find((s) => s.id === "mammoth")!;
    expect(describeAbility(mammoth.ability!, 2, mammoth.faction)).toBe("Battle start: Give all Wildkin +4/+4, then give itself a barrier.");
    expect(describeEffect({ kind: "revive", pct: 0.5 }, 1)).toBe("return once with 50% of its stats");
    expect(triggerText("allyFaint")).toBe("Ally faints");
    expect(statusText("venom")).toBe("Venom: any damage its attacks deal is lethal.");
  });
});

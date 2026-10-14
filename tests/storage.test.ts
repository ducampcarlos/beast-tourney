import { describe, expect, it } from "vitest";

import { TROPHIES } from "../src/engine/achievements.js";
import { newRun } from "../src/engine/run.js";
import { MAX_SAVE_BYTES, SAVE_FORMAT, SAVE_GAME, buildSave, parseSave } from "../src/web/savefile.js";
import { parseProfile } from "../src/web/session.js";
import { type StorageLike, makeStore } from "../src/web/storage.js";

const fake = (data = new Map<string, string>()): StorageLike & { data: Map<string, string> } => ({
  data,
  getItem: (k) => data.get(k) ?? null,
  setItem: (k, v) => void data.set(k, v),
  removeItem: (k) => void data.delete(k),
});
const broken = (): StorageLike => ({
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
});

describe("the store", () => {
  it("keeps a value in both kinds of browser storage and reads it back", () => {
    const local = fake();
    const session = fake();
    const store = makeStore(() => local, () => session);
    store.set("a", "1");
    expect(local.data.get("a")).toBe("1");
    expect(session.data.get("a")).toBe("1");
    expect(store.get("a")).toBe("1");
    expect(store.get("missing")).toBeNull();
    expect(store.persistent).toBe(true);
  });

  it("prefers the persistent copy, and falls back to the tab's copy when it is gone", () => {
    const local = fake();
    const session = fake();
    const store = makeStore(() => local, () => session);
    store.set("a", "1");
    local.data.set("a", "newer");
    expect(store.get("a")).toBe("newer");
    local.data.clear(); // the player cleared the site data
    expect(store.get("a")).toBe("1");
  });

  it("forgets a key everywhere", () => {
    const local = fake();
    const session = fake();
    const store = makeStore(() => local, () => session);
    store.set("a", "1");
    store.set("a", null);
    expect([local.data.has("a"), session.data.has("a"), store.get("a")]).toEqual([false, false, null]);
  });

  it("works from the tab's storage when the persistent one is blocked, and says it is not persistent", () => {
    const session = fake();
    const store = makeStore(() => broken(), () => session);
    store.set("a", "1");
    expect(store.persistent).toBe(false);
    expect(store.get("a")).toBe("1");
    expect(session.data.get("a")).toBe("1");
  });

  it("still remembers within the page when no storage works at all, and never throws", () => {
    const store = makeStore(() => broken(), () => broken());
    expect(() => store.set("a", "1")).not.toThrow();
    expect(store.get("a")).toBe("1");
    store.set("a", null);
    expect(store.get("a")).toBeNull();
    const none = makeStore(() => undefined, () => undefined);
    none.set("b", "2");
    expect(none.get("b")).toBe("2");
    expect(none.persistent).toBe(false);
  });

  it("copes with a getter that itself throws (a window without storage)", () => {
    const store = makeStore(() => {
      throw new Error("SecurityError");
    }, () => fake());
    store.set("a", "1");
    expect(store.get("a")).toBe("1");
  });
});

describe("the save file", () => {
  const profile = () => parseProfile(JSON.stringify({ trophies: TROPHIES.slice(0, 5).map((t) => t.id), runs: 7, speed: 2, muted: true }));

  it("round-trips the profile and the run in progress", () => {
    const run = newRun(42, "knight", ["glass"], []);
    const text = buildSave(profile(), run, new Date("2026-01-02T03:04:05Z"));
    const back = parseSave(text);
    expect(back).toMatchObject({ ok: true, exported: "2026-01-02T03:04:05.000Z" });
    if (!back.ok) return;
    expect(back.profile).toEqual(profile());
    expect(back.run).toEqual(run);
  });

  it("can carry no run, and leaves out a run that is already over", () => {
    expect(parseSave(buildSave(profile(), null))).toMatchObject({ ok: true, run: null });
    const finished = { ...newRun(1, "knight"), phase: "lost" as const };
    expect(parseSave(buildSave(profile(), finished))).toMatchObject({ ok: true, run: null });
  });

  it("says what is wrong with something that is not a save", () => {
    const bad = (text: string) => {
      const r = parseSave(text);
      return r.ok ? "accepted" : r.error;
    };
    expect(bad("")).toMatch(/not a Beast Tourney save/);
    expect(bad("{{{")).toMatch(/not a Beast Tourney save/);
    expect(bad("[]")).toMatch(/not a Beast Tourney save/);
    expect(bad("null")).toMatch(/not a Beast Tourney save/);
    expect(bad(JSON.stringify({ game: "other", format: 1, profile: {} }))).toMatch(/not a Beast Tourney save/);
    expect(bad(JSON.stringify({ game: SAVE_GAME, format: SAVE_FORMAT + 1, profile: {} }))).toMatch(/different version/);
    expect(bad(JSON.stringify({ game: SAVE_GAME, format: SAVE_FORMAT }))).toMatch(/no progress/);
    expect(bad(JSON.stringify({ game: SAVE_GAME, format: SAVE_FORMAT, profile: [] }))).toMatch(/no progress/);
    expect(bad("x".repeat(MAX_SAVE_BYTES + 1))).toMatch(/too big/);
  });

  it("refuses a save whose run is damaged, instead of loading half of it", () => {
    const file = JSON.parse(buildSave(profile(), newRun(3, "knight")));
    file.run.team = "nope";
    const r = parseSave(JSON.stringify(file));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("damaged") });
  });

  it("checks the profile like anything else that comes from outside: impossible values are dropped", () => {
    const file = JSON.parse(buildSave(profile(), null));
    file.profile.trophies = ["first-blood", "not-a-trophy"];
    file.profile.skills = ["haggle"]; // its requirement is missing
    file.profile.speed = 99;
    file.profile.seen = ["wolf", "dragon-of-doom"];
    const r = parseSave(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.trophies).toEqual(["first-blood"]);
    expect(r.profile.skills).toEqual([]);
    expect(r.profile.speed).toBe(1);
    expect(r.profile.seen).toEqual(["wolf"]);
  });

  it("ignores extra fields and hostile-looking keys", () => {
    const file = JSON.parse(buildSave(profile(), null));
    file.profile.__proto__ = { polluted: true };
    file.extra = "<script>alert(1)</script>";
    const r = parseSave(JSON.stringify(file));
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

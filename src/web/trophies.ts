import Phaser from "phaser";

import { TROPHIES, pointsEarned } from "../engine/achievements.js";
import { species } from "../engine/data.js";
import type { Audio } from "./audio.js";
import type { Session } from "./session.js";
import { COLOR, W, backdrop, button, fadeIn, go, panel, text } from "./ui.js";
import { getLang, rankName, t } from "../i18n/index.js";

export class Trophies extends Phaser.Scene {
  private page: Phaser.GameObjects.GameObject[] = [];
  private tabs: Record<"trophies" | "runs", Phaser.GameObjects.Container> | null = null;

  constructor() {
    super("Trophies");
  }

  create(): void {
    const session = this.registry.get("session") as Session;
    this.page = [];
    (this.registry.get("audio") as Audio).music("menu");
    fadeIn(this);
    backdrop(this, 1.2);
    panel(this, 0, 0, W, 54, "ui_ancient_brown");
    text(this, 18, 26, t("Records"), 30, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 6 }).setOrigin(0, 0.5);
    this.tabs = {
      trophies: button(this, 330, 27, t("Challenges"), () => this.show("trophies", session), { w: 160, h: 38, color: "blue", size: 20 }),
      runs: button(this, 492, 27, t("Run history"), () => this.show("runs", session), { w: 160, h: 38, color: "blue", size: 20 }),
    };
    button(this, 880, 27, t("Back"), () => go(this, "Menu"), { w: 130, h: 40, color: "grey", size: 20 });
    panel(this, 12, 64, W - 24, 464, "ui_ancient_brown");
    this.show("trophies", session);
  }

  private show(tab: "trophies" | "runs", session: Session): void {
    for (const o of this.page) o.destroy();
    this.page = [];
    this.tabs?.trophies.setAlpha(tab === "trophies" ? 1 : 0.55);
    this.tabs?.runs.setAlpha(tab === "runs" ? 1 : 0.55);
    if (tab === "trophies") this.drawTrophies(session);
    else this.drawRuns(session);
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.page.push(o);
    return o;
  }

  private drawTrophies(session: Session): void {
    const owned = session.profile.trophies;
    this.keep(text(this, 600, 27, t("{done} of {total}  ·  {points} points", { done: owned.length, total: TROPHIES.length, points: pointsEarned(owned) }), 22, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 5 }).setOrigin(0, 0.5));
    // three columns of cards that always fit the panel, however many challenges there are
    const cols = 3;
    const rows = Math.ceil(TROPHIES.length / cols);
    const pitch = Math.min(49, Math.floor(448 / rows));
    const height = pitch - 5;
    const width = 296;
    TROPHIES.forEach((ch, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const x = 24 + col * (width + 8);
      const y = 76 + row * pitch;
      const got = owned.includes(ch.id);
      this.keep(this.rect(x + width / 2, y + height / 2, width, height, got ? 0x4a3a22 : 0x2f2418, got ? 0xf2c14e : 0x4a3a2a));
      const star = this.image(x + 22, y + height / 2, "star", 2.6);
      if (!got) star.setTintFill(0x1a1410).setAlpha(0.8);
      this.keep(text(this, x + 44, y + 2, got ? t(ch.name) : "???", 18, got ? COLOR.gold : COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 3 }));
      this.keep(text(this, x + width - 10, y + 3, `+${ch.points}`, 18, got ? COLOR.gold : COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 3 }).setOrigin(1, 0));
      this.keep(text(this, x + 44, y + 22, t(ch.text), 12, got ? COLOR.cream : COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 2, wordWrap: { width: width - 54 }, lineSpacing: 0 }));
    });
  }

  private drawRuns(session: Session): void {
    const best = session.profile.best;
    const bests = (["squire", "knight", "champion"] as const).map((d) => `${rankName(d)}: ${best[d].round > 0 ? t("round {n}", { n: best[d].round }) : "-"}${best[d].wins ? t(", {n} won", { n: best[d].wins }) : ""}${session.profile.depth[d] ? t(", depth {n}", { n: session.profile.depth[d] }) : ""}`);
    this.keep(text(this, W / 2, 84, bests.join("     "), 18, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0.5));
    const records = session.profile.records;
    if (records.length === 0) {
      this.keep(text(this, W / 2, 280, t("No finished runs yet."), 26, COLOR.muted).setOrigin(0.5));
      return;
    }
    records.slice(0, 8).forEach((r, i) => {
      const y = 106 + i * 51;
      const won = r.outcome === "won";
      this.keep(this.rect(W / 2, y + 22, 910, 46, won ? 0x4a3a22 : 0x2f2418, won ? 0xf2c14e : 0x4a3a2a));
      const result = r.endless ? t("Depth {n}", { n: r.round }) : won ? t("Champion") : t("Round {n}", { n: r.round });
      this.keep(text(this, 44, y + 6, result, 22, won ? COLOR.gold : COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 3 }));
      this.keep(text(this, 44, y + 28, t("{rank}  ·  seed {seed}  ·  {date}", { rank: rankName(r.difficulty), seed: r.seed, date: new Date(r.t).toLocaleDateString(getLang()) }), 13, COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 2 }));
      this.keep(text(this, 330, y + 14, t("{n} won", { n: r.wins }), 20, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 3 }));
      r.team.forEach((sp, k) => this.keep(this.add.sprite(520 + k * 52, y + 22, "creatures", species(sp).frames[0]).setScale(2.4)));
    });
  }

  private rect(x: number, y: number, w: number, h: number, fill: number, stroke: number): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(x, y, w, h, fill, 0.85).setStrokeStyle(3, stroke);
  }

  private image(x: number, y: number, key: string, scale: number): Phaser.GameObjects.Image {
    return this.keep(this.add.image(x, y, key).setScale(scale));
  }
}

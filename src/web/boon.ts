import Phaser from "phaser";

import { boon } from "../engine/data.js";
import { bossName } from "../engine/enemy.js";
import { chooseBoon } from "../engine/run.js";
import type { Audio } from "./audio.js";
import { burst, ring } from "./fx.js";
import type { Session } from "./session.js";
import { flushTrophies, award } from "./toasts.js";
import { COLOR, W, backdrop, button, fadeIn, go, panel, text } from "./ui.js";
import { newTrophies } from "../engine/achievements.js";
import { t } from "../i18n/index.js";

const CARD_W = 262;
const CARD_H = 300;

/** The reward after a boss: three boons, take one. */
export class Boon extends Phaser.Scene {
  constructor() {
    super("Boon");
  }

  create(): void {
    this.taking = false; // a scene object lives on between visits: state must be reset here, not in field initialisers
    const session = this.registry.get("session") as Session;
    const audio = this.registry.get("audio") as Audio;
    const run = session.run;
    if (!run?.pendingBoons) {
      this.scene.start("Shop");
      return;
    }
    fadeIn(this);
    audio.music("shop2");
    backdrop(this, 1.2);
    const fallen = bossName(run.round - 1);
    text(this, W / 2, 76, fallen ? t("{name} falls!", { name: fallen }) : t("Victory!"), 44, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 10 }).setOrigin(0.5);
    text(this, W / 2, 124, t("Choose a boon. It stays with you for the rest of the run."), 22, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 5 }).setOrigin(0.5);

    run.pendingBoons.forEach((id, i) => {
      const def = boon(id);
      const x = W / 2 + (i - 1) * (CARD_W + 28);
      const y = 150 + CARD_H / 2 + 20;
      const card = this.add.container(x, y);
      const bg = panel(this, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, "ui_ancient_tan");
      const plate = this.add.rectangle(0, -CARD_H / 2 + 74, 96, 96, 0x3b2a1a, 0.9).setStrokeStyle(4, 0x7a5a38);
      const icon = this.add.image(0, -CARD_H / 2 + 74, "dungeon", def.icon).setScale(5);
      const name = text(this, 0, -CARD_H / 2 + 146, t(def.name), 26, COLOR.dark, { align: "center", wordWrap: { width: CARD_W - 30 } }).setOrigin(0.5, 0);
      const body = text(this, 0, -CARD_H / 2 + 188, t(def.text), 19, "#3b2a1a", { align: "center", wordWrap: { width: CARD_W - 40 }, lineSpacing: 3 }).setOrigin(0.5, 0);
      card.add([bg, plate, icon, name, body]);
      card.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true });
      this.tweens.add({ targets: icon, y: icon.y - 4, duration: 800 + i * 120, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      card.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 320, delay: 150 + i * 120, ease: "Back.easeOut" });
      card.on("pointerover", () => this.tweens.add({ targets: card, y: y - 8, duration: 90 }));
      card.on("pointerout", () => this.tweens.add({ targets: card, y, duration: 90 }));
      const take = () => this.take(id, x, y);
      card.on("pointerup", take);
      const pick = button(this, x, y + CARD_H / 2 + 38, t("Take"), take, { w: 150, h: 44, color: "green", size: 24 });
      pick.setDepth(5);
    });

    // what you already hold
    if (run.boons.length > 0) {
      text(this, 20, 28, t("Held:"), 20, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0, 0.5);
      run.boons.forEach((id, i) => this.add.image(96 + i * 44, 28, "dungeon", boon(id).icon).setScale(2.6));
    }
    flushTrophies(this);
  }

  private taking = false;

  private take(id: string, x: number, y: number): void {
    if (this.taking) return;
    const session = this.registry.get("session") as Session;
    const audio = this.registry.get("audio") as Audio;
    const r = chooseBoon(session.run!, id);
    if (!r.ok) return;
    this.taking = true;
    session.update(r.run);
    audio.sfx("levelup", 0.8);
    ring(this, x, y, 0xffe27a, 4);
    burst(this, x, y, "fx_star_01", 24, 0xffe27a, 260, 100);
    award(this.registry, newTrophies(session.profile.trophies, { boons: r.run.boons, team: r.run.team }));
    this.time.delayedCall(650, () => go(this, "Shop"));
  }
}

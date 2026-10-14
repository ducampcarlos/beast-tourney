import Phaser from "phaser";

import { TROPHIES } from "../engine/achievements.js";
import type { Audio } from "./audio.js";
import type { Session } from "./session.js";
import { COLOR, H, W, backdrop, button, fadeIn, go, panel, text } from "./ui.js";

export class Trophies extends Phaser.Scene {
  constructor() {
    super("Trophies");
  }

  create(): void {
    const session = this.registry.get("session") as Session;
    (this.registry.get("audio") as Audio).music("menu");
    fadeIn(this);
    backdrop(this, 1.2);
    panel(this, 0, 0, W, 54, "ui_ancient_brown");
    text(this, 18, 26, "Trophies", 30, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 6 }).setOrigin(0, 0.5);
    const owned = session.profile.trophies;
    text(this, 190, 27, `${owned.length} of ${TROPHIES.length}`, 22, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 5 }).setOrigin(0, 0.5);
    button(this, 880, 27, "Back", () => go(this, "Menu"), { w: 130, h: 40, color: "grey", size: 20 });

    panel(this, 12, 64, W - 24, 464, "ui_ancient_brown");
    TROPHIES.forEach((t, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 32 + col * 468;
      const y = 84 + row * 54;
      const got = owned.includes(t.id);
      this.add.rectangle(x + 216, y + 22, 440, 48, got ? 0x4a3a22 : 0x2f2418, 0.85).setStrokeStyle(3, got ? 0xf2c14e : 0x4a3a2a);
      const star = this.add.image(x + 26, y + 22, "star").setScale(3);
      if (!got) star.setTintFill(0x1a1410).setAlpha(0.8);
      text(this, x + 56, y + 6, got ? t.name : "???", 22, got ? COLOR.gold : COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 3 });
      text(this, x + 56, y + 28, t.text, 15, got ? COLOR.cream : COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 2 });
    });
    void H;
  }
}

import Phaser from "phaser";

import { MUSIC, SFX } from "./audio.js";
import { H, W, makeTextures, text } from "./ui.js";

const PARTICLES = ["flame_01", "flame_03", "magic_01", "magic_03", "spark_02", "spark_05", "smoke_01", "star_01", "star_04", "circle_05", "light_01", "slash_02", "muzzle_02", "twirl_01"];
const UI = ["ancient_brown", "ancient_brown_inlay", "ancient_brown_pressed", "ancient_tan", "ancient_tan_inlay", "ancient_tan_pressed", "ancient_grey", "ancient_grey_inlay", "blue", "blue_pressed", "green", "green_pressed", "grey", "grey_pressed", "red", "red_pressed", "yellow", "yellow_pressed"];

export class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    this.cameras.main.setBackgroundColor(0x14101f);
    const bar = this.add.rectangle(W / 2 - 200, H / 2, 0, 16, 0xf2c14e).setOrigin(0, 0.5);
    this.add.rectangle(W / 2, H / 2, 408, 24, 0x000000, 0).setStrokeStyle(3, 0xf3e6c4);
    const label = this.add.text(W / 2, H / 2 - 40, "Loading...", { fontFamily: "monospace", fontSize: "20px", color: "#f3e6c4" }).setOrigin(0.5);
    this.load.on("progress", (p: number) => {
      bar.width = 400 * p;
      label.setText(`Loading ${Math.round(p * 100)}%`);
    });

    this.load.setPath("assets");
    this.load.spritesheet("creatures", "img/creatures.png", { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("dungeon", "img/dungeon.png", { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("icons", "img/icons.png", { frameWidth: 16, frameHeight: 16 });
    for (const p of PARTICLES) this.load.image(`fx_${p}`, `img/fx_${p}.png`);
    for (const u of UI) this.load.image(`ui_${u}`, `ui/${u}.png`);
    for (const m of MUSIC) this.load.audio(m, `music/${m}.ogg`);
    for (const s of SFX) this.load.audio(s, `sfx/${s}.ogg`);
  }

  create(): void {
    makeTextures(this);
    const fontsReady = Promise.all([document.fonts.load('24px "KenneyPixel"'), document.fonts.load('24px "KenneyMini"')]).catch(() => undefined);
    const go = () => {
      document.getElementById("boot")?.remove();
      this.scene.start("Menu");
    };
    void fontsReady.then(go);
    void text; // (kept for tree-shaking clarity: text() needs the font, which is loaded above)
  }
}

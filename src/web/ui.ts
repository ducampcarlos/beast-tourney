/** Small drawing helpers shared by the scenes: layout constants, fonts, panels, buttons and procedural textures. */

import Phaser from "phaser";

export const W = 960;
export const H = 540;
export const FONT = "KenneyPixel";
export const FONT_MINI = "KenneyMini";

export const COLOR = {
  bg: 0x14101f, ink: 0x2a1f1a, cream: "#f3e6c4", gold: "#f2c14e", red: "#e0584a", green: "#6fd08c", blue: "#6ab7f5", muted: "#cdbd96", white: "#ffffff", dark: "#2a1f1a",
};

export const SPRITE_SCALE = 5;

export const hex = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;

/** Blend a colour toward white so faction colours stay readable on the brown panels. */
export function lighten(color: number, amount = 0.45): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return hex((mix(r) << 16) | (mix(g) << 8) | mix(b));
}

export function text(scene: Phaser.Scene, x: number, y: number, content: string, size = 24, color: string = COLOR.cream, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, content, { fontFamily: FONT, fontSize: `${size}px`, color, ...extra });
  t.setResolution(1);
  return t;
}

/** A 9-slice panel from the Kenney pixel UI pack (48px sprites with 16px corners), drawn at half size for crisp borders. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key = "ui_ancient_brown", scale = 2): Phaser.GameObjects.NineSlice {
  const slice = scene.add.nineslice(x, y, key, undefined, w / scale, h / scale, 16, 16, 16, 16);
  slice.setScale(scale).setOrigin(0, 0);
  return slice;
}

export interface ButtonOptions {
  w?: number;
  h?: number;
  color?: "blue" | "green" | "red" | "yellow" | "grey";
  size?: number;
  sfx?: string;
}

/** A pressable button: coloured 9-slice, label, hover lift, press sink. */
export function button(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void, opts: ButtonOptions = {}): Phaser.GameObjects.Container {
  const { w = 200, h = 56, color = "blue", size = 24 } = opts;
  const up = scene.add.nineslice(0, 0, `ui_${color}`, undefined, w / 2, h / 2, 16, 16, 16, 16).setScale(2);
  const down = scene.add.nineslice(0, 0, `ui_${color}_pressed`, undefined, w / 2, h / 2, 16, 16, 16, 16).setScale(2).setVisible(false);
  const caption = text(scene, 0, -2, label, size, "#ffffff", { stroke: "#1d1a2b", strokeThickness: 4 }).setOrigin(0.5);
  const c = scene.add.container(x, y, [up, down, caption]);
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  let enabled = true;
  c.on("pointerover", () => enabled && scene.tweens.add({ targets: c, y: y - 2, duration: 80 }));
  c.on("pointerout", () => {
    scene.tweens.add({ targets: c, y, duration: 80 });
    up.setVisible(true);
    down.setVisible(false);
    caption.y = -2;
  });
  c.on("pointerdown", () => {
    if (!enabled) return;
    up.setVisible(false);
    down.setVisible(true);
    caption.y = 2;
  });
  c.on("pointerup", () => {
    if (!enabled) return;
    up.setVisible(true);
    down.setVisible(false);
    caption.y = -2;
    scene.registry.get("audio")?.sfx(opts.sfx ?? "click", 0.5);
    onClick();
  });
  (c as Phaser.GameObjects.Container & { setEnabled: (v: boolean) => void; setLabel: (s: string) => void }).setEnabled = (v: boolean) => {
    enabled = v;
    c.setAlpha(v ? 1 : 0.5);
  };
  (c as Phaser.GameObjects.Container & { setEnabled: (v: boolean) => void; setLabel: (s: string) => void }).setLabel = (s: string) => caption.setText(s);
  return c;
}

export type Button = ReturnType<typeof button> & { setEnabled(v: boolean): void; setLabel(s: string): void };

/** Textures that are cheaper to draw than to ship: coin, star, shadow, soft dot. */
export function makeTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const px = (x: number, y: number, w: number, h: number, c: number) => g.fillStyle(c, 1).fillRect(x, y, w, h);

  // coin 12x12
  g.clear();
  px(3, 0, 6, 12, 0x3b2a14); px(1, 2, 10, 8, 0x3b2a14); px(0, 3, 12, 6, 0x3b2a14);
  px(4, 1, 4, 10, 0xf2c14e); px(2, 3, 8, 6, 0xf2c14e); px(1, 4, 10, 4, 0xf2c14e);
  px(5, 3, 2, 6, 0xb8841f); px(3, 2, 2, 1, 0xfff0a8);
  g.generateTexture("coin", 12, 12);

  // star 11x11
  g.clear();
  px(5, 0, 1, 11, 0x3b2a14); px(0, 5, 11, 1, 0x3b2a14); px(4, 3, 3, 5, 0x3b2a14); px(3, 4, 5, 3, 0x3b2a14);
  px(5, 1, 1, 9, 0xffd34d); px(1, 5, 9, 1, 0xffd34d); px(4, 4, 3, 3, 0xfff0a8);
  g.generateTexture("star", 11, 11);

  // shadow: a flat ellipse
  g.clear();
  g.fillStyle(0x000000, 0.35).fillEllipse(32, 8, 60, 14);
  g.generateTexture("shadow", 64, 16);

  // soft dot for sparkles
  g.clear();
  g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
  g.generateTexture("dot", 8, 8);

  // vignette: dark corners
  g.clear();
  g.generateTexture("blank", 2, 2);
  g.destroy();
}

export function toast(scene: Phaser.Scene, message: string, color: string = COLOR.red): void {
  const t = text(scene, W / 2, 96, message, 24, color, { stroke: "#1d1a2b", strokeThickness: 5 }).setOrigin(0.5).setDepth(1000).setAlpha(0);
  scene.tweens.add({ targets: t, alpha: 1, y: 84, duration: 150, yoyo: false, onComplete: () => scene.tweens.add({ targets: t, alpha: 0, y: 70, delay: 900, duration: 300, onComplete: () => t.destroy() }) });
}

/** Floating number or word that drifts up and fades. */
export function floater(scene: Phaser.Scene, x: number, y: number, message: string, color: string, size = 28, depth = 500): void {
  const t = text(scene, x, y, message, size, color, { stroke: "#1d1a2b", strokeThickness: 5 }).setOrigin(0.5).setDepth(depth);
  scene.tweens.add({ targets: t, y: y - 38, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
}

/** Dungeon floor and wall, drawn once as a backdrop. */
export function backdrop(scene: Phaser.Scene, wallRows = 1.5): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0).setDepth(-10);
  const size = 64; // 16px tiles at 4x
  const wallEnd = size * wallRows;
  for (let y = 0; y < H; y += size) {
    for (let x = 0; x < W; x += size) {
      const wall = y < wallEnd - 1;
      // a deterministic sprinkle of rubble on the floor
      const n = ((x / size) * 7 + (y / size) * 13 + (x / size) * (y / size)) % 11;
      const frame = wall ? 28 : n === 0 ? 12 : n === 5 ? 24 : 0;
      c.add(scene.add.image(x, y, "dungeon", frame).setOrigin(0, 0).setScale(4).setTint(wall ? 0x9a9ab8 : 0xb8a090));
    }
  }
  c.add(scene.add.rectangle(0, 0, W, H, 0x120d1c, 0.3).setOrigin(0, 0));
  c.add(scene.add.rectangle(0, wallEnd - 4, W, 8, 0x000000, 0.35).setOrigin(0, 0));
  return c;
}

/** A modal panel with a title, wrapped lines and a close button. Returns a function that closes it. */
export function overlay(scene: Phaser.Scene, title: string, lines: string[], onClose?: () => void, width = 760, depth = 2000): () => void {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(depth).setInteractive();
  const height = 440;
  const box = panel(scene, W / 2 - width / 2, H / 2 - height / 2, width, height, "ui_ancient_brown").setDepth(depth + 1);
  const head = text(scene, W / 2, H / 2 - height / 2 + 36, title, 36, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 8 }).setOrigin(0.5).setDepth(depth + 2);
  const body = text(scene, W / 2 - width / 2 + 36, H / 2 - height / 2 + 76, lines.join("\n\n"), 20, COLOR.cream, { wordWrap: { width: width - 72 }, lineSpacing: 3, stroke: "#2a1f1a", strokeThickness: 3 }).setDepth(depth + 2);
  const close = () => {
    for (const o of objects) o.destroy();
    onClose?.();
  };
  const b = button(scene, W / 2, H / 2 + height / 2 - 40, "Got it", close, { w: 200, h: 48, color: "green", size: 24 }).setDepth(depth + 3);
  objects.push(dim, box, head, body, b);
  scene.input.keyboard?.once("keydown-ESC", close);
  return close;
}

/** A question with two answers, above everything else. `onYes` runs only if it is confirmed. */
export function confirmBox(scene: Phaser.Scene, message: string, yes: string, no: string, onYes: () => void, depth = 5000): void {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const close = () => objects.forEach((o) => o.destroy());
  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setDepth(depth).setInteractive();
  const box = panel(scene, W / 2 - 300, H / 2 - 110, 600, 220, "ui_ancient_brown").setDepth(depth + 1);
  const body = text(scene, W / 2, H / 2 - 50, message, 20, COLOR.cream, { align: "center", wordWrap: { width: 540 }, lineSpacing: 4, stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0.5).setDepth(depth + 2);
  const a = button(scene, W / 2 - 120, H / 2 + 62, yes, () => (close(), onYes()), { w: 190, h: 46, color: "green", size: 22 }).setDepth(depth + 2);
  const b = button(scene, W / 2 + 120, H / 2 + 62, no, close, { w: 190, h: 46, color: "grey", size: 22 }).setDepth(depth + 2);
  objects.push(dim, box, body, a, b);
}

/** Change scene with a short fade, ignoring clicks while it plays. */
export function go(scene: Phaser.Scene, key: string, data?: object): void {
  if (!scene.input.enabled) return;
  scene.input.enabled = false;
  scene.cameras.main.fadeOut(160, 20, 16, 31);
  scene.cameras.main.once("camerafadeoutcomplete", () => scene.scene.start(key, data));
}

export function fadeIn(scene: Phaser.Scene): void {
  scene.cameras.main.fadeIn(220, 20, 16, 31);
}

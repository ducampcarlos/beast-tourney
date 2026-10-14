import Phaser from "phaser";

import type { Audio } from "./audio.js";
import { CREDITS_LINES } from "./help.js";
import type { Session } from "./session.js";
import { COLOR, H, W, button, overlay, panel, text, type Button } from "./ui.js";

/** The settings panel: volumes, mute, default battle speed, credits. Everything is saved as it changes. */
export function openSettings(scene: Phaser.Scene, onClose?: () => void): void {
  const session = scene.registry.get("session") as Session;
  const audio = scene.registry.get("audio") as Audio;
  const objects: Phaser.GameObjects.GameObject[] = [];
  const D = 2000;
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    objects.push(o);
    return o;
  };
  add(scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(D).setInteractive());
  add(panel(scene, W / 2 - 330, 70, 660, 400, "ui_ancient_brown").setDepth(D + 1));
  add(text(scene, W / 2, 108, "Settings", 38, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 8 }).setOrigin(0.5).setDepth(D + 2));

  const meter = (label: string, y: number, get: () => number, set: (v: number) => void) => {
    add(text(scene, W / 2 - 290, y, label, 24, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(D + 2));
    const bar: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < 10; i++) bar.push(add(scene.add.rectangle(W / 2 - 40 + i * 20, y, 16, 22, 0x3b2a1a).setStrokeStyle(2, 0x2a1f1a).setDepth(D + 2)));
    const draw = () => bar.forEach((b, i) => b.setFillStyle(i < Math.round(get() * 10) ? 0xf2c14e : 0x3b2a1a));
    draw();
    add(button(scene, W / 2 - 80, y, "-", () => (set(Math.max(0, Math.round((get() - 0.1) * 10) / 10)), draw()), { w: 44, h: 40, size: 26, color: "grey" }).setDepth(D + 2));
    add(button(scene, W / 2 + 180, y, "+", () => (set(Math.min(1, Math.round((get() + 0.1) * 10) / 10)), draw()), { w: 44, h: 40, size: 26, color: "grey" }).setDepth(D + 2));
  };
  meter("Music", 170, () => audio.musicVolume, (v) => {
    audio.setMusicVolume(v);
    session.profile.musicVolume = v;
    session.saveProfile();
  });
  meter("Effects", 226, () => audio.sfxVolume, (v) => {
    audio.sfxVolume = v;
    session.profile.sfxVolume = v;
    session.saveProfile();
    audio.sfx("coin", 0.6);
  });

  add(text(scene, W / 2 - 290, 290, "Sound", 24, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(D + 2));
  const mute = add(button(scene, W / 2 + 50, 290, audio.muted ? "Off" : "On", () => {
    audio.setMuted(!audio.muted);
    session.profile.muted = audio.muted;
    session.saveProfile();
    mute.setLabel(audio.muted ? "Off" : "On");
  }, { w: 150, h: 42, size: 22, color: "blue" }).setDepth(D + 2)) as Button;

  add(text(scene, W / 2 - 290, 346, "Battle speed", 24, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(D + 2));
  const speed = add(button(scene, W / 2 + 50, 346, `x${session.profile.speed}`, () => {
    session.profile.speed = session.profile.speed === 1 ? 2 : session.profile.speed === 2 ? 4 : 1;
    session.saveProfile();
    speed.setLabel(`x${session.profile.speed}`);
  }, { w: 150, h: 42, size: 22, color: "blue" }).setDepth(D + 2)) as Button;

  const close = () => {
    for (const o of objects) o.destroy();
    onClose?.();
  };
  add(button(scene, W / 2 - 110, 420, "Credits", () => overlay(scene, "Credits", CREDITS_LINES), { w: 190, h: 46, size: 22, color: "grey" }).setDepth(D + 2));
  add(button(scene, W / 2 + 110, 420, "Done", close, { w: 190, h: 46, size: 24, color: "green" }).setDepth(D + 2));
  scene.input.keyboard?.once("keydown-ESC", close);
}

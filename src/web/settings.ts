import Phaser from "phaser";

import type { Audio } from "./audio.js";
import { CREDITS_LINES } from "./help.js";
import { buildSave, parseSave } from "./savefile.js";
import type { Session } from "./session.js";
import { store } from "./storage.js";
import { downloadText, pickTextFile } from "./transfer.js";
import { COLOR, H, W, button, confirmBox, overlay, panel, text, toast, type Button } from "./ui.js";
import { LANGS, LANG_NAMES, getLang, setLang, t } from "../i18n/index.js";

/** The settings panel: volumes, mute, default battle speed, saves, credits. Everything is saved as it changes. */
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
  add(panel(scene, W / 2 - 330, 26, 660, 488, "ui_ancient_brown").setDepth(D + 1));
  add(text(scene, W / 2, 62, t("Settings"), 36, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 8 }).setOrigin(0.5).setDepth(D + 2));

  const label = (content: string, y: number) => add(text(scene, W / 2 - 290, y, content, 24, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(D + 2));

  const meter = (name: string, y: number, get: () => number, set: (v: number) => void) => {
    label(name, y);
    const bar: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < 10; i++) bar.push(add(scene.add.rectangle(W / 2 - 40 + i * 20, y, 16, 22, 0x3b2a1a).setStrokeStyle(2, 0x2a1f1a).setDepth(D + 2)));
    const draw = () => bar.forEach((b, i) => b.setFillStyle(i < Math.round(get() * 10) ? 0xf2c14e : 0x3b2a1a));
    draw();
    add(button(scene, W / 2 - 80, y, "-", () => (set(Math.max(0, Math.round((get() - 0.1) * 10) / 10)), draw()), { w: 44, h: 38, size: 26, color: "grey" }).setDepth(D + 2));
    add(button(scene, W / 2 + 180, y, "+", () => (set(Math.min(1, Math.round((get() + 0.1) * 10) / 10)), draw()), { w: 44, h: 38, size: 26, color: "grey" }).setDepth(D + 2));
  };
  meter(t("Music"), 112, () => audio.musicVolume, (v) => {
    audio.setMusicVolume(v);
    session.profile.musicVolume = v;
    session.saveProfile();
  });
  meter(t("Effects"), 154, () => audio.sfxVolume, (v) => {
    audio.sfxVolume = v;
    session.profile.sfxVolume = v;
    session.saveProfile();
    audio.sfx("coin", 0.6);
  });

  const toggle = (name: string, y: number, get: () => boolean, set: (v: boolean) => void, on = t("On"), off = t("Off")) => {
    label(name, y);
    const b = add(button(scene, W / 2 + 50, y, get() ? on : off, () => {
      set(!get());
      b.setLabel(get() ? on : off);
    }, { w: 150, h: 40, size: 22, color: "blue" }).setDepth(D + 2)) as Button;
  };
  toggle(t("Sound"), 196, () => !audio.muted, (v) => {
    audio.setMuted(!v);
    session.profile.muted = !v;
    session.saveProfile();
  });
  toggle(t("Screen shake"), 238, () => session.profile.shake, (v) => {
    session.profile.shake = v;
    session.saveProfile();
  });

  label(t("Battle speed"), 280);
  const speed = add(button(scene, W / 2 + 50, 280, `x${session.profile.speed}`, () => {
    session.profile.speed = session.profile.speed === 1 ? 2 : session.profile.speed === 2 ? 4 : 1;
    session.saveProfile();
    speed.setLabel(`x${session.profile.speed}`);
  }, { w: 150, h: 40, size: 22, color: "blue" }).setDepth(D + 2)) as Button;

  label(t("Language"), 322);
  add(button(scene, W / 2 + 50, 322, LANG_NAMES[getLang()], () => {
    const next = LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length]!;
    setLang(next);
    document.documentElement.lang = next;
    session.profile.lang = next;
    session.saveProfile();
    // every scene draws its words once, so draw this one again in the new language
    close();
    scene.scene.restart();
  }, { w: 150, h: 40, size: 20, color: "blue" }).setDepth(D + 2));

  // saves: nothing leaves the browser unless the player takes it
  label(t("Your save"), 372);
  add(button(scene, W / 2 + 12, 372, t("Export"), () => {
    const day = new Date().toISOString().slice(0, 10);
    downloadText(`beast-tourney-save-${day}.json`, buildSave(session.profile, session.run));
    toast(scene, t("Save exported. Keep the file safe."), COLOR.green);
  }, { w: 130, h: 40, size: 20, color: "green" }).setDepth(D + 2));
  add(button(scene, W / 2 + 162, 372, t("Import"), () => {
    pickTextFile(".json,application/json", (content) => {
      const imported = parseSave(content);
      if (!imported.ok) return toast(scene, imported.error);
      const when = imported.exported ? ` (${imported.exported.slice(0, 10)})` : "";
      confirmBox(scene, t("Replace your progress with this save{when}? What you have now will be lost.", { when }), t("Replace"), t("Keep mine"), () => {
        session.restore(imported.profile, imported.run);
        window.location.reload();
      }, D + 500);
    });
  }, { w: 130, h: 40, size: 20, color: "yellow" }).setDepth(D + 2));
  if (!store.persistent) add(text(scene, W / 2, 412, t("Your browser is not keeping saves. Export your save to keep it."), 15, COLOR.red, { align: "center", wordWrap: { width: 580 } }).setOrigin(0.5).setDepth(D + 2));

  let creditsOpen = false;
  const onEsc = (): void => {
    if (!creditsOpen) close(); // the credits close themselves with the same key
  };
  const close = () => {
    scene.input.keyboard?.off("keydown-ESC", onEsc);
    for (const o of objects) o.destroy();
    onClose?.();
  };
  add(button(scene, W / 2 - 110, 466, t("Credits"), () => {
    creditsOpen = true;
    overlay(scene, "Credits", CREDITS_LINES, () => (creditsOpen = false), 760, D + 100);
  }, { w: 190, h: 46, size: 22, color: "grey" }).setDepth(D + 2));
  add(button(scene, W / 2 + 110, 466, t("Done"), close, { w: 190, h: 46, size: 24, color: "green" }).setDepth(D + 2));
  scene.input.keyboard?.on("keydown-ESC", onEsc);
}

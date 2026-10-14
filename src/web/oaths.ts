import Phaser from "phaser";

import { OATHS } from "../engine/data.js";
import { COLOR, H, W, button, panel, text, type Button } from "./ui.js";

/**
 * The oaths panel: toggle the vows to take on the next run. `taken` is edited in place and
 * `onClose` is called with it once the panel is put away.
 */
export function openOaths(scene: Phaser.Scene, taken: string[], onClose: () => void): void {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const D = 2000;
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    objects.push(o);
    return o;
  };
  add(scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setDepth(D).setInteractive());
  add(panel(scene, W / 2 - 370, 20, 740, 500, "ui_ancient_brown").setDepth(D + 1));
  add(text(scene, W / 2, 58, "Oaths", 38, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 8 }).setOrigin(0.5).setDepth(D + 2));
  add(text(scene, W / 2, 96, "Vows that make the run harder. Win the tournament under them for trophies.", 17, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 3 }).setOrigin(0.5).setDepth(D + 2));

  const buttons = new Map<string, Button>();
  const label = (id: string) => (taken.includes(id) ? "Sworn" : "Swear");
  OATHS.forEach((o, i) => {
    const y = 148 + i * 60;
    add(scene.add.image(W / 2 - 330, y, "dungeon", o.icon).setScale(2.6).setTint(0xff8a80).setDepth(D + 2));
    add(text(scene, W / 2 - 296, y - 15, o.name, 22, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(D + 2));
    add(text(scene, W / 2 - 296, y + 12, o.text, 16, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 3, wordWrap: { width: 470 } }).setOrigin(0, 0.5).setDepth(D + 2));
    const b = add(button(scene, W / 2 + 290, y, label(o.id), () => {
      const at = taken.indexOf(o.id);
      if (at >= 0) taken.splice(at, 1);
      else taken.push(o.id);
      b.setLabel(label(o.id));
      b.setAlpha(taken.includes(o.id) ? 1 : 0.7);
    }, { w: 120, h: 42, size: 20, color: "red" }).setDepth(D + 2)) as Button;
    b.setAlpha(taken.includes(o.id) ? 1 : 0.7);
    buttons.set(o.id, b);
  });

  const close = () => {
    scene.input.keyboard?.off("keydown-ESC", close);
    for (const o of objects) o.destroy();
    onClose();
  };
  add(button(scene, W / 2, 478, "Done", close, { w: 200, h: 46, size: 24, color: "green" }).setDepth(D + 2));
  scene.input.keyboard?.on("keydown-ESC", close);
}

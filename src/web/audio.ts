/** Music and sound effects on top of Phaser's sound manager. Browsers refuse audio before a gesture, so everything is queued until the first one. */

import Phaser from "phaser";

export const MUSIC = ["menu", "shop", "shop2", "battle", "boss", "victory", "defeat"] as const;
export type MusicKey = (typeof MUSIC)[number];
export const SFX = [
  "hit_heavy", "hit", "hit_soft", "clang", "clang_heavy", "bell", "wood", "glass", "coins", "coin", "draw", "flip", "cloth", "latch", "slice", "book",
  "click", "confirm", "error", "drop", "select", "pluck", "back", "bong", "toggle", "scratch", "open", "levelup",
] as const;
export type SfxKey = (typeof SFX)[number];

export class Audio {
  private current: Phaser.Sound.BaseSound | null = null;
  private currentKey: MusicKey | null = null;
  muted = false;
  musicVolume = 0.5;
  sfxVolume = 0.8;

  constructor(private readonly game: Phaser.Game) {}

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.game.sound.mute = muted;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Phaser.Math.Clamp(v, 0, 1);
    if (this.current && "setVolume" in this.current) (this.current as Phaser.Sound.WebAudioSound).setVolume(this.musicVolume);
  }

  /** Crossfade to a track; asking for the one already playing does nothing. */
  music(key: MusicKey, loop = true): void {
    if (this.currentKey === key && this.current?.isPlaying) return;
    const scene = this.game.scene.getScenes(true)[0];
    const old = this.current;
    this.currentKey = key;
    if (old) {
      if (scene) scene.tweens.add({ targets: old, volume: 0, duration: 500, onComplete: () => old.destroy() });
      else old.destroy();
    }
    if (!this.game.cache.audio.exists(key)) return;
    const next = this.game.sound.add(key, { loop, volume: 0 });
    this.current = next;
    next.play();
    if (scene) scene.tweens.add({ targets: next, volume: this.musicVolume, duration: 700 });
    else (next as Phaser.Sound.WebAudioSound).setVolume(this.musicVolume);
  }

  stopMusic(): void {
    this.current?.destroy();
    this.current = null;
    this.currentKey = null;
  }

  sfx(key: SfxKey, volume = 0.6, rate = 1): void {
    if (!this.game.cache.audio.exists(key)) return;
    this.game.sound.play(key, { volume: volume * this.sfxVolume * 1.25, rate: rate * (0.95 + Math.random() * 0.1) });
  }
}

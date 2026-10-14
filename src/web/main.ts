import Phaser from "phaser";

import { Audio } from "./audio.js";
import { Battle } from "./battle.js";
import { Bestiary } from "./bestiary.js";
import { Boon } from "./boon.js";
import { Boot } from "./boot.js";
import { End } from "./end.js";
import { Menu } from "./menu.js";
import { Session } from "./session.js";
import { Shop } from "./shop.js";
import { Trophies } from "./trophies.js";
import { H, W } from "./ui.js";

const session = new Session();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: W,
  height: H,
  backgroundColor: "#14101f",
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2 },
  scene: [Boot, Menu, Shop, Battle, Boon, End, Bestiary, Trophies],
  banner: false,
});

const audio = new Audio(game);
audio.setMuted(session.profile.muted);
audio.setMusicVolume(session.profile.musicVolume);
audio.sfxVolume = session.profile.sfxVolume;
game.registry.set("session", session);
game.registry.set("audio", audio);

// Debug and test hook: ?debug exposes the game for the end-to-end tests.
if (new URLSearchParams(window.location.search).has("debug")) {
  (window as unknown as Record<string, unknown>).__tourney = { game, session, audio };
}

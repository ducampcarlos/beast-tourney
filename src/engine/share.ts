/**
 * The text that is copied when a run ends: a one-line verdict and a trail of coloured squares,
 * one per round (green win, blue boss win, yellow draw, red loss).
 */
import { oath } from "./data.js";
import type { Run } from "./run.js";
import { t } from "../i18n/index.js";

export function roundTrail(history: Run["history"]): string {
  return history
    .map((h) => (h.outcome === "win" ? (h.boss ? "🟦" : "🟩") : h.outcome === "draw" ? "🟨" : "🟥"))
    .join("");
}

export function shareText(run: Run): string {
  const won = run.phase === "won";
  const wins = run.history.filter((h) => h.outcome === "win").length;
  const verdict = run.endless ? t("Endless depth {round}", { round: run.round }) : won ? t("Champion") : t("Out in round {round}", { round: run.round });
  const vows = run.oaths.length > 0 ? t(", oaths: {names}", { names: run.oaths.map((id) => t(oath(id).name)).join(" + ") }) : "";
  return `${t("Beast Tourney - {difficulty}, seed {seed}", { difficulty: t(run.difficulty), seed: run.seed })}${vows}\n${t("{verdict} - {wins} rounds won, {lives} lives left", { verdict, wins, lives: run.lives })}\n${roundTrail(run.history)}`;
}

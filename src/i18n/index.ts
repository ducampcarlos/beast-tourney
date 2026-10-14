/**
 * Translation. The English text in the code is the key: `t("Not enough gold.")` returns the
 * translation for the current language, or the English itself when there is none. Placeholders
 * are written `{name}` and filled from the second argument. Nothing here touches the browser,
 * so the engine and the tests can use it too.
 */

import { ES } from "./es.js";
import { PT } from "./pt.js";

export const LANGS = ["en", "es", "pt"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAMES: Record<Lang, string> = { en: "English", es: "Español", pt: "Português" };

const DICTIONARIES: Record<Exclude<Lang, "en">, Readonly<Record<string, string>>> = { es: ES, pt: PT };

let current: Lang = "en";

export const getLang = (): Lang => current;
export const setLang = (lang: Lang): void => {
  current = lang;
};
export const isLang = (value: unknown): value is Lang => typeof value === "string" && (LANGS as readonly string[]).includes(value);

/** The first of the browser's preferred languages that the game speaks ("es-AR" is Spanish), else English. */
export function detectLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0]!;
    if (isLang(base)) return base;
  }
  return "en";
}

export type Vars = Readonly<Record<string, string | number>>;

export function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Is there a translation of this English text in that language? */
export const hasTranslation = (lang: Lang, source: string): boolean => lang === "en" || Object.prototype.hasOwnProperty.call(DICTIONARIES[lang], source);

export function translate(lang: Lang, source: string, vars?: Vars): string {
  const text = lang === "en" || !hasTranslation(lang, source) ? source : DICTIONARIES[lang][source]!;
  return fill(text, vars);
}

export const t = (source: string, vars?: Vars): string => translate(current, source, vars);

/** `one` when n is 1, `many` otherwise; `{n}` is filled in. */
export const tn = (n: number, one: string, many: string, vars?: Vars): string => t(n === 1 ? one : many, { n, ...vars });

/** "Knight" for the id "knight", in the current language. */
export const rankName = (difficulty: string): string => t(`${difficulty[0]!.toUpperCase()}${difficulty.slice(1)}`);

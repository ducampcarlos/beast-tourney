/**
 * Lists the texts that have no translation yet in a language, as JSON: [{ key, note }].
 *
 *   node --import tsx scripts/i18n-missing.ts es
 */
import { hasTranslation, isLang } from "../src/i18n/index.js";
import { allKeys } from "../tests/support/i18nKeys.js";

const lang = process.argv[2];
if (!isLang(lang) || lang === "en") throw new Error("usage: i18n-missing.ts es|pt");
const missing = allKeys().filter((e) => !hasTranslation(lang, e.key));
console.log(JSON.stringify(missing, null, 1));

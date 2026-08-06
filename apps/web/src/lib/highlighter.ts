import { createHighlighter, type Highlighter, bundledLanguages } from "shiki";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import { CODE_HIGHLIGHT_THEMES } from "@/lib/code-theme";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    // The JavaScript regex engine, not Oniguruma. The packaged Tauri app runs
    // under `script-src 'self'` with no 'wasm-unsafe-eval', which blocks the
    // WASM engine shiki would otherwise pull in. `forgiving` makes the engine
    // skip patterns it can't translate instead of throwing.
    const promise = createHighlighter({
      themes: CODE_HIGHLIGHT_THEMES.list,
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
    // Never cache a rejection — otherwise one failure blanks every editor for
    // the rest of the session.
    promise.catch(() => {
      if (highlighterPromise === promise) highlighterPromise = null;
    });
    highlighterPromise = promise;
  }
  return highlighterPromise;
}

const loadingLanguages = new Map<string, Promise<void>>();

export function isBundledLanguage(lang: string): boolean {
  return lang in bundledLanguages;
}

async function ensureLanguage(h: Highlighter, lang: string): Promise<void> {
  if (h.getLoadedLanguages().includes(lang)) return;
  if (!isBundledLanguage(lang)) return;

  const existing = loadingLanguages.get(lang);
  if (existing) {
    await existing;
    return;
  }

  const promise = h
    .loadLanguage(lang as keyof typeof bundledLanguages)
    .then(() => undefined)
    // Clear on failure too, so a transient grammar error doesn't poison the
    // language for the rest of the session.
    .finally(() => {
      loadingLanguages.delete(lang);
    });
  loadingLanguages.set(lang, promise);
  await promise;
}

export async function highlightCode(
  code: string,
  lang: string,
): Promise<string | null> {
  if (lang === "plaintext" || !isBundledLanguage(lang)) return null;

  const h = await getHighlighter();
  await ensureLanguage(h, lang);

  return h.codeToHtml(code, {
    lang,
    themes: {
      dark: CODE_HIGHLIGHT_THEMES.dark,
      light: CODE_HIGHLIGHT_THEMES.light,
    },
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

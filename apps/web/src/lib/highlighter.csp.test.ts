import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * The packaged Tauri app runs under `script-src 'self'` with no
 * 'wasm-unsafe-eval', so any WebAssembly compilation throws. Shiki's default
 * Oniguruma engine is WASM-based, which is what silently blanked the Workspace
 * and Toolbox editors.
 *
 * This test makes every WebAssembly entry point throw — the way the webview
 * behaves under the CSP — and asserts highlighting still works. It deliberately
 * does NOT mock shiki, so it exercises the real engine selection.
 */

const original = globalThis.WebAssembly;

beforeAll(() => {
  const blocked = () => {
    throw new Error("WebAssembly blocked by Content Security Policy");
  };
  // Matches the shape of a CSP-blocked WebAssembly namespace.
  Object.defineProperty(globalThis, "WebAssembly", {
    configurable: true,
    writable: true,
    value: new Proxy(
      {},
      {
        get: () => blocked,
        has: () => true,
      },
    ),
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, "WebAssembly", {
    configurable: true,
    writable: true,
    value: original,
  });
});

describe("highlightCode under a WASM-blocking CSP", () => {
  it("highlights TypeScript without touching WebAssembly", async () => {
    const { highlightCode } = await import("./highlighter");

    const html = await highlightCode("const a = 1;", "typescript");

    expect(html).toBeTruthy();
    expect(html).toContain("const");
    // Real Shiki output, not the plaintext fallback the editors apply on error.
    expect(html).toContain("shiki");
  });

  it("returns null for plaintext rather than throwing", async () => {
    const { highlightCode } = await import("./highlighter");
    await expect(highlightCode("hello", "plaintext")).resolves.toBeNull();
  });
});

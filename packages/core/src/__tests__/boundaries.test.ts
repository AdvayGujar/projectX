import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural rules that review alone tends to miss. These read the source tree, so they fail
 * as soon as someone reaches past a module's public entry.
 */

const repoRoot = join(import.meta.dirname, "../../../..");
const coreSrc = join(repoRoot, "packages/core/src");
const mobileSrc = join(repoRoot, "apps/mobile");

const IMPORT = /from\s+["']([^"']+)["']/g;

describe("module boundaries", () => {
  it("keeps apps/mobile out of deep package paths", () => {
    const offenders = filesUnder(mobileSrc)
      .flatMap((file) => importsOf(file).map((specifier) => ({ file, specifier })))
      .filter(({ specifier }) => isDeepPackageImport(specifier))
      .map(({ file, specifier }) => `${relative(repoRoot, file)} -> ${specifier}`);

    expect(offenders).toEqual([]);
  });

  it("makes core modules reach each other through their entry", () => {
    const modules = ["db", "documents", "engine", "providers", "tools"] as const;
    const offenders = filesUnder(coreSrc)
      .filter((file) => !relative(coreSrc, file).startsWith("__tests__"))
      .flatMap((file) => importsOf(file).map((specifier) => ({ file, specifier })))
      .filter(({ file, specifier }) => isDeepCoreImport(file, specifier, modules))
      .map(({ file, specifier }) => `${relative(coreSrc, file)} -> ${specifier}`);

    expect(offenders).toEqual([]);
  });
});

function isDeepPackageImport(specifier: string): boolean {
  if (specifier.startsWith("@projectx/core/") || specifier.startsWith("@projectx/ui/")) {
    return true;
  }
  return specifier.includes("packages/core/src") || specifier.includes("packages/ui/src");
}

function isDeepCoreImport(
  file: string,
  specifier: string,
  modules: readonly string[],
): boolean {
  if (!specifier.startsWith("../")) {
    return false;
  }
  const ownModule = modules.find((name) => file.includes(`/src/${name}/`));
  if (!ownModule) {
    return false;
  }
  const target = specifier.slice(3);
  return modules.some(
    (name) => name !== ownModule && (target === name || target.startsWith(`${name}/`))
      ? target !== name && target !== `${name}/index`
      : false,
  );
}

function filesUnder(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : filesUnder(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(IMPORT)].map((match) => match[1] ?? "");
}

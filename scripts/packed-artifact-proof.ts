import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const artifacts = join(root, "artifacts");

const run = (command: readonly string[], cwd: string): string => {
  const result = Bun.spawnSync({ cmd: [...command], cwd, stdout: "pipe", stderr: "pipe" });
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);
  if (result.exitCode !== 0) throw new Error(`${command.join(" ")} failed: ${stderr || stdout}`);
  return stdout;
};

const pack = (packageDirectory: string, filename: string) => {
  mkdirSync(artifacts, { recursive: true });
  const output = run(["bun", "pm", "pack", "--destination", artifacts, "--quiet"], packageDirectory).trim();
  const generated = output.length > 0 ? output.split("\n").at(-1) : undefined;
  return generated === undefined ? join(artifacts, filename) : resolve(generated);
};

const listTarball = (tarball: string): readonly string[] =>
  run(["tar", "-tzf", tarball], root)
    .trim()
    .split("\n")
    .filter((entry) => entry.length > 0);

const readTarPackage = (tarball: string): Record<string, unknown> =>
  JSON.parse(run(["tar", "-xOzf", tarball, "package/package.json"], root)) as Record<string, unknown>;

const assertIncludes = (entries: readonly string[], required: readonly string[], label: string) => {
  for (const path of required) {
    if (!entries.includes(`package/${path}`)) throw new Error(`${label} is missing package/${path}`);
  }
};

const assertExports = (manifest: Record<string, unknown>, expected: readonly string[], label: string) => {
  const exports = manifest.exports;
  if (typeof exports !== "object" || exports === null) throw new Error(`${label} has no packed exports`);
  const keys = Object.keys(exports).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} packed export keys do not match: ${keys.join(",")}`);
  }
  for (const key of expected) {
    const descriptor = (exports as Record<string, unknown>)[key];
    if (typeof descriptor !== "object" || descriptor === null)
      throw new Error(`${label}${key} is not conditional`);
    const conditions = descriptor as Record<string, unknown>;
    for (const condition of ["@unteam/source", "types", "default"]) {
      if (typeof conditions[condition] !== "string") throw new Error(`${label}${key} lacks ${condition}`);
    }
  }
};

const coreTarball = pack(join(root, "packages/emulator-core"), "unteam-emulator-core-0.1.0.tgz");
const bunTarball = pack(join(root, "packages/emulator-bun"), "unteam-emulator-bun-0.1.0.tgz");
const coreEntries = listTarball(coreTarball);
const bunEntries = listTarball(bunTarball);
const coreManifest = readTarPackage(coreTarball);
const bunManifest = readTarPackage(bunTarball);

assertExports(
  coreManifest,
  [".", "./errors", "./fixtures", "./live", "./observations", "./schemas", "./service", "./test"],
  "core",
);
assertExports(bunManifest, [".", "./server"], "bun");
assertIncludes(
  coreEntries,
  [
    "dist/index.js",
    "dist/index.d.ts",
    "src/index.ts",
    "dist/schemas.js",
    "dist/schemas.d.ts",
    "src/schemas.ts",
    "dist/test.layer.js",
    "dist/test.layer.d.ts",
    "src/test.layer.ts",
    "dist/fixtures.js",
    "dist/observations.js",
  ],
  "core",
);
assertIncludes(
  bunEntries,
  [
    "dist/index.js",
    "dist/index.d.ts",
    "src/index.ts",
    "dist/server.layer.js",
    "dist/server.layer.d.ts",
    "src/server.layer.ts",
  ],
  "bun",
);

const consumer = mkdtempSync(join(tmpdir(), "unteam-packed-consumer-"));
try {
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "unteam-packed-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@effect/platform-bun": "4.0.0-beta.100",
          "@unteam/emulator-bun": `file:${bunTarball}`,
          "@unteam/emulator-core": `file:${coreTarball}`,
          effect: "4.0.0-beta.100",
        },
        overrides: {
          "@unteam/emulator-core": `file:${coreTarball}`,
        },
        devDependencies: { typescript: "7.0.2" },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(consumer, "consumer.ts"),
    `import { Effect, Schema } from "effect";
import { makeTeamsEmulatorServer } from "@unteam/emulator-bun";
import { makeTeamsEmulatorServer as serverEntry } from "@unteam/emulator-bun/server";
import { exampleScenario } from "@unteam/emulator-core/fixtures";
import { ObservationV1 } from "@unteam/emulator-core/observations";
import { TeamsEmulator } from "@unteam/emulator-core/service";
import { ScenarioV1 } from "@unteam/emulator-core/schemas";
void makeTeamsEmulatorServer; void serverEntry; void exampleScenario; void ObservationV1; void TeamsEmulator; void ScenarioV1;
const program = Effect.scoped(Effect.gen(function* () { const server = yield* makeTeamsEmulatorServer(); return server.origin.href; }));
await Effect.runPromise(program);
`,
  );
  run(["bun", "install", "--no-progress"], consumer);
  run(
    [
      "bun",
      "x",
      "tsc",
      "--noEmit",
      "--moduleResolution",
      "bundler",
      "--module",
      "esnext",
      "--target",
      "es2022",
      "--lib",
      "esnext,esnext.disposable,dom",
      "consumer.ts",
    ],
    consumer,
  );
  run(["bun", "consumer.ts"], consumer);
  run(
    [
      "bun",
      "--conditions",
      "@unteam/source",
      "-e",
      "import('@unteam/emulator-core/schemas').then(() => import('@unteam/emulator-bun/server'))",
    ],
    consumer,
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}

process.stdout.write(
  JSON.stringify({
    proofVersion: "packed-artifact.v1",
    packages: [coreTarball, bunTarball].map((path) => path.replace(`${root}/`, "")),
    checks: [
      "tarball-files",
      "conditional-exports",
      "typescript-declarations",
      "runtime-imports",
      "@unteam/source-condition",
    ],
  }) + "\n",
);

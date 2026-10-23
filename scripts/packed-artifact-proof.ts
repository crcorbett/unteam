import { BunServices } from "@effect/platform-bun";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import { Array, Effect, Equal, FileSystem, Function, HashSet, Path, Schema, Stdio, Stream } from "effect";
import { ChildProcess } from "effect/process";

class PackedProofError extends Schema.TaggedError<PackedProofError, { readonly brand: unique symbol }>()(
  "PackedProofError",
  { reason: Schema.String },
) {}
const run = Effect.fnUntraced(function* (input: {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
}) {
  const child = yield* ChildProcess.make(input.executable, input.args, {
    cwd: input.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = yield* Effect.all(
    [
      child.stdout.pipe(Stream.decodeText(), Stream.mkString),
      child.stderr.pipe(Stream.decodeText(), Stream.mkString),
      child.exitCode,
    ],
    { concurrency: "unbounded" },
  );
  if (Number(code) !== 0)
    return yield* new PackedProofError({ reason: `${input.executable} failed: ${stderr || stdout}` });
  return stdout;
});
const PackedManifest = Schema.Struct({
  exports: Schema.Record(
    Schema.String,
    Schema.Struct({ "@unteam/source": Schema.String, types: Schema.String, default: Schema.String }),
  ),
});
const ConsumerManifest = Schema.Struct({
  name: Schema.String,
  private: Schema.Boolean,
  type: Schema.Literal("module"),
  dependencies: Schema.Record(Schema.String, Schema.String),
  overrides: Schema.Record(Schema.String, Schema.String),
  devDependencies: Schema.Record(Schema.String, Schema.String),
});
const Proof = Schema.Struct({
  proofVersion: Schema.Literal("packed-artifact.v1"),
  packages: Schema.Array(Schema.String),
  checks: Schema.Array(Schema.String),
});

const verifyArchive = Effect.fnUntraced(function* (input: {
  readonly root: string;
  readonly directory: string;
  readonly exports: readonly string[];
  readonly files: readonly string[];
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const artifacts = path.join(input.root, "artifacts");
  yield* fs.makeDirectory(artifacts, { recursive: true });
  const output = yield* run({
    executable: "bun",
    args: ["pm", "pack", "--destination", artifacts, "--quiet"],
    cwd: path.join(input.root, input.directory),
  });
  const generated = yield* Function.pipe(
    output.trim().split("\n"),
    Array.last,
    Effect.fromOption(() => new PackedProofError({ reason: "Pack did not return an archive path" })),
  );
  const archive = path.resolve(input.root, input.directory, generated);
  const listing = yield* run({ executable: "tar", args: ["-tzf", archive], cwd: input.root });
  const entries = HashSet.fromIterable(listing.trim().split("\n"));
  yield* Effect.forEach(input.files, (file) => {
    if (HashSet.has(entries, `package/${file}`)) return Effect.void;
    return Effect.fail(new PackedProofError({ reason: `${input.directory} is missing ${file}` }));
  });
  const manifestText = yield* run({
    executable: "tar",
    args: ["-xOzf", archive, "package/package.json"],
    cwd: input.root,
  });
  const manifest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PackedManifest))(manifestText);
  if (!Equal.equals(HashSet.fromIterable(Object.keys(manifest.exports)), HashSet.fromIterable(input.exports)))
    return yield* new PackedProofError({ reason: `${input.directory} packed exports differ` });
  return archive;
});

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stdio = yield* Stdio.Stdio;
  const root = yield* path.fromFileUrl(new URL("../", import.meta.url));
  const coreTarball = yield* verifyArchive({
    root,
    directory: "packages/emulator-core",
    exports: [
      ".",
      "./events",
      "./errors",
      "./fixtures",
      "./live",
      "./observations",
      "./schemas",
      "./service",
      "./test",
    ],
    files: [
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
  });
  const bunTarball = yield* verifyArchive({
    root,
    directory: "packages/emulator-bun",
    exports: [".", "./server", "./traffic-log"],
    files: [
      "dist/index.js",
      "dist/index.d.ts",
      "src/index.ts",
      "dist/server.layer.js",
      "dist/server.layer.d.ts",
      "src/server.layer.ts",
    ],
  });
  const clientTarball = yield* verifyArchive({
    root,
    directory: "packages/client",
    exports: ["./schemas", "./errors", "./service", "./live", "./test"],
    files: [
      "dist/schemas.js",
      "dist/schemas.d.ts",
      "dist/service.js",
      "dist/service.d.ts",
      "dist/live.layer.js",
      "dist/live.layer.d.ts",
      "dist/test.layer.js",
      "dist/test.layer.d.ts",
    ],
  });
  const consumer = yield* fs.makeTempDirectoryScoped({ prefix: "unteam-packed-consumer-" });
  const manifest = yield* Schema.encodeEffect(Schema.fromJsonString(ConsumerManifest))({
    name: "unteam-packed-consumer",
    private: true,
    type: "module",
    dependencies: {
      "@effect/platform-bun": "4.0.5",
      "@unteam/emulator-bun": `file:${bunTarball}`,
      "@unteam/client": `file:${clientTarball}`,
      "@unteam/emulator-core": `file:${coreTarball}`,
      effect: "4.0.5",
    },
    overrides: { "@unteam/emulator-core": `file:${coreTarball}`, "@effect/platform-node-shared": "4.0.5" },
    devDependencies: { typescript: "7.0.2" },
  });
  yield* fs.writeFileString(path.join(consumer, "package.json"), manifest);
  yield* fs.writeFileString(
    path.join(consumer, "consumer.ts"),
    `import { Effect, Schema } from "effect";
import { makeTeamsEmulatorServer } from "@unteam/emulator-bun";
import { makeTeamsEmulatorServer as serverEntry } from "@unteam/emulator-bun/server";
import { exampleScenario } from "@unteam/emulator-core/fixtures";
import { ObservationV1 } from "@unteam/emulator-core/observations";
import { TrafficEvent } from "@unteam/emulator-core/events";
import { TrafficLog, TrafficLogLive } from "@unteam/emulator-bun/traffic-log";
import { TeamsEmulator } from "@unteam/emulator-core/service";
import { ScenarioV1 } from "@unteam/emulator-core/schemas";
import { UnteamClient } from "@unteam/client/service";
import { UnteamClientLive } from "@unteam/client/live";
import { UnteamReadyV2 } from "@unteam/client/schemas";
void TrafficEvent; void TrafficLog; void TrafficLogLive;
void makeTeamsEmulatorServer; void serverEntry; void exampleScenario; void ObservationV1; void TeamsEmulator; void ScenarioV1; void UnteamClient; void UnteamClientLive; void UnteamReadyV2;
const program = Effect.scoped(Effect.gen(function* () { const server = yield* makeTeamsEmulatorServer(); return server.origin.href; }));
await Effect.runPromise(program);
`,
  );
  yield* run({ executable: "bun", args: ["install", "--no-progress"], cwd: consumer });
  yield* run({
    executable: "bun",
    args: [
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
      "--skipLibCheck",
      "consumer.ts",
    ],
    cwd: consumer,
  });
  yield* run({ executable: "bun", args: ["consumer.ts"], cwd: consumer });
  yield* run({
    executable: "bun",
    args: [
      "--conditions",
      "@unteam/source",
      "-e",
      "import('@unteam/emulator-core/schemas').then(() => import('@unteam/emulator-bun/server')).then(() => import('@unteam/client/live'))",
    ],
    cwd: consumer,
  });
  const receipt = yield* Schema.encodeEffect(Schema.fromJsonString(Proof))({
    proofVersion: "packed-artifact.v1",
    packages: Function.pipe(
      [coreTarball, bunTarball, clientTarball],
      Array.map((archive) => path.relative(root, archive)),
    ),
    checks: [
      "tarball-files",
      "conditional-exports",
      "typescript-consumption-with-upstream-lib-check-skipped",
      "runtime-imports",
      "@unteam/source-condition",
    ],
  });
  yield* Stream.make(`${receipt}\n`).pipe(Stream.run(stdio.stdout()));
});
BunRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(BunServices.layer)));

import { BunServices } from "@effect/platform-bun";
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import * as BunSocket from "@effect/platform-bun/BunSocket";
import { assert, describe, it } from "@effect/vitest";
import { ServerPort } from "@unteam/emulator-bun";
import { EmulatorSnapshotV1 } from "@unteam/emulator-core";
import { Deferred, Effect, Exit, Fiber, Option, Schema, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { ChildProcess } from "effect/unstable/process";

import { UnteamDiagnosticV1, UnteamReadyV2 } from "../src/schemas";

const cliExecutablePath = new URL("../../../artifacts/unteam", import.meta.url).pathname;
const validScenarioPath = new URL("./fixtures/scenario.json", import.meta.url).pathname;
const excessScenarioPath = new URL("./fixtures/scenario-excess.json", import.meta.url).pathname;
const wrongVersionScenarioPath = new URL("./fixtures/scenario-wrong-version.json", import.meta.url).pathname;
const malformedScenarioPath = new URL("./fixtures/scenario-malformed.txt", import.meta.url).pathname;
const decodeReadiness = Schema.decodeUnknownEffect(Schema.fromJsonString(UnteamReadyV2));
const decodeDiagnostic = Schema.decodeUnknownEffect(Schema.fromJsonString(UnteamDiagnosticV1));

const cliCommand = (arguments_: ReadonlyArray<string>) =>
  ChildProcess.make(cliExecutablePath, arguments_, {
    stdout: "pipe",
    stderr: "pipe",
    forceKillAfter: "2 seconds",
  });

const command = (scenarioPath: string, port: ServerPort) =>
  cliCommand(["--scenario", scenarioPath, "--port", String(port)]);

const allocateLoopbackPort = Effect.scoped(
  Effect.gen(function* () {
    const server = yield* BunHttpServer.make({ hostname: "127.0.0.1", port: 0 });
    if (server.address._tag !== "TcpAddress") {
      return yield* Effect.die("CLI test requires a TCP port");
    }
    return ServerPort.make(server.address.port);
  }),
);

const firstLine = (stream: Stream.Stream<Uint8Array, unknown>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runHead,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.die("expected one output line"),
        onSome: Effect.succeed,
      }),
    ),
    Effect.timeout("5 seconds"),
  );

const freshTcpProbe = (url: URL) =>
  Effect.scoped(
    Effect.gen(function* () {
      const socket = yield* BunSocket.makeNet({ host: url.hostname, port: Number(url.port) });
      const opened = yield* Deferred.make<void>();
      const fiber = yield* socket
        .run(() => undefined, { onOpen: Deferred.succeed(opened, undefined) })
        .pipe(Effect.forkChild);
      yield* Effect.raceFirst(Deferred.await(opened), Fiber.join(fiber));
      yield* Fiber.interrupt(fiber);
    }),
  );

const runOneProcess = (touchJwk: boolean, port: ServerPort) =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* command(validScenarioPath, port);
      const stderrFiber = yield* handle.stderr.pipe(Stream.decodeText(), Stream.mkString, Effect.forkScoped);
      const readinessLine = yield* firstLine(handle.stdout);
      const readiness = yield* decodeReadiness(readinessLine);
      const client = yield* HttpClient.HttpClient;
      const readinessResponse = yield* client.execute(
        HttpClientRequest.get(new URL("/ready", readiness.origin)),
      );
      const httpReadiness = yield* readinessResponse.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(UnteamReadyV2)),
      );
      const initialResponse = yield* client.execute(
        HttpClientRequest.get(new URL("snapshot", readiness.controlBaseUrl)),
      );
      const initial = yield* initialResponse.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(EmulatorSnapshotV1)),
      );
      if (touchJwk) {
        const jwkResponse = yield* client.execute(HttpClientRequest.get(readiness.jwkSetUrl));
        assert.strictEqual(jwkResponse.status, 200);
        yield* jwkResponse.arrayBuffer;
      }
      yield* handle.kill({ killSignal: "SIGTERM", forceKillAfter: "2 seconds" });
      yield* handle.exitCode.pipe(Effect.timeout("5 seconds"));
      const stderr = yield* Fiber.join(stderrFiber);
      const diagnostic = yield* decodeDiagnostic(stderr.trim());
      const afterClose = yield* freshTcpProbe(readiness.origin).pipe(Effect.exit);

      assert.strictEqual(readiness.readinessVersion, "unteam.ready.v2");
      assert.strictEqual(readiness.synthetic, true);
      assert.strictEqual(readiness.scenarioName, "cli-two-tenant-loopback");
      assert.strictEqual(httpReadiness.origin.href, readiness.origin.href);
      assert.strictEqual(httpReadiness.scenarioName, readiness.scenarioName);
      assert.strictEqual(readiness.connections.length, 2);
      assert.strictEqual(initial.protocol.jwkRequestCount, 0);
      assert.strictEqual(diagnostic.event, "started");
      assert.isFalse(readinessLine.includes("synthetic-cli-secret"));
      assert.isFalse(stderr.includes("synthetic-cli-secret"));
      assert.isFalse(stderr.includes(validScenarioPath));
      assert.isTrue(Exit.isFailure(afterClose));
      return initial;
    }),
  );

describe("unteam standalone CLI", () => {
  it.effect("renders help and rejects invalid scenarios without readiness or sensitive output", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const helpHandle = yield* cliCommand(["--help"]);
        const helpOutputFiber = yield* helpHandle.stdout.pipe(
          Stream.decodeText(),
          Stream.mkString,
          Effect.forkScoped,
        );
        const helpErrorFiber = yield* helpHandle.stderr.pipe(
          Stream.decodeText(),
          Stream.mkString,
          Effect.forkScoped,
        );
        const helpExit = yield* helpHandle.exitCode.pipe(Effect.timeout("5 seconds"));
        const helpOutput = yield* Fiber.join(helpOutputFiber);
        const helpError = yield* Fiber.join(helpErrorFiber);
        assert.strictEqual(Number(helpExit), 0);
        assert.isTrue(helpOutput.includes("--scenario file"));
        assert.isTrue(helpOutput.includes("--port integer"));
        assert.isFalse(helpOutput.includes("unteam.ready.v2"));
        assert.strictEqual(helpError, "");

        const port = yield* allocateLoopbackPort;
        const missingPath = "/tmp/unteam-scenario-that-does-not-exist.json";
        const outcomes = yield* Effect.forEach(
          [missingPath, malformedScenarioPath, wrongVersionScenarioPath, excessScenarioPath],
          (scenarioPath) =>
            Effect.gen(function* () {
              const handle = yield* command(scenarioPath, port);
              const stdoutFiber = yield* handle.stdout.pipe(
                Stream.decodeText(),
                Stream.mkString,
                Effect.forkScoped,
              );
              const stderrFiber = yield* handle.stderr.pipe(
                Stream.decodeText(),
                Stream.mkString,
                Effect.forkScoped,
              );
              const exitCode = yield* handle.exitCode.pipe(Effect.timeout("5 seconds"));
              return {
                exitCode,
                stdout: yield* Fiber.join(stdoutFiber),
                stderr: yield* Fiber.join(stderrFiber),
                scenarioPath,
              };
            }),
        );

        for (const outcome of outcomes) {
          assert.notStrictEqual(Number(outcome.exitCode), 0);
          assert.isFalse(outcome.stdout.includes("unteam.ready.v2"));
          assert.isFalse(outcome.stdout.includes(outcome.scenarioPath));
          assert.isFalse(outcome.stdout.includes("must-not-appear"));
          const diagnostic = yield* decodeDiagnostic(outcome.stderr.trim());
          assert.strictEqual(diagnostic.event, "startup-failed");
          assert.isFalse(outcome.stderr.includes(outcome.scenarioPath));
          assert.isFalse(outcome.stderr.includes("must-not-appear"));
        }
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("requires a valid unused loopback port", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const invalidArguments = [
          ["--scenario", validScenarioPath],
          ["--scenario", validScenarioPath, "--port", "0"],
          ["--scenario", validScenarioPath, "--port", "65536"],
        ];
        const invalid = yield* Effect.forEach(invalidArguments, (arguments_) =>
          Effect.gen(function* () {
            const handle = yield* cliCommand(arguments_);
            const stdoutFiber = yield* handle.stdout.pipe(
              Stream.decodeText(),
              Stream.mkString,
              Effect.forkScoped,
            );
            const stderrFiber = yield* handle.stderr.pipe(
              Stream.decodeText(),
              Stream.mkString,
              Effect.forkScoped,
            );
            const exitCode = yield* handle.exitCode.pipe(Effect.timeout("5 seconds"));
            return {
              exitCode,
              stdout: yield* Fiber.join(stdoutFiber),
              stderr: yield* Fiber.join(stderrFiber),
            };
          }),
        );
        for (const outcome of invalid) {
          assert.notStrictEqual(Number(outcome.exitCode), 0);
          assert.isFalse(outcome.stdout.includes("unteam.ready.v2"));
          assert.isFalse(outcome.stdout.includes("synthetic-cli-secret"));
          assert.strictEqual((yield* decodeDiagnostic(outcome.stderr.trim())).event, "startup-failed");
        }

        const occupied = yield* BunHttpServer.make({ hostname: "127.0.0.1", port: 0 });
        if (occupied.address._tag !== "TcpAddress") {
          return yield* Effect.die("CLI occupied-port test requires TCP");
        }
        const handle = yield* command(validScenarioPath, ServerPort.make(occupied.address.port));
        const stdoutFiber = yield* handle.stdout.pipe(
          Stream.decodeText(),
          Stream.mkString,
          Effect.forkScoped,
        );
        const stderrFiber = yield* handle.stderr.pipe(
          Stream.decodeText(),
          Stream.mkString,
          Effect.forkScoped,
        );
        const exitCode = yield* handle.exitCode.pipe(Effect.timeout("5 seconds"));
        assert.notStrictEqual(Number(exitCode), 0);
        assert.strictEqual(yield* Fiber.join(stdoutFiber), "");
        assert.strictEqual(
          (yield* decodeDiagnostic((yield* Fiber.join(stderrFiber)).trim())).event,
          "startup-failed",
        );
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("emits bounded readiness, serves HTTP, finalizes on SIGTERM, and starts fresh", () =>
    Effect.gen(function* () {
      const port = yield* allocateLoopbackPort;
      const first = yield* runOneProcess(true, port);
      const second = yield* runOneProcess(false, port);

      assert.strictEqual(first.snapshotVersion, "snapshot.v1");
      assert.strictEqual(second.protocol.jwkRequestCount, 0);
      assert.strictEqual(second.activeTokenCount, 0);
      assert.strictEqual(second.seenActivityCount, 0);
      assert.deepEqual(second.connectorRequests, []);
    }).pipe(Effect.provide(BunServices.layer), Effect.provide(FetchHttpClient.layer)),
  );

  it.effect("rejects non-loopback and wrong-version readiness values", () =>
    Effect.gen(function* () {
      const base = {
        readinessVersion: "unteam.ready.v2",
        synthetic: true,
        scenarioName: "scenario-a",
        origin: "http://127.0.0.1:1234/",
        issuerUrl: "http://127.0.0.1:1234/",
        openIdMetadataUrl: "http://127.0.0.1:1234/.well-known/openidconfiguration",
        jwkSetUrl: "http://127.0.0.1:1234/.well-known/keys",
        oauthTokenUrl: "http://127.0.0.1:1234/oauth2/v2.0/token",
        controlBaseUrl: "http://127.0.0.1:1234/control/",
        botAppId: "bot-a",
        connectorScope: "scope-a",
        connections: [{ connectionId: "connection-a", serviceUrl: "http://127.0.0.1:1234/connector/a/" }],
      };
      const wrongVersion = yield* Schema.decodeUnknownEffect(UnteamReadyV2)({
        ...base,
        readinessVersion: "unteam.ready.v1",
      }).pipe(Effect.exit);
      const publicOrigin = yield* Schema.decodeUnknownEffect(UnteamReadyV2)({
        ...base,
        origin: "https://example.invalid/",
      }).pipe(Effect.exit);

      assert.isTrue(Exit.isFailure(wrongVersion));
      assert.isTrue(Exit.isFailure(publicOrigin));
    }),
  );
});

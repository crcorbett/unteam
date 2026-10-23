import { BunServices } from "@effect/platform-bun";
import * as BunSocket from "@effect/platform-bun/BunSocket";
import { assert, describe, it } from "@effect/vitest";
import { ServerPort, ServerScenarioV1, UnteamReadyV2 } from "@unteam/emulator-bun";
import {
  ConfigProvider,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  PlatformError,
  Ref,
  Schema,
  Sink,
  Stdio,
  Stream,
} from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { runRuntime } from "../src/runtime";
const scenarioPath = new URL("./fixtures/scenario.json", import.meta.url).pathname;
describe("CLI recorder lifetime", () => {
  it.live(
    "stops the listening server when its required recorder fails after readiness",
    () => {
      return Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const directory = yield* fs.makeTempDirectoryScoped();
          const scenario = yield* fs
            .readFileString(scenarioPath)
            .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(ServerScenarioV1))));
          const writes = yield* Ref.make(0);
          const brokenFs = FileSystem.make({
            ...fs,
            open: (filePath, options) =>
              fs.open(filePath, options).pipe(
                Effect.map((file) => ({
                  ...file,
                  stat: file.stat,
                  sync: file.sync,
                  seek: (offset, from) => file.seek(offset, from),
                  read: (buffer, options) => file.read(buffer, options),
                  readAlloc: (size, options) => file.readAlloc(size, options),
                  truncate: (length) => file.truncate(length),
                  write: (buffer) => file.write(buffer),
                  writeAll: (bytes) =>
                    Ref.updateAndGet(writes, (count) => count + 1).pipe(
                      Effect.flatMap((count) => {
                        if (count > 2)
                          return Effect.fail(
                            PlatformError.systemError({
                              // PlatformError.systemError requires its reason tag in this native constructor.
                              // oxlint-disable-next-line effect/no-manual-tag
                              _tag: "PermissionDenied",
                              module: "FileSystem",
                              method: "writeAll",
                            }),
                          );
                        return file.writeAll(bytes);
                      }),
                    ),
                })),
              ),
          });
          const ready = yield* Deferred.make<UnteamReadyV2>();
          const stdio = Stdio.make({
            args: Effect.succeed([]),
            stdin: Stream.empty,
            stdout: () =>
              Sink.forEach((chunk: string | Uint8Array) =>
                Schema.decodeUnknownEffect(Schema.fromJsonString(UnteamReadyV2))(
                  (() => {
                    if (Schema.is(Schema.String)(chunk)) return chunk.trim();
                    return new TextDecoder().decode(chunk).trim();
                  })(),
                ).pipe(
                  Effect.flatMap((value) => Deferred.succeed(ready, value)),
                  Effect.asVoid,
                  Effect.orDie,
                ),
              ),
            stderr: () => Sink.drain,
          });
          const _input = ServerPort.make(0);
          const runtime = yield* runRuntime(scenario, _input).pipe(
            Effect.scoped,
            Effect.provideService(FileSystem.FileSystem, brokenFs),
            Effect.provideService(Stdio.Stdio, stdio),
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              ConfigProvider.fromUnknown({
                UNTEAM_LOG_DIRECTORY: directory,
              }),
            ),
            Effect.exit,
            Effect.forkChild,
          );
          const readiness = yield* Effect.raceFirst(
            Deferred.await(ready),
            Fiber.join(runtime).pipe(
              Effect.flatMap((exit) => {
                if (Exit.isFailure(exit)) return Effect.failCause(exit.cause);
                return Effect.die("Runtime exited without readiness");
              }),
            ),
          ).pipe(Effect.timeout("3 seconds"));
          const client = yield* HttpClient.HttpClient;
          yield* client
            .get(new URL("/ready", readiness.origin))
            .pipe(Effect.timeout("3 seconds"), Effect.exit);
          const exit = yield* Fiber.join(runtime).pipe(Effect.timeout("5 seconds"));
          assert.isTrue(Exit.isFailure(exit));
          const probe = yield* Effect.scoped(
            Effect.gen(function* () {
              const socket = yield* BunSocket.makeNet({
                host: readiness.origin.hostname,
                port: Number(readiness.origin.port),
              });
              yield* socket.reader;
            }),
          ).pipe(Effect.exit);
          assert.isTrue(Exit.isFailure(probe));
          assert.isAtLeast(yield* Ref.get(writes), 3);
        }),
      ).pipe(Effect.provide(FetchHttpClient.layer), Effect.provide(BunServices.layer));
    },
    15_000,
  );
});

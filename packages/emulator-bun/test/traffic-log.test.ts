import { BunServices } from "@effect/platform-bun";
import { assert, describe, it } from "@effect/vitest";
import {
  ConfigProvider,
  Context,
  Deferred,
  DateTime,
  Exit,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  PlatformError,
  Schema,
  Stream,
} from "effect";
import { TrafficEvent, TrafficRunId } from "@unteam/emulator-core/events";

import { TrafficLog, TrafficLogLive, formatTrafficEvent } from "../src/traffic-log";

describe("required traffic recorder", () => {
  it.effect("quotes terminal control characters in checked event fields", () =>
    Effect.sync(() => {
      const rendered = formatTrafficEvent(
        TrafficEvent.make({
          eventVersion: "unteam.event.v1",
          runId: TrafficRunId.make("terminal-test"),
          sequence: 1,
          timestamp: DateTime.makeUnsafe("2026-10-22T00:00:00Z"),
          data: { _tag: "Lifecycle", action: "started", scenario: "fixture\u001b[2J\ninjected" },
        }),
      );
      assert.isFalse(rendered.includes("\u001b"));
      assert.isFalse(rendered.includes("\n"));
      assert.include(rendered, "\\u001b[2J\\ninjected");
    }),
  );

  it.live("retains concurrent ordered records and catches up a slow reader from the file", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped();
        const services = yield* Layer.build(
          TrafficLogLive.pipe(
            Layer.provide(
              ConfigProvider.layer(ConfigProvider.fromUnknown({ UNTEAM_LOG_DIRECTORY: directory })),
            ),
          ),
        );
        const log = Context.get(services, TrafficLog);
        const first = yield* Deferred.make<void>();
        const resume = yield* Deferred.make<void>();
        const reader = yield* log.follow.pipe(
          Stream.tap((event) =>
            event.sequence === 1
              ? Deferred.succeed(first, undefined).pipe(Effect.andThen(Deferred.await(resume)))
              : Effect.void,
          ),
          Stream.take(102),
          Stream.runCollect,
          Effect.forkChild,
        );
        yield* log.events.record({ _tag: "Lifecycle", action: "started", scenario: "recorder-test" });
        yield* Deferred.await(first);
        yield* Effect.forEach(
          Array.from({ length: 100 }, (_, index) => index),
          () => log.events.record({ _tag: "Lifecycle", action: "reset", scenario: "recorder-test" }),
          { concurrency: 16 },
        );
        yield* log.events.record({ _tag: "Lifecycle", action: "stopped", scenario: "recorder-test" });
        yield* Deferred.succeed(resume, undefined);
        const read = yield* Fiber.join(reader);
        assert.deepEqual(
          read.map((event) => event.sequence),
          Array.from({ length: 102 }, (_, index) => index + 1),
        );
        const source = yield* fs.readFileString(log.filePath);
        const saved = yield* Effect.forEach(source.trim().split("\n"), (line) =>
          Schema.decodeUnknownEffect(Schema.fromJsonString(TrafficEvent))(line),
        );
        assert.deepEqual(saved, read);
        assert.isTrue(saved.every((event) => event.runId === log.runId));
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  );

  it.live("signals a required write failure and interrupts the unrecorded operation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped();
        const failingFs = FileSystem.make({
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
                writeAll: () =>
                  Effect.fail(
                    PlatformError.systemError({
                      _tag: "PermissionDenied",
                      module: "FileSystem",
                      method: "writeAll",
                    }),
                  ),
              })),
            ),
        });
        const services = yield* Layer.build(
          TrafficLogLive.pipe(
            Layer.provide(
              ConfigProvider.layer(ConfigProvider.fromUnknown({ UNTEAM_LOG_DIRECTORY: directory })),
            ),
            Layer.provide(Layer.succeed(FileSystem.FileSystem, failingFs)),
          ),
        );
        const log = Context.get(services, TrafficLog);
        const failure = yield* log.failure.pipe(Effect.flip, Effect.forkChild);
        const operation = yield* log.events
          .record({ _tag: "Lifecycle", action: "started", scenario: "failing-recorder" })
          .pipe(Effect.exit, Effect.forkChild);
        const error = yield* Fiber.join(failure);
        const outcome = yield* Fiber.await(operation);
        assert.isTrue(Exit.isFailure(outcome) || Exit.isFailure(outcome.value));
        const later = yield* log.events
          .record({ _tag: "Lifecycle", action: "reset", scenario: "failing-recorder" })
          .pipe(Effect.forkChild);
        assert.isTrue(Exit.isFailure(yield* Fiber.await(later)));
        assert.strictEqual(error.operation, "write");
        assert.strictEqual(yield* fs.readFileString(log.filePath), "");
      }),
    ).pipe(Effect.provide(BunServices.layer)),
  );
});

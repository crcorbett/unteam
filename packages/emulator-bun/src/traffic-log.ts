import { TrafficEvent, TrafficRunId, type TrafficEventsService } from "@unteam/emulator-core/events";
import {
  Clock,
  Config,
  Context,
  DateTime,
  Deferred,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  PubSub,
  Ref,
  Schema,
  Semaphore,
  Stream,
} from "effect";
export class TrafficLogError extends Schema.TaggedError<
  TrafficLogError,
  {
    readonly brand: unique symbol;
  }
>()("TrafficLogError", {
  operation: Schema.Literals(["open", "write", "read", "decode"]),
}) {}
const logError = (operation: TrafficLogError["operation"]) =>
  new TrafficLogError({
    operation,
  });
const LogDirectory = Schema.Trimmed.check(Schema.isMinLength(1)).pipe(Schema.brand("@unteam/LogDirectory"));
const encodeEvent = Schema.encodeEffect(Schema.fromJsonString(TrafficEvent));
const decodeEvent = Schema.decodeUnknownEffect(Schema.fromJsonString(TrafficEvent), {
  onExcessProperty: "error",
});
// A checked string always has a JSON string encoding. Quoting terminal fields
// also prevents fixture text from adding lines or terminal control sequences.
// String JSON encoding is total for checked strings. The terminal-control-character test proves escaping.
// oxlint-disable-next-line effect-conventions/no-throwing-schema-codec
const terminalText = Schema.encodeSync(Schema.fromJsonString(Schema.String));
export class TrafficLog extends Context.Service<
  TrafficLog,
  {
    readonly runId: TrafficRunId;
    readonly filePath: string;
    readonly events: TrafficEventsService;
    readonly failure: Effect.Effect<never, TrafficLogError>;
    readonly follow: Stream.Stream<TrafficEvent, TrafficLogError>;
  }
>()("@unteam/TrafficLog") {}
export const TrafficLogLive = Layer.effect(
  TrafficLog,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* Config.schema(LogDirectory, "UNTEAM_LOG_DIRECTORY").pipe(
      Config.withDefault(LogDirectory.make(".unteam/runs")),
    );
    yield* fs
      .makeDirectory(directory, {
        recursive: true,
      })
      .pipe(Effect.mapError(() => logError("open")));
    // This directory is intentionally retained after its owning process exits.
    const runDirectory = yield* fs
      .makeTempDirectory({
        directory,
        prefix: "run-",
      })
      .pipe(Effect.mapError(() => logError("open")));
    const runId = TrafficRunId.make(path.basename(runDirectory));
    const filePath = path.join(runDirectory, "events.jsonl");
    const file = yield* fs
      .open(filePath, {
        flag: "wx",
        mode: 0o600,
      })
      .pipe(Effect.mapError(() => logError("open")));
    const failure = yield* Deferred.make<never, TrafficLogError>();
    const sequence = yield* Ref.make(0);
    const committedBytes = yield* Ref.make(0);
    const changed = yield* PubSub.sliding<void>(1);
    const permit = yield* Semaphore.make(1);
    const append = Effect.fn("TrafficLog.append")(function* (data: TrafficEvent["data"]) {
      const next = (yield* Ref.get(sequence)) + 1;
      const timestamp = DateTime.makeUnsafe(yield* Clock.currentTimeMillis);
      const line = yield* encodeEvent({
        eventVersion: "unteam.event.v1",
        runId,
        sequence: next,
        timestamp,
        data,
      }).pipe(Effect.mapError(() => logError("write")));
      const bytes = new TextEncoder().encode(`${line}\n`);
      yield* file.writeAll(bytes).pipe(Effect.mapError(() => logError("write")));
      yield* file.sync.pipe(Effect.mapError(() => logError("write")));
      yield* Ref.set(sequence, next);
      yield* Ref.update(committedBytes, (current) => current + bytes.byteLength);
      yield* PubSub.publish(changed, undefined);
    });
    const events: TrafficEventsService = {
      record: Effect.fn("TrafficEvents.record")((data: TrafficEvent["data"]) =>
        permit.withPermit(
          Deferred.isDone(failure).pipe(
            Effect.flatMap((failed) => {
              if (failed) return Effect.interrupt;
              return Effect.uninterruptible(append(data)).pipe(
                Effect.catch((error) => Deferred.fail(failure, error).pipe(Effect.andThen(Effect.interrupt))),
              );
            }),
          ),
        ),
      ),
    };
    const follow = Stream.unwrap(
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(changed);
        return Stream.concat(Stream.make(undefined), Stream.fromSubscription(subscription)).pipe(
          Stream.mapAccumEffect(
            () => 0,
            (offset) =>
              Ref.get(committedBytes).pipe(
                Effect.map(
                  (end) =>
                    [
                      end,
                      [
                        {
                          offset,
                          length: end - offset,
                        },
                      ],
                    ] as const,
                ),
              ),
          ),
          Stream.flatMap((range) => {
            if (range.length === 0) return Stream.empty;
            return fs
              .stream(filePath, {
                offset: range.offset,
                bytesToRead: range.length,
              })
              .pipe(
                Stream.mapError(() => logError("read")),
                Stream.decodeText(),
                Stream.splitLines,
                Stream.mapEffect((line) => decodeEvent(line).pipe(Effect.mapError(() => logError("decode")))),
              );
          }),
        );
      }),
    );
    return TrafficLog.of({
      // This imported type is plain data; the rule cannot resolve its declaration.
      // oxlint-disable-next-line effect/require-service-operation-instrumentation
      runId,
      filePath,
      // This imported type is plain data; the rule cannot resolve its declaration.
      // oxlint-disable-next-line effect/require-service-operation-instrumentation
      events,
      failure: Deferred.await(failure).pipe(Effect.withSpan("TrafficLog.failure")),
      follow,
    });
  }),
);
export const formatTrafficEvent = (event: TrafficEvent): string => {
  const prefix = `${DateTime.formatIso(event.timestamp)} #${event.sequence}`;
  return Match.valueTags(event.data, {
    Lifecycle: (data) => `${prefix} ${data.action} ${terminalText(data.scenario)}`,
    Http: (data) =>
      `${prefix} ${terminalText(data.exchange)} ${terminalText(data.method)} ${data.route} ${data.phase}${Option.match(
        data.status,
        {
          onNone: () => "",
          onSome: (status) => ` ${status}`,
        },
      )}`,
    Message: (data) => {
      const _input = (() => {
        if (data.direction === "sent") return data.userId;
        return data.botAppId;
      })();
      return `${prefix} ${data.direction} ${data.phase} sender=${terminalText(_input)} tenant=${terminalText(data.tenantId)} user=${terminalText(data.userId)} conversation=${terminalText(data.conversationId)}${Option.match(
        data.status,
        {
          onNone: () => "",
          onSome: (status) => ` status=${status}`,
        },
      )} ${terminalText(data.text)}`;
    },
  });
};

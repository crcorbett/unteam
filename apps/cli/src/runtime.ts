import type { TrafficEventData } from "@unteam/emulator-core/events";
import { Data } from "effect";
import {
  makeTeamsEmulatorServerFromPaths,
  type ServerPort,
  type ServerScenarioV1,
} from "@unteam/emulator-bun";
import { Effect, Schema, Stdio, Stream } from "effect";
import { TrafficEvents } from "@unteam/emulator-core/events";
import { TrafficLog, TrafficLogLive, formatTrafficEvent } from "@unteam/emulator-bun/traffic-log";
import { UnteamDiagnosticV1, UnteamReadyV2 } from "./schemas";
const encodeReadiness = Schema.encodeEffect(Schema.fromJsonString(UnteamReadyV2));
const encodeDiagnostic = Schema.encodeEffect(Schema.fromJsonString(UnteamDiagnosticV1));
const writeLine = (line: string, output: ReturnType<Stdio.Stdio["stdout"]>) =>
  Stream.make(`${line}\n`).pipe(Stream.run(output));
export const emitDiagnostic = Effect.fnUntraced(function* (event: UnteamDiagnosticV1["event"]) {
  const stdio = yield* Stdio.Stdio;
  const _input = UnteamDiagnosticV1.make({
    diagnosticVersion: "unteam.diagnostic.v1",
    event,
    synthetic: true,
  });
  const line = yield* encodeDiagnostic(_input);
  const _input2 = stdio.stderr();
  yield* writeLine(line, _input2);
});
export const runRuntime = (scenario: ServerScenarioV1, port: ServerPort) => {
  return Effect.gen(function* () {
    const log = yield* TrafficLog;
    return yield* Effect.raceFirst(
      log.failure,
      Effect.gen(function* () {
        yield* log.events.record(
          Data.taggedEnum<TrafficEventData>().Lifecycle({
            action: "started",
            scenario: scenario.name,
          }),
        );
        const stdio = yield* Stdio.Stdio;
        yield* log.follow.pipe(
          Stream.map((event) => `${formatTrafficEvent(event)}\n`),
          Stream.run(stdio.stderr()),
          Effect.ignore,
          Effect.forkScoped,
        );
        yield* Effect.addFinalizer(() =>
          log.events.record(
            Data.taggedEnum<TrafficEventData>().Lifecycle({
              action: "stopped",
              scenario: scenario.name,
            }),
          ),
        );
        const server = yield* makeTeamsEmulatorServerFromPaths(scenario, {
          port,
        });
        const line = yield* encodeReadiness(server.readiness);
        const _input3 = stdio.stdout();
        yield* writeLine(line, _input3);
        yield* emitDiagnostic("started");
        return yield* Effect.never;
      }).pipe(Effect.scoped, Effect.provideService(TrafficEvents, log.events)),
    );
  }).pipe(Effect.provide(TrafficLogLive));
};

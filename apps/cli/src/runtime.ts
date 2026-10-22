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

export const emitDiagnostic = (event: UnteamDiagnosticV1["event"]) =>
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio;
    const line = yield* encodeDiagnostic(
      UnteamDiagnosticV1.make({
        diagnosticVersion: "unteam.diagnostic.v1",
        event,
        synthetic: true,
      }),
    );
    yield* writeLine(line, stdio.stderr());
  });

export const runRuntime = (scenario: ServerScenarioV1, port: ServerPort) =>
  Effect.gen(function* () {
    const log = yield* TrafficLog;
    return yield* Effect.raceFirst(
      log.failure,
      Effect.gen(function* () {
        yield* log.events.record({ _tag: "Lifecycle", action: "started", scenario: scenario.name });
        const stdio = yield* Stdio.Stdio;
        yield* log.follow.pipe(
          Stream.map((event) => `${formatTrafficEvent(event)}\n`),
          Stream.run(stdio.stderr()),
          Effect.ignore,
          Effect.forkScoped,
        );
        yield* Effect.addFinalizer(() =>
          log.events.record({ _tag: "Lifecycle", action: "stopped", scenario: scenario.name }),
        );
        const server = yield* makeTeamsEmulatorServerFromPaths(scenario, { port });
        const line = yield* encodeReadiness(server.readiness);
        yield* writeLine(line, stdio.stdout());
        yield* emitDiagnostic("started");
        return yield* Effect.never;
      }).pipe(Effect.scoped, Effect.provideService(TrafficEvents, log.events)),
    );
  }).pipe(Effect.provide(TrafficLogLive));

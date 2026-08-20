import {
  makeTeamsEmulatorServerFromPaths,
  type ServerPort,
  type ServerScenarioV1,
} from "@unteam/emulator-bun";
import { Effect, Schema, Stdio, Stream } from "effect";

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
    const server = yield* makeTeamsEmulatorServerFromPaths(scenario, { port });
    const line = yield* encodeReadiness(server.readiness);
    const stdio = yield* Stdio.Stdio;
    yield* writeLine(line, stdio.stdout());
    yield* emitDiagnostic("started");
    return yield* Effect.never;
  });

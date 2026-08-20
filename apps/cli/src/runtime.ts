import { makeTeamsEmulatorServerFromPaths, type ServerScenarioV1 } from "@unteam/emulator-bun";
import { Effect, Schema, Stdio, Stream } from "effect";

import { UnteamDiagnosticV1, UnteamLoopbackUrl, UnteamReadyV1 } from "./schemas";

const encodeReadiness = Schema.encodeEffect(Schema.fromJsonString(UnteamReadyV1));
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

export const runRuntime = (scenario: ServerScenarioV1) =>
  Effect.gen(function* () {
    const server = yield* makeTeamsEmulatorServerFromPaths(scenario);
    const snapshot = yield* server.emulator.snapshot;
    const decodeLoopbackUrl = Schema.decodeUnknownEffect(UnteamLoopbackUrl);
    const origin = yield* decodeLoopbackUrl(server.origin.href);
    const connections = yield* Effect.forEach(snapshot.connections, (connection) =>
      decodeLoopbackUrl(connection.serviceUrl.href).pipe(
        Effect.map((serviceUrl) => ({ connectionId: connection.connectionId, serviceUrl })),
      ),
    );
    const readiness = UnteamReadyV1.make({
      readinessVersion: "unteam.ready.v1",
      synthetic: true,
      origin,
      issuerUrl: origin,
      openIdMetadataUrl: yield* decodeLoopbackUrl(
        new URL("/.well-known/openidconfiguration", server.origin).href,
      ),
      jwkSetUrl: yield* decodeLoopbackUrl(new URL("/.well-known/keys", server.origin).href),
      oauthTokenUrl: yield* decodeLoopbackUrl(new URL("/oauth2/v2.0/token", server.origin).href),
      controlBaseUrl: yield* decodeLoopbackUrl(new URL("/control/", server.origin).href),
      botAppId: snapshot.botAppId,
      connectorScope: scenario.bot.scope,
      connections,
    });
    const line = yield* encodeReadiness(readiness);
    const stdio = yield* Stdio.Stdio;
    yield* writeLine(line, stdio.stdout());
    yield* emitDiagnostic("started");
    return yield* Effect.never;
  });

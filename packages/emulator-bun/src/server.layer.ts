import { Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";

import {
  makeTeamsEmulatorLiveLayer,
  ProtocolState,
  ScenarioV1,
  ServiceUrl,
  TeamsEmulator,
  type ScenarioV1 as Scenario,
  type TeamsEmulatorService,
} from "@unteam/emulator-core";
import { EmulatorStartupError } from "@unteam/emulator-core/errors";
import { exampleScenario } from "@unteam/emulator-core/fixtures";
import { makeProtocolHttpApp } from "@unteam/emulator-core/live";

import type { ServerScenarioV1 } from "./server.schemas";

type ScopedBunHttpServer = Effect.Success<ReturnType<typeof BunHttpServer.make>>;

export interface TeamsEmulatorServer {
  readonly origin: URL;
  readonly emulator: TeamsEmulatorService;
}

const serveTeamsEmulator = (server: ScopedBunHttpServer, origin: URL, scenario: Scenario) =>
  Effect.gen(function* () {
    const coreLayer = makeTeamsEmulatorLiveLayer(scenario, origin).pipe(Layer.provide(FetchHttpClient.layer));
    const services = yield* Layer.build(coreLayer);
    const state = Context.get(services, ProtocolState);
    const emulator = Context.get(services, TeamsEmulator);
    const router = yield* makeProtocolHttpApp({ origin, state, emulator });
    yield* server.serve(router.asHttpEffect());
    return { origin, emulator } satisfies TeamsEmulatorServer;
  });

const acquireLoopbackServer = Effect.gen(function* () {
  const server = yield* BunHttpServer.make({ hostname: "127.0.0.1", port: 0 });
  if (!("port" in server.address)) {
    return yield* new EmulatorStartupError({ code: "unsupported-profile" });
  }
  return {
    server,
    origin: new URL(`http://127.0.0.1:${server.address.port}/`),
  } as const;
});

export const makeTeamsEmulatorServer = (scenario: Scenario = exampleScenario) =>
  Effect.gen(function* () {
    const acquired = yield* acquireLoopbackServer;
    return yield* serveTeamsEmulator(acquired.server, acquired.origin, scenario);
  }).pipe(Effect.provide(FetchHttpClient.layer));

export const makeTeamsEmulatorServerFromPaths = (scenario: ServerScenarioV1) =>
  Effect.gen(function* () {
    const acquired = yield* acquireLoopbackServer;
    const resolved = ScenarioV1.make({
      ...scenario,
      connections: scenario.connections.map((connection) => ({
        ...connection,
        serviceUrl: ServiceUrl.make(new URL(connection.servicePath, acquired.origin)),
      })),
    });
    return yield* serveTeamsEmulator(acquired.server, acquired.origin, resolved);
  }).pipe(Effect.provide(FetchHttpClient.layer));

export type TeamsEmulatorServerEffect = ReturnType<typeof makeTeamsEmulatorServer>;

import { Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";

import {
  makeTeamsEmulatorLiveLayer,
  ProtocolState,
  TeamsEmulator,
  type ScenarioV1,
  type TeamsEmulatorService,
} from "@unteam/emulator-core";
import { EmulatorStartupError } from "@unteam/emulator-core/errors";
import { exampleScenario } from "@unteam/emulator-core/fixtures";
import { makeProtocolHttpApp } from "@unteam/emulator-core/live";

export interface TeamsEmulatorServer {
  readonly origin: URL;
  readonly emulator: TeamsEmulatorService;
}

export const makeTeamsEmulatorServer = (scenario: ScenarioV1 = exampleScenario) =>
  Effect.gen(function* () {
    const server = yield* BunHttpServer.make({ hostname: "127.0.0.1", port: 0 });
    if (!("port" in server.address)) {
      return yield* new EmulatorStartupError({ code: "unsupported-profile" });
    }
    const origin = new URL(`http://127.0.0.1:${server.address.port}`);
    const coreLayer = makeTeamsEmulatorLiveLayer(scenario, origin).pipe(Layer.provide(FetchHttpClient.layer));
    const services = yield* Layer.build(coreLayer);
    const state = Context.get(services, ProtocolState);
    const emulator = Context.get(services, TeamsEmulator);
    const router = yield* makeProtocolHttpApp({ origin, state, emulator });
    yield* server.serve(router.asHttpEffect());
    return { origin, emulator } satisfies TeamsEmulatorServer;
  }).pipe(Effect.provide(FetchHttpClient.layer));

export type TeamsEmulatorServerEffect = ReturnType<typeof makeTeamsEmulatorServer>;

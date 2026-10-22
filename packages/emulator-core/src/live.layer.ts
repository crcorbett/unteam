import { TrafficEvents } from "./events";
import { Clock, Duration, Effect, Layer, Ref } from "effect";
import { TestClock } from "effect/testing";
import { HttpClient } from "effect/http";

import { ActivitySigningError, EmulatorStartupError } from "./errors";
import {
  ActivitySigner,
  liveLayer as liveSignerLayer,
  testLayer as testSignerLayer,
} from "./internal/activity-signer";
import {
  makeProtocolState,
  ProtocolState,
  SimulationClock,
  type SimulationClockService,
} from "./internal/protocol-state";
import { makeTeamsEmulatorService, TeamsEmulator } from "./service";
import type { ScenarioV1, SimulationDuration } from "./schemas";

const makeLiveClock = (initialTimeMillis: number): Effect.Effect<SimulationClockService> =>
  Effect.gen(function* () {
    const current = yield* Clock.currentTimeMillis;
    const offset = yield* Ref.make(initialTimeMillis - current);
    return {
      now: Effect.all([Clock.currentTimeMillis, Ref.get(offset)]).pipe(
        Effect.map(([current, delta]) => current + delta),
      ),
      advance: (duration: SimulationDuration) =>
        Ref.update(offset, (current) => current + Duration.toMillis(duration)),
      reset: Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        yield* Ref.set(offset, initialTimeMillis - now);
      }),
    } satisfies SimulationClockService;
  });

const makeTestClock = (initialTimeMillis: number): Layer.Layer<SimulationClock> =>
  Layer.effect(
    SimulationClock,
    Effect.gen(function* () {
      const testClock = yield* TestClock.make();
      yield* testClock.setTime(initialTimeMillis);
      return {
        now: testClock.currentTimeMillis,
        advance: (duration: SimulationDuration) => testClock.adjust(duration),
        reset: testClock.setTime(initialTimeMillis),
      } satisfies SimulationClockService;
    }),
  );

const makeProtocolLayer = (
  scenario: ScenarioV1,
  clockLayer: Layer.Layer<SimulationClock>,
  signerLayer: Layer.Layer<ActivitySigner, ActivitySigningError>,
) =>
  Layer.effect(
    ProtocolState,
    Effect.gen(function* () {
      const clock = yield* SimulationClock;
      const signer = yield* ActivitySigner;
      return yield* makeProtocolState(scenario, clock, signer);
    }),
  ).pipe(Layer.provide(Layer.merge(clockLayer, signerLayer)));

export const makeTeamsEmulatorLiveLayer = (
  scenario: ScenarioV1,
  origin: URL = new URL("http://127.0.0.1:0"),
) => {
  const clockLayer = Layer.effect(SimulationClock, makeLiveClock(scenario.initialTimeMillis));
  const signerLayer = liveSignerLayer(scenario.signingKeys);
  const protocolLayer = makeProtocolLayer(scenario, clockLayer, signerLayer);
  const serviceLayer = Layer.effect(
    TeamsEmulator,
    Effect.gen(function* () {
      const state = yield* ProtocolState;
      const signer = yield* ActivitySigner;
      const client = yield* HttpClient.HttpClient;
      const events = yield* TrafficEvents;
      return makeTeamsEmulatorService(origin, state, signer, client, events);
    }),
  ).pipe(Layer.provide(Layer.merge(protocolLayer, signerLayer)));
  return Layer.merge(protocolLayer, serviceLayer);
};

export const makeTeamsEmulatorTestLayer = (
  scenario: ScenarioV1,
  origin: URL = new URL("http://127.0.0.1:0"),
) => {
  const clockLayer = makeTestClock(scenario.initialTimeMillis);
  const signerLayer = testSignerLayer(scenario.signingKeys);
  const protocolLayer = makeProtocolLayer(scenario, clockLayer, signerLayer);
  const serviceLayer = Layer.effect(
    TeamsEmulator,
    Effect.gen(function* () {
      const state = yield* ProtocolState;
      const signer = yield* ActivitySigner;
      return makeTeamsEmulatorService(origin, state, signer, undefined);
    }),
  ).pipe(Layer.provide(Layer.merge(protocolLayer, signerLayer)));
  return Layer.merge(protocolLayer, serviceLayer);
};

export type TeamsEmulatorLiveLayerError = EmulatorStartupError;

export { makeProtocolHttpApp } from "./internal/protocol-http-app";
export { ProtocolState } from "./internal/protocol-state";

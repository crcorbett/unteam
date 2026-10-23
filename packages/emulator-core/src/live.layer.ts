import { Clock, Duration, Effect, Layer, Ref } from "effect";
import { TestClock } from "effect/testing";
import { EmulatorConfiguration } from "./configuration";
import { ActivitySignerLive, ActivitySignerTest } from "./internal/activity-signer";
import { ProtocolStateLive, SimulationClock, type SimulationClockService } from "./internal/protocol-state";
import { EmulatorServiceLive } from "./internal/emulator.layer";
import type { SimulationDuration } from "./schemas";
import type { EmulatorStartupError } from "./errors";

const LiveClock = Layer.effect(
  SimulationClock,
  Effect.gen(function* () {
    const { scenario } = yield* EmulatorConfiguration;
    const initialTimeMillis = scenario.initialTimeMillis;
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
  }),
);

const ControlledClock = Layer.effect(
  SimulationClock,
  Effect.gen(function* () {
    const { scenario } = yield* EmulatorConfiguration;
    const testClock = yield* TestClock.make();
    yield* testClock.setTime(scenario.initialTimeMillis);
    return {
      now: testClock.currentTimeMillis,
      advance: (duration: SimulationDuration) => testClock.adjust(duration),
      reset: testClock.setTime(scenario.initialTimeMillis),
    } satisfies SimulationClockService;
  }),
);

const LiveState = ProtocolStateLive.pipe(Layer.provide(Layer.merge(LiveClock, ActivitySignerLive)));
const TestState = ProtocolStateLive.pipe(Layer.provide(Layer.merge(ControlledClock, ActivitySignerTest)));
const LiveService = EmulatorServiceLive.pipe(Layer.provide(Layer.merge(LiveState, ActivitySignerLive)));
const TestService = EmulatorServiceLive.pipe(Layer.provide(Layer.merge(TestState, ActivitySignerTest)));

export const TeamsEmulatorLive = Layer.merge(LiveState, LiveService);
export const TeamsEmulatorTest = Layer.merge(TestState, TestService);
export { EmulatorConfiguration } from "./configuration";
export type TeamsEmulatorLiveLayerError = EmulatorStartupError;
export { makeProtocolHttpApp } from "./internal/protocol-http-app";
export { ProtocolState } from "./internal/protocol-state";

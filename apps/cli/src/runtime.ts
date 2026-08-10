import { Deferred, Effect } from "effect";

import { makeTeamsEmulatorServer } from "@unteam/emulator-bun";
import { type ScenarioV1 } from "@unteam/emulator-core";
import { exampleScenario } from "@unteam/emulator-core/fixtures";

import type { CliConfig } from "./config";

export const runRuntime = (config: CliConfig, scenario: ScenarioV1 = exampleScenario) =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* makeTeamsEmulatorServer(scenario);
      yield* Effect.logInfo({
        event: "unteam.started",
        name: config.name ?? "unteam",
        origin: server.origin.href,
        synthetic: true,
      });
      const stopped = yield* Deferred.make<void>();
      const signalHandler = () => {
        void Effect.runPromise(Deferred.succeed(stopped, undefined));
      };
      process.once("SIGINT", signalHandler);
      process.once("SIGTERM", signalHandler);
      yield* Effect.acquireRelease(Effect.void, () =>
        Effect.sync(() => {
          process.removeListener("SIGINT", signalHandler);
          process.removeListener("SIGTERM", signalHandler);
        }),
      );
      yield* Deferred.await(stopped);
      return server.origin.href;
    }),
  );

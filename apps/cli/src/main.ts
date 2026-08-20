import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Data, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { portFlag, scenarioFlag } from "./config";
import { emitDiagnostic, runRuntime } from "./runtime";

class UnteamCliError extends Data.TaggedError("UnteamCliError")<{
  readonly code: "startup-failed";
}> {}

const command = Command.make("unteam", { port: portFlag, scenario: scenarioFlag }, ({ port, scenario }) =>
  runRuntime(scenario, port),
).pipe(
  Command.withDescription(
    "Run the unofficial synthetic Bot Connector emulator on a configured loopback port.",
  ),
);

Command.run(command, { version: "0.2.0", renderErrors: false }).pipe(
  Effect.scoped,
  Effect.catchCause(() =>
    emitDiagnostic("startup-failed").pipe(
      Effect.andThen(Effect.fail(new UnteamCliError({ code: "startup-failed" }))),
    ),
  ),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain({ disableErrorReporting: true }),
);

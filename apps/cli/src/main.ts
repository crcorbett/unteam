import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Data, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { scenarioFlag } from "./config";
import { emitDiagnostic, runRuntime } from "./runtime";

class UnteamCliError extends Data.TaggedError("UnteamCliError")<{
  readonly code: "startup-failed";
}> {}

const command = Command.make("unteam", { scenario: scenarioFlag }, ({ scenario }) =>
  runRuntime(scenario),
).pipe(
  Command.withDescription(
    "Run the unofficial synthetic Bot Connector emulator on an ephemeral loopback port.",
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

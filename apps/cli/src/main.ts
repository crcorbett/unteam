import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Cause, Data, Effect, Option } from "effect";
import { Command } from "effect/cli";

import { portFlag, scenarioFlag } from "./config";
import { emitDiagnostic, runRuntime } from "./runtime";

class UnteamCliError extends Data.TaggedError("UnteamCliError")<{
  readonly code: "startup-failed" | "recording-failed";
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
  Effect.catchCause((cause) => {
    if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt;
    const failure = Cause.findErrorOption(cause);
    const code = Option.exists(failure, (error) => error._tag === "TrafficLogError")
      ? "recording-failed"
      : "startup-failed";
    return emitDiagnostic(code).pipe(Effect.andThen(Effect.fail(new UnteamCliError({ code }))));
  }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain({ disableErrorReporting: true }),
);

import { ServerPort, ServerScenarioV1 } from "@unteam/emulator-bun";
import { Effect, Schema } from "effect";
import { CliError, Flag } from "effect/cli";

export const scenarioFlag = Flag.FileParse("scenario", {
  format: "json",
}).pipe(
  Flag.mapEffect((input) =>
    Schema.decodeUnknownEffect(ServerScenarioV1, { onExcessProperty: "error" })(input).pipe(
      Effect.mapError(
        () =>
          new CliError.InvalidValue({
            option: "scenario",
            value: "[file contents omitted]",
            expected: "An exact ServerScenarioV1 JSON object.",
            kind: "flag",
          }),
      ),
    ),
  ),
  Flag.withDescription(
    "Path to one JSON ServerScenarioV1 file. The server binds the configured loopback port.",
  ),
);

export const portFlag = Flag.Int("port").pipe(
  Flag.withSchema(ServerPort),
  Flag.withDescription("Loopback TCP port from 0 to 65535; 0 selects an available port."),
);

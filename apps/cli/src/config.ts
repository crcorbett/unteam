import { ServerPort, ServerScenarioV1 } from "@unteam/emulator-bun";
import { Flag } from "effect/unstable/cli";

export const scenarioFlag = Flag.fileSchema("scenario", ServerScenarioV1, {
  format: "json",
}).pipe(
  Flag.withDescription(
    "Path to one JSON ServerScenarioV1 file. The server binds the configured loopback port.",
  ),
);

export const portFlag = Flag.integer("port").pipe(
  Flag.withSchema(ServerPort),
  Flag.withDescription("Loopback TCP port from 1 to 65535."),
);

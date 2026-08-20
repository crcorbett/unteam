import { ServerScenarioV1 } from "@unteam/emulator-bun";
import { Flag } from "effect/unstable/cli";

export const scenarioFlag = Flag.fileSchema("scenario", ServerScenarioV1, {
  format: "json",
}).pipe(
  Flag.withDescription(
    "Path to one JSON ServerScenarioV1 file. The server binds loopback on an ephemeral port.",
  ),
);

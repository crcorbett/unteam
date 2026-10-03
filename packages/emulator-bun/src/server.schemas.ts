import {
  ServerConnectionSpec,
  ServerScenarioV1,
  UnteamLoopbackUrl,
  UnteamReadyV2,
} from "@unteam/emulator-core/schemas";
import { Schema } from "effect";

export { ServerConnectionSpec, ServerScenarioV1, UnteamLoopbackUrl, UnteamReadyV2 };

export const ServerPort = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(65_535)).pipe(
  Schema.brand("@unteam/emulator-bun/ServerPort"),
);
export type ServerPort = typeof ServerPort.Type;

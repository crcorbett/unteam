import { Context } from "effect";
import type { ScenarioV1 } from "./schemas";

// The host supplies a checked scenario and its actual bound origin.
export class EmulatorConfiguration extends Context.Service<
  EmulatorConfiguration,
  { readonly scenario: ScenarioV1; readonly origin: URL }
>()("@unteam/emulator-core/EmulatorConfiguration") {}

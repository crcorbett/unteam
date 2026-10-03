import { Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

import { makeUnteamClientConnectionFromConfig } from "./internal/live";
import { UnteamClient } from "./service";

export const UnteamClientLive = Layer.effect(UnteamClient, makeUnteamClientConnectionFromConfig).pipe(
  Layer.provide(FetchHttpClient.layer),
);

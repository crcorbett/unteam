import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { UnteamClientLayer } from "./internal/live";
export const UnteamClientLive = UnteamClientLayer.pipe(Layer.provide(FetchHttpClient.layer));

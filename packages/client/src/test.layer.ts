import { Layer } from "effect";

import type { IUnteamClient } from "./service";
import { UnteamClient } from "./service";

export const makeUnteamClientTest = (client: IUnteamClient) => Layer.succeed(UnteamClient, client);

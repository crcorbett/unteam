import { Clock, Context, DateTime, Effect, HashMap, Layer, Schema } from "effect";

import { ActivitySigningError } from "../errors";
import {
  BotAppId,
  ActivityId,
  ConnectorActivity,
  ProtocolJwk,
  ServiceUrl,
  SigningKeyId,
  SigningKeySpec,
  TenantId,
  UserId,
  ConversationId,
} from "../schemas";

const JwtHeader = Schema.Struct({
  alg: Schema.Literal("RS256"),
  kid: SigningKeyId,
});

const JwtClaims = Schema.Struct({
  iss: Schema.URLFromString,
  aud: BotAppId,
  nbf: Schema.Int,
  exp: Schema.Int,
  serviceUrl: ServiceUrl,
});

type JwtClaims = Schema.Schema.Type<typeof JwtClaims>;

interface ActivitySigningInput {
  readonly keyId: SigningKeyId;
  readonly issuer: URL;
  readonly audience: BotAppId;
  readonly tokenServiceUrl: ServiceUrl;
  readonly activityServiceUrl: ServiceUrl;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly conversationId: ConversationId;
  readonly activityId: ActivityId;
  readonly text: string;
  readonly nowMillis: number;
}

interface SignedActivity {
  readonly token: string;
  readonly activity: typeof ConnectorActivity.Type;
}

interface KeyRecord {
  readonly keyId: SigningKeyId;
  readonly endorsements: readonly string[];
  readonly privateKey: CryptoKey;
  readonly publicJwk: JsonWebKey;
}

export interface ActivitySignerService {
  readonly sign: (input: ActivitySigningInput) => Effect.Effect<SignedActivity, ActivitySigningError>;
  readonly publicKeys: Effect.Effect<readonly ProtocolJwk[], ActivitySigningError>;
}

export class ActivitySigner extends Context.Service<ActivitySigner, ActivitySignerService>()(
  "@unteam/emulator-core/ActivitySigner",
) {}

const encodeBase64Url = (value: Uint8Array): string => {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const encodeJson = (value: unknown): Effect.Effect<string, ActivitySigningError> =>
  Effect.try({
    try: () => encodeBase64Url(new TextEncoder().encode(JSON.stringify(value))),
    catch: () => new ActivitySigningError({ code: "claims-encoding-failure" }),
  });

const fixedPublicJwk: JsonWebKey = {
  alg: "RS256",
  e: "AQAB",
  ext: true,
  key_ops: ["verify"],
  kty: "RSA",
  n: "2GfjFmTVXNAgJSp4qfJglTy9eh6RsMDk7blD6s1EasihfWbgnLC3IVIafpP_aTBrd7XHrwxegL3wv2lz6Ft9wSbUhz8ORWnKva77nr4dPxIr7Ky5cpo-H9POO3iFdRwvMp2Yo-ikJBvDy-8hX7GxXw6YjpLqO08MLqhrNIJuKOBm1bg_iLdtjZdzu8tP8W8rZ7hy8Lf-SwNogL9j_sqj1InxxwZG52td7yUlMO804Zp1JkNqzpQ3rI7Di9WTN6trR-z0o-ou95LvctX_xEKBg2cnDkW2TGz8etLwc09TbD7Tv2qM2bVTP8E-t0dOkBYQR3g4wrH1oP_zQjQxsivW1Q",
};

const fixedPrivateJwk: JsonWebKey = {
  alg: "RS256",
  d: "IeWn7vaNazPYjSnJa8lg8o9omIvYQ0j7svbtmgZcHKPfk859CV4u2UPMjZ4uCDKC6uXo6NT1qpHV942Tj8Zg_NPRv3uThzDqhmq11CgwWZRFmBV4GOjrKT4alDstIGpxRCrmYWpL57IHqdaDskMZpuuY3uBJW0_m9xn_bOKvUayGysNWf-nZeHAFFBFeZQNk7xRTTtKDgg5BTpBhXMZMDpMrp_z5CDDUkN0buT2bkJf9ruei5KBd0-5mK7wEjpyIM7JqYHqQBl-z_2P4_IBIKrhgt2EFte4PH5H0Z9S0ZxslmRnSdxBvkjI3dYiDY4nii5G5xDqHMDGCdOs0bXYrIQ",
  dp: "w1Dp_RC2i0lB4U2i69QLrzIzF9inHj4r6B3_usyRgPHpHvyysEmk_HRQJa9YME3MgaIPwwYqNDvNdCwB17iWGSZlxEFfWFUV9uC5LgOmjj3XjUJAtlaQLAa9pjHSvuPalBo_6KU6p1i2LuudYlS36hzalm1K8c1SwMywbbdBHw0",
  dq: "YfKi5w__Cr1hRs-bkX4HmqTy4bJRLOyXCv_y5DAJJGOYMRj6C6AWvvVgvaPHRYj_kCI6kJQC3q-_2pa5aTnZq9w_6r8uhcKPHZVtokzJq5ZCv-skjTSJpr1yz1xxGxMknCyS0Yokx_GHy1hCIUlHIzy_4FOZgRZxboHE8GbiVOE",
  e: "AQAB",
  ext: true,
  key_ops: ["sign"],
  kty: "RSA",
  n: "2GfjFmTVXNAgJSp4qfJglTy9eh6RsMDk7blD6s1EasihfWbgnLC3IVIafpP_aTBrd7XHrwxegL3wv2lz6Ft9wSbUhz8ORWnKva77nr4dPxIr7Ky5cpo-H9POO3iFdRwvMp2Yo-ikJBvDy-8hX7GxXw6YjpLqO08MLqhrNIJuKOBm1bg_iLdtjZdzu8tP8W8rZ7hy8Lf-SwNogL9j_sqj1InxxwZG52td7yUlMO804Zp1JkNqzpQ3rI7Di9WTN6trR-z0o-ou95LvctX_xEKBg2cnDkW2TGz8etLwc09TbD7Tv2qM2bVTP8E-t0dOkBYQR3g4wrH1oP_zQjQxsivW1Q",
  p: "_inR96We3K0ye6tWSwLWxv4TMapn0lw_sVLHBxJ1UL30ph_1-yw5beiCTNLGaWxhfawbAcYMfHHErh0YgRUUJJnPGpsK5tiPz4_D-O21df72RX6_MtewRQCqC2TEWn4JqvbIzqTSKJHu7djkZ1HNs6-wzTwIg8FWocBgRAfScmU",
  q: "2fg3_umbx5IW80yIqKb6mVgR_98P75GaOOk5Y_B4ETfLd6ObRjQSjy_tzmvd76ATsKsqUrUU3ljlcCQOrD-EQ_5dJGohqpPaYRW1ItgQw0WvAMOW_sZtUCf_-OZ3BChDCDvMCTj9--rJm9Nm4gFKStNmFDtniTj1hl1juWEEU7E",
  qi: "-O4VoW9wjxS8kxWwOSpnEjYYEoYE9SCx4RCgpERZUuMU5aS9z-D5ZT3eRV3isoAa7tH0T33Bznv6lZFTZEqzZcjEbGrKe3U18xc5mDZREru1LD9QxJSz7VGsH-uxrEHgBG4HkDK2zGo9EB3KLCGflpOOwXkpJocTtfIk6xq6JVU",
};

const importPrivateKey = (jwk: JsonWebKey) =>
  Effect.tryPromise({
    try: () =>
      crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]),
    catch: () => new ActivitySigningError({ code: "web-crypto-failure" }),
  });

const generateKey = Effect.tryPromise({
  try: () =>
    crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    ),
  catch: () => new ActivitySigningError({ code: "web-crypto-failure" }),
}).pipe(
  Effect.flatMap((generated) =>
    "privateKey" in generated
      ? Effect.tryPromise({
          try: () => crypto.subtle.exportKey("jwk", generated.publicKey),
          catch: () => new ActivitySigningError({ code: "web-crypto-failure" }),
        }).pipe(Effect.map((publicJwk) => ({ privateKey: generated.privateKey, publicJwk })))
      : Effect.fail(new ActivitySigningError({ code: "web-crypto-failure" })),
  ),
);

const makeSigner = (keys: readonly KeyRecord[]) => {
  const byId = HashMap.fromIterable(keys.map((key) => [key.keyId, key] as const));
  return {
    sign: (input: ActivitySigningInput) =>
      Effect.gen(function* () {
        const record = HashMap.get(byId, input.keyId);
        if (record._tag === "None") {
          return yield* new ActivitySigningError({ code: "key-unavailable" });
        }
        const nowSeconds = Math.floor((yield* Clock.currentTimeMillis) / 1_000);
        const header = yield* Schema.encodeUnknownEffect(JwtHeader)({ alg: "RS256", kid: input.keyId }).pipe(
          Effect.mapError(() => new ActivitySigningError({ code: "claims-encoding-failure" })),
        );
        const claims: JwtClaims = {
          iss: input.issuer,
          aud: input.audience,
          nbf: nowSeconds - 60,
          exp: nowSeconds + 60,
          serviceUrl: input.tokenServiceUrl,
        };
        const encodedClaims = yield* Schema.encodeUnknownEffect(JwtClaims)(claims).pipe(
          Effect.mapError(() => new ActivitySigningError({ code: "claims-encoding-failure" })),
        );
        const headerPart = yield* encodeJson(header);
        const claimsPart = yield* encodeJson(encodedClaims);
        const signingInput = `${headerPart}.${claimsPart}`;
        const signature = yield* Effect.tryPromise({
          try: () =>
            crypto.subtle.sign(
              "RSASSA-PKCS1-v1_5",
              record.value.privateKey,
              new TextEncoder().encode(signingInput),
            ),
          catch: () => new ActivitySigningError({ code: "web-crypto-failure" }),
        });
        const activity: typeof ConnectorActivity.Type = {
          type: "message",
          id: input.activityId,
          timestamp: DateTime.formatIso(DateTime.makeUnsafe(input.nowMillis)),
          serviceUrl: input.activityServiceUrl,
          channelId: "msteams",
          channelData: { tenant: { id: input.tenantId } },
          from: { aadObjectId: input.userId },
          conversation: { id: input.conversationId },
          recipient: { id: input.audience },
          text: input.text,
        };
        return {
          token: `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`,
          activity,
        };
      }),
    publicKeys: Effect.forEach(keys, (record) =>
      Effect.gen(function* () {
        const jwk = yield* Schema.decodeUnknownEffect(ProtocolJwk)({
          kty: "RSA",
          kid: record.keyId,
          use: "sig",
          alg: "RS256",
          endorsements: record.endorsements,
          n: record.publicJwk.n,
          e: record.publicJwk.e,
        }).pipe(Effect.mapError(() => new ActivitySigningError({ code: "claims-encoding-failure" })));
        return jwk;
      }),
    ),
  } satisfies typeof ActivitySigner.Service;
};

const makeKeyRecords = (
  specs: readonly SigningKeySpec[],
  material: (
    spec: SigningKeySpec,
  ) => Effect.Effect<
    { readonly privateKey: CryptoKey; readonly publicJwk: JsonWebKey },
    ActivitySigningError
  >,
) =>
  Effect.forEach(specs, (spec) =>
    material(spec).pipe(
      Effect.map((key) => ({ ...key, keyId: spec.keyId, endorsements: spec.endorsements })),
    ),
  );

export const liveLayer = (
  specs: readonly SigningKeySpec[],
): Layer.Layer<ActivitySigner, ActivitySigningError> =>
  Layer.effect(ActivitySigner, makeKeyRecords(specs, () => generateKey).pipe(Effect.map(makeSigner)));

export const testLayer = (
  specs: readonly SigningKeySpec[],
): Layer.Layer<ActivitySigner, ActivitySigningError> =>
  Layer.effect(
    ActivitySigner,
    makeKeyRecords(specs, () =>
      importPrivateKey(fixedPrivateJwk).pipe(
        Effect.map((privateKey) => ({ privateKey, publicJwk: fixedPublicJwk })),
      ),
    ).pipe(Effect.map(makeSigner)),
  );

import { Config, ConfigProvider, Data, Effect, Option, Schema } from "effect";

const CliConfigSchema = Schema.Struct({
  name: Schema.optionalKey(Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(128))),
});

export type CliConfig = Schema.Schema.Type<typeof CliConfigSchema>;

export interface CliArguments {
  readonly help: boolean;
  readonly configPath: Option.Option<string>;
}

export class CliConfigError extends Data.TaggedError("CliConfigError")<{
  readonly code: "invalid-arguments" | "file-read" | "invalid-config";
}> {}

export const parseArguments = (args: readonly string[]): Effect.Effect<CliArguments, CliConfigError> => {
  const help = args.includes("--help") || args.includes("-h");
  const configIndex = args.indexOf("--config");
  if (configIndex < 0) return Effect.succeed({ help, configPath: Option.none() });
  const path = args[configIndex + 1];
  return path === undefined || path.startsWith("-")
    ? Effect.fail(new CliConfigError({ code: "invalid-arguments" }))
    : Effect.succeed({ help, configPath: Option.some(path) });
};

const decodeConfigValue = (value: unknown) =>
  Schema.decodeUnknownEffect(CliConfigSchema)(value).pipe(
    Effect.mapError(() => new CliConfigError({ code: "invalid-config" })),
  );

export const loadConfig = (arguments_: CliArguments): Effect.Effect<CliConfig, CliConfigError> =>
  Option.match(arguments_.configPath, {
    onNone: () =>
      Config.schema(CliConfigSchema, "UNTEAM")
        .parse(ConfigProvider.fromUnknown({ UNTEAM: { name: "unteam" } }))
        .pipe(Effect.mapError(() => new CliConfigError({ code: "invalid-config" }))),
    onSome: (path) =>
      Effect.tryPromise({
        try: () => Bun.file(path).text(),
        catch: () => new CliConfigError({ code: "file-read" }),
      }).pipe(
        Effect.flatMap((text) =>
          Effect.try({
            try: () => JSON.parse(text) as unknown,
            catch: () => new CliConfigError({ code: "invalid-config" }),
          }),
        ),
        Effect.flatMap(decodeConfigValue),
      ),
  });

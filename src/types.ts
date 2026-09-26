/**
 * Configuration for a {@link ParamRegistry}.
 */
export interface ParamRegistryConfig<
  P extends Record<string, string> = Record<string, string>,
  S extends Record<string, string> = Record<never, string>,
> {
  /**
   * Path prefix shared by every parameter and secret in this registry.
   *
   * Must start with `/` and contain at least one path segment, so
   * `/team/my-app` is valid while `team/my-app` throws. Trailing slashes are
   * ignored.
   */
  readonly prefix: string;

  /**
   * Maps a logical key to the final path segment of an SSM parameter.
   *
   * These keys become the only values accepted by the `key` argument of
   * {@link ParamRegistry.putParameter}, {@link ParamRegistry.parameterRef}
   * and {@link ParamRegistry.secureParameterRef}, so an unknown key is a
   * compile error.
   */
  readonly parameters: P;

  /**
   * Maps a logical key to the final path segment of a Secrets Manager secret.
   *
   * Omit this entirely if the registry has no secrets, which also makes
   * {@link ParamRegistry.createSecret} uncallable.
   */
  readonly secrets?: S;

  /**
   * Emit a `CfnOutput` containing the raw value for every `putParameter`
   * call.
   *
   * Defaults to `false`. When enabled the value is rendered into the stack
   * outputs, where anyone with stack read access can see it, so only turn
   * this on for non-sensitive values you actually want surfaced.
   */
  readonly emitOutputs?: boolean;
}

/**
 * Options accepted by {@link ParamRegistry.parameterRef} and
 * {@link ParamRegistry.secureParameterRef}.
 */
export interface DynamicRefOptions {
  /**
   * Pin the dynamic reference to a specific parameter version.
   *
   * Without this, CloudFormation resolves whatever version is current at
   * deploy time and never reports drift when the value changes.
   */
  readonly version?: number;
}

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
   * Maps a logical key to the path under the prefix of an SSM parameter.
   *
   * These keys become the only values accepted by the `key` argument of
   * {@link ParamRegistry.putParameter}, {@link ParamRegistry.parameterRef}
   * and {@link ParamRegistry.secureParameterRef}, so an unknown key is a
   * compile error.
   *
   * Each value must contain at least one path segment. Nested paths such as
   * `network/vpc-id` are allowed, and leading, trailing and repeated slashes
   * are ignored. Invalid values throw when the registry is defined.
   */
  readonly parameters: P;

  /**
   * Maps a logical key to the path under the prefix of a Secrets Manager
   * secret. The same rules as for {@link ParamRegistryConfig.parameters}
   * apply.
   *
   * Omit this entirely if the registry has no secrets. That makes
   * {@link ParamRegistry.createSecret}, {@link ParamRegistry.secretRef} and
   * {@link ParamRegistry.importSecret} uncallable, and leaves the Secrets
   * Manager statement out of {@link ParamRegistry.readPolicyStatements} and
   * {@link ParamRegistry.grantRead}.
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
   * Must be a positive integer. Parameter Store only keeps the 100 most
   * recent versions of a parameter, but version numbers keep increasing, so
   * values above 100 are valid for parameters that have been updated often.
   *
   * Without this, CloudFormation resolves whatever version is current at
   * deploy time and never reports drift when the value changes.
   */
  readonly version?: number;
}

/**
 * Options accepted by {@link ParamRegistry.secretRef}. They mirror the
 * options of `SecretValue.secretsManager()` in `aws-cdk-lib`.
 */
export interface SecretRefOptions {
  /**
   * The key of a JSON field to retrieve. Only valid if the secret stores a
   * JSON object.
   *
   * @default - the whole secret string
   */
  readonly jsonField?: string;

  /**
   * The staging label of the secret version to retrieve. Specify at most one
   * of `versionStage` and `versionId`.
   *
   * @default 'AWSCURRENT'
   */
  readonly versionStage?: string;

  /**
   * The unique id of the secret version to retrieve. Specify at most one of
   * `versionStage` and `versionId`.
   *
   * @default 'AWSCURRENT'
   */
  readonly versionId?: string;
}

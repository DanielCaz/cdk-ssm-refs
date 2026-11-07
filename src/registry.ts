import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { normalizePrefix, normalizeSegment } from './paths.js';
import type {
  DynamicRefOptions,
  ParamRegistryConfig,
  SecretRefOptions,
} from './types.js';

/** Parameter Store version numbers start at 1 and only ever increase. */
const MIN_PARAM_VERSION = 1;

type Kind = 'parameter' | 'secret';

export class ParamRegistry<
  P extends Record<string, string>,
  S extends Record<string, string>,
> {
  private readonly parameterPath: string;
  private readonly arnPath: string;
  private readonly emitOutputs: boolean;

  constructor(private readonly config: ParamRegistryConfig<P, S>) {
    const { withSlash, withoutSlash } = normalizePrefix(config.prefix);
    this.parameterPath = withSlash;
    this.arnPath = withoutSlash;
    this.emitOutputs = config.emitOutputs ?? false;

    // Fail when the registry is defined rather than on first use. Values are
    // still read lazily afterwards, so later edits to the mappings are seen.
    for (const [key, segment] of Object.entries(config.parameters)) {
      normalizeSegment('parameter', key, segment);
    }
    for (const [key, segment] of Object.entries(config.secrets ?? {})) {
      normalizeSegment('secret', key, segment);
    }
  }

  /**
   * The path under the registry prefix that `key` maps to, normalized.
   */
  private segmentFor(kind: Kind, key: PropertyKey): string {
    const mapping: Record<string, string> =
      kind === 'parameter'
        ? this.config.parameters
        : (this.config.secrets ?? {});

    if (!Object.hasOwn(mapping, key)) {
      throw new Error(`[cdk-ssm-refs] unknown ${kind} key: ${String(key)}`);
    }

    return normalizeSegment(kind, String(key), mapping[key as string]);
  }

  /**
   * The fully qualified SSM parameter name for `key`,
   * e.g. `/team/my-app/vpc-id`.
   */
  parameterName(key: keyof P): string {
    return `${this.parameterPath}/${this.segmentFor('parameter', key)}`;
  }

  /**
   * The fully qualified Secrets Manager secret name for `key`,
   * e.g. `/team/my-app/db-password`.
   */
  secretName(key: keyof S): string {
    return `${this.parameterPath}/${this.segmentFor('secret', key)}`;
  }

  /**
   * Creates an SSM `StringParameter` for `key` under the registry prefix.
   *
   * `id` is used as the construct id as given. Any other
   * `StringParameterProps` (`description`, `tier`, `allowedPattern`, `type`,
   * `dataType`, ...) are passed straight through.
   *
   * When `emitOutputs` is enabled, the `CfnOutput` is created next to the
   * parameter with the construct id `${id}Output`.
   *
   * Note that `StringParameterProps` does not accept a `removalPolicy`; call
   * `parameter.applyRemovalPolicy(...)` on the returned construct instead.
   */
  putParameter(
    scope: Construct,
    id: string,
    key: keyof P,
    value: string,
    props: Omit<ssm.StringParameterProps, 'parameterName' | 'stringValue'> = {},
  ): ssm.StringParameter {
    const parameterName = this.parameterName(key);

    const parameter = new ssm.StringParameter(scope, id, {
      ...props,
      parameterName,
      stringValue: value,
    });

    if (this.emitOutputs) {
      new cdk.CfnOutput(scope, `${id}Output`, {
        value,
        description: parameterName,
      });
    }

    return parameter;
  }

  /**
   * A CloudFormation dynamic reference to the parameter, e.g.
   * `{{resolve:ssm:/team/my-app/vpc-id}}`.
   *
   * Dynamic references are resolved at deploy time, so the parameter must
   * already exist in the target account and region. Calling `putParameter` and
   * `parameterRef` for the same key in a single stack does not work: the
   * reference is resolved before the parameter is created.
   */
  parameterRef(key: keyof P, options: DynamicRefOptions = {}): string {
    return this.dynamicRef('ssm', key, options);
  }

  /**
   * An encrypted dynamic reference to the parameter, e.g.
   * `{{resolve:ssm-secure:/team/my-app/vpc-id}}`.
   *
   * The referenced parameter must have been created as a `SecureString`.
   */
  secureParameterRef(key: keyof P, options: DynamicRefOptions = {}): string {
    return this.dynamicRef('ssm-secure', key, options);
  }

  private dynamicRef(
    service: 'ssm' | 'ssm-secure',
    key: keyof P,
    options: DynamicRefOptions,
  ): string {
    const { version } = options;

    if (
      version !== undefined &&
      (!Number.isInteger(version) || version < MIN_PARAM_VERSION)
    ) {
      throw new Error(
        `[cdk-ssm-refs] version must be a positive integer, received ${version}`,
      );
    }

    const suffix = version === undefined ? '' : `:${version}`;

    return `{{resolve:${service}:${this.parameterName(key)}${suffix}}}`;
  }

  /**
   * Creates a Secrets Manager secret for `key` under the registry prefix.
   *
   * `id` is used as the construct id as given. The secret is created with the
   * exact name `prefix/key`; Secrets Manager appends six random characters to
   * the secret's ARN, not to its name, so the secret can still be looked up
   * by name with {@link ParamRegistry.importSecret} or
   * {@link ParamRegistry.secretRef}.
   */
  createSecret(
    scope: Construct,
    id: string,
    key: keyof S,
    props: Omit<sm.SecretProps, 'secretName'> = {},
  ): sm.Secret {
    return new sm.Secret(scope, id, {
      ...props,
      secretName: this.secretName(key),
    });
  }

  /**
   * A reference to the secret's value that CloudFormation resolves at deploy
   * time, e.g. `{{resolve:secretsmanager:/team/my-app/db-password}}`.
   *
   * It returns a `SecretValue`, which secret-aware constructs such as
   * `rds.Credentials.fromPassword` accept directly and which CDK refuses to
   * render into plain text properties by accident. The secret must already
   * exist in the target account and region.
   *
   * If you rotate the secret, change at least one other property on the
   * resource that uses it so CloudFormation reads the new value.
   */
  secretRef(key: keyof S, options: SecretRefOptions = {}): cdk.SecretValue {
    return cdk.SecretValue.secretsManager(this.secretName(key), options);
  }

  /**
   * Imports the secret for `key` by name, for example to call `grantRead` on
   * it or to hand it to a construct that wants an `ISecret`.
   *
   * The secret must exist in the target account and region.
   */
  importSecret(scope: Construct, id: string, key: keyof S): sm.ISecret {
    return sm.Secret.fromSecretNameV2(scope, id, this.secretName(key));
  }

  /**
   * ARN pattern matching every parameter under the registry prefix, in the
   * partition, region and account of `stack`.
   *
   * For a stack with an explicit environment this is usually a plain string;
   * an environment agnostic stack yields the `AWS::Partition`,
   * `AWS::Region` and `AWS::AccountId` tokens. The pattern carries no
   * permissions by itself: `readPolicyStatements` attaches read actions to
   * it, and you can reuse it for custom read or write policies.
   */
  parameterArnPattern(stack: cdk.Stack): string {
    return stack.formatArn({
      service: 'ssm',
      resource: 'parameter',
      resourceName: `${this.arnPath}/*`,
    });
  }

  /**
   * ARN pattern matching every secret under the registry prefix, in the
   * partition, region and account of `stack`.
   *
   * Secrets Manager separates the name from the resource type with `:`
   * rather than `/`, hence the `secret:` prefix, and the trailing wildcard
   * covers the six random characters Secrets Manager appends to every ARN.
   */
  secretArnPattern(stack: cdk.Stack): string {
    return stack.formatArn({
      service: 'secretsmanager',
      resource: 'secret',
      resourceName: `${this.parameterPath}/*`,
      arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
    });
  }

  /** Whether the registry declares at least one secret. */
  private hasSecrets(): boolean {
    return Object.keys(this.config.secrets ?? {}).length > 0;
  }

  private readPermissions(
    stack: cdk.Stack,
  ): { actions: string[]; resources: string[] }[] {
    const permissions = [
      {
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [this.parameterArnPattern(stack)],
      },
    ];

    if (this.hasSecrets()) {
      permissions.push({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [this.secretArnPattern(stack)],
      });
    }

    return permissions;
  }

  /**
   * Read-only IAM statements scoped to the registry prefix: `ssm:GetParameter`
   * and `ssm:GetParameters` for the parameters, plus
   * `secretsmanager:GetSecretValue` for the secrets when the registry
   * declares any.
   *
   * Customer managed KMS keys need `kms:Decrypt` on top of this, which this
   * library cannot know about.
   */
  readPolicyStatements(stack: cdk.Stack): iam.PolicyStatement[] {
    return this.readPermissions(stack).map(
      ({ actions, resources }) =>
        new iam.PolicyStatement({ actions, resources }),
    );
  }

  /**
   * Grants `grantee` the same read-only access as
   * {@link ParamRegistry.readPolicyStatements}, and returns the resulting
   * `Grant`.
   *
   * The ARNs use the partition, region and account of the stack that
   * contains `grantee`. If `grantee` is not a construct, pass `stack`
   * explicitly.
   */
  grantRead(grantee: iam.IGrantable, stack?: cdk.Stack): iam.Grant {
    const targetStack =
      stack ??
      (Construct.isConstruct(grantee) ? cdk.Stack.of(grantee) : undefined);

    if (targetStack === undefined) {
      throw new Error(
        '[cdk-ssm-refs] grantRead needs a stack when the grantee is not a construct',
      );
    }

    return this.readPermissions(targetStack)
      .map(({ actions, resources }) =>
        iam.Grant.addToPrincipal({
          grantee,
          actions,
          resourceArns: resources,
        }),
      )
      .reduce((combined, grant) => combined.combine(grant));
  }
}

export function defineParamRegistry<
  P extends Record<string, string>,
  S extends Record<string, string> = Record<never, string>,
>(config: ParamRegistryConfig<P, S>): ParamRegistry<P, S> {
  return new ParamRegistry(config);
}

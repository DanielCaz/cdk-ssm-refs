import type { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { normalizePrefix } from './paths.js';
import type { DynamicRefOptions, ParamRegistryConfig } from './types.js';

/** CloudFormation only accepts parameter versions in this range. */
const MIN_PARAM_VERSION = 1;
const MAX_PARAM_VERSION = 100;

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
  }

  /**
   * The fully qualified SSM parameter name for `key`,
   * e.g. `/team/my-app/vpc-id`.
   */
  parameterName(key: keyof P): string {
    const segment = this.config.parameters[key];

    if (typeof segment !== 'string' || segment.length === 0) {
      throw new Error(`[cdk-ssm-refs] unknown parameter key: ${String(key)}`);
    }

    const normalizedSegment = segment.split('/').filter(Boolean).join('/');

    if (normalizedSegment.length === 0) {
      throw new Error(
        `[cdk-ssm-refs] parameter path for key ${String(key)} must contain at least one path segment`,
      );
    }

    return `${this.parameterPath}/${normalizedSegment}`;
  }

  /**
   * Creates an SSM `StringParameter` for `key` under the registry prefix.
   *
   * Any other `StringParameterProps` (`description`, `tier`,
   * `allowedPattern`, `type`, `dataType`, ...) are passed straight through.
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

    const parameter = new ssm.StringParameter(scope, `${id}-param`, {
      ...props,
      parameterName,
      stringValue: value,
    });

    if (this.emitOutputs) {
      new cdk.CfnOutput(scope, `${id}-output`, {
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
      (!Number.isInteger(version) ||
        version < MIN_PARAM_VERSION ||
        version > MAX_PARAM_VERSION)
    ) {
      throw new Error(
        `[cdk-ssm-refs] version must be an integer between ${MIN_PARAM_VERSION} and ${MAX_PARAM_VERSION}, received ${version}`,
      );
    }

    const suffix = version === undefined ? '' : `:${version}`;

    return `{{resolve:${service}:${this.parameterName(key)}${suffix}}}`;
  }

  /**
   * Creates a Secrets Manager secret for `key` under the registry prefix.
   *
   * CloudFormation appends a random six character suffix to every secret
   * name it creates, so the resulting name is not exactly
   * `prefix/key` and cannot be referenced by name from another stack.
   */
  createSecret(
    scope: Construct,
    id: string,
    key: keyof S,
    props: Omit<sm.SecretProps, 'secretName'> = {},
  ): sm.Secret {
    const segment = this.config.secrets?.[key];

    if (typeof segment !== 'string' || segment.length === 0) {
      throw new Error(`[cdk-ssm-refs] unknown secret key: ${String(key)}`);
    }

    return new sm.Secret(scope, `${id}-secret`, {
      ...props,
      secretName: `${this.parameterPath}/${segment}`,
    });
  }

  /**
   * ARN pattern matching every parameter under the registry prefix, in the
   * region and account of `stack`.
   *
   * The partition is fixed to `aws`, the US commercial partition, so no
   * partition lookup, feature flag or pseudo parameter is involved. For a
   * stack with an explicit environment the result is a plain string with no
   * tokens in it; an environment agnostic stack still yields the
   * `AWS::Region` and `AWS::AccountId` tokens. The pattern carries no
   * permissions by itself: `readPolicyStatements` attaches read actions to
   * it, and you can reuse it for custom read or write policies.
   */
  parameterArnPattern(stack: cdk.Stack): string {
    return `arn:aws:ssm:${stack.region}:${stack.account}:parameter/${this.arnPath}/*`;
  }

  /**
   * ARN pattern matching every secret under the registry prefix.
   *
   * Secrets Manager separates the name from the resource type with `:`
   * rather than `/`, hence the `secret:` prefix, and the trailing wildcard
   * covers the suffix CloudFormation appends to each name.
   */
  secretArnPattern(stack: cdk.Stack): string {
    return `arn:aws:secretsmanager:${stack.region}:${stack.account}:secret:${this.parameterPath}/*`;
  }

  /**
   * Read-only IAM statements scoped to the registry prefix: `ssm:GetParameter`
   * and `ssm:GetParameters` for the parameters, and
   * `secretsmanager:GetSecretValue` for the secrets.
   */
  readPolicyStatements(stack: cdk.Stack): iam.PolicyStatement[] {
    return [
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [this.parameterArnPattern(stack)],
      }),
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [this.secretArnPattern(stack)],
      }),
    ];
  }
}

export function defineParamRegistry<
  P extends Record<string, string>,
  S extends Record<string, string> = Record<never, string>,
>(config: ParamRegistryConfig<P, S>): ParamRegistry<P, S> {
  return new ParamRegistry(config);
}

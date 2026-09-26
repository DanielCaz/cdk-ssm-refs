import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ParameterTier } from 'aws-cdk-lib/aws-ssm';
import { defineParamRegistry, normalizePrefix } from '../src/index';

const account = '123456789012';

function registry() {
  return defineParamRegistry({
    prefix: '/team/my-app',
    parameters: { vpcId: 'vpc-id' },
    secrets: { dbPassword: 'db-password' },
  });
}

function stackIn(region: string) {
  return new cdk.Stack(new cdk.App(), 'Stack', { env: { account, region } });
}

function plainStack() {
  return new cdk.Stack(new cdk.App(), 'Stack');
}

describe('normalizePrefix', () => {
  it('accepts a prefix that starts with "/"', () => {
    const expected = { withSlash: '/team/my-app', withoutSlash: 'team/my-app' };

    expect(normalizePrefix('/team/my-app')).toEqual(expected);
    expect(normalizePrefix('/team/my-app/')).toEqual(expected);
    expect(normalizePrefix('/team/my-app//')).toEqual(expected);
  });

  it('rejects a prefix that does not start with "/"', () => {
    expect(() => normalizePrefix('team/my-app')).toThrow(/must start with/);
    expect(() => normalizePrefix('')).toThrow(/must start with/);
  });

  it('rejects a prefix that has no path segment', () => {
    expect(() => normalizePrefix('/')).toThrow(/at least one path segment/);
  });

  it('rejects empty path segments', () => {
    expect(() => normalizePrefix('//team/my-app')).toThrow(
      /empty path segments/,
    );
    expect(() => normalizePrefix('/team//my-app')).toThrow(
      /empty path segments/,
    );
  });

  it('is enforced when a registry is constructed', () => {
    expect(() =>
      defineParamRegistry({ prefix: 'team/my-app', parameters: {} }),
    ).toThrow(/must start with/);
  });
});

describe('ParamRegistry', () => {
  it('creates a parameter with the normalized prefix', () => {
    const stack = plainStack();

    registry().putParameter(stack, 'VpcIdParam', 'vpcId', 'vpc-123');

    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/team/my-app/vpc-id',
      Value: 'vpc-123',
    });
  });

  it('passes extra parameter props through to the construct', () => {
    const stack = plainStack();

    registry().putParameter(stack, 'VpcIdParam', 'vpcId', 'vpc-123', {
      description: 'The VPC id',
      tier: ParameterTier.ADVANCED,
    });

    Template.fromStack(stack).hasResourceProperties('AWS::SSM::Parameter', {
      Description: 'The VPC id',
      Tier: 'Advanced',
    });
  });

  it('does not emit stack outputs by default', () => {
    const stack = plainStack();

    registry().putParameter(stack, 'VpcIdParam', 'vpcId', 'vpc-123');

    const json = Template.fromStack(stack).toJSON() as {
      Outputs?: Record<string, unknown>;
    };
    expect(Object.keys(json.Outputs ?? {})).toHaveLength(0);
  });

  it('emits a stack output per parameter when emitOutputs is enabled', () => {
    const stack = plainStack();
    const registryWithOutputs = defineParamRegistry({
      prefix: '/team/my-app',
      parameters: { vpcId: 'vpc-id' },
      emitOutputs: true,
    });

    registryWithOutputs.putParameter(stack, 'VpcIdParam', 'vpcId', 'vpc-123');

    // CDK strips the "-" from the construct id when synthesizing the logical
    // id, so 'VpcIdParam-output' becomes 'VpcIdParamoutput'.
    Template.fromStack(stack).hasOutput('VpcIdParamoutput', {
      Value: 'vpc-123',
    });
  });

  it('exposes the fully qualified parameter name', () => {
    expect(registry().parameterName('vpcId')).toBe('/team/my-app/vpc-id');
  });

  it('produces a matching parameter dynamic ref', () => {
    expect(registry().parameterRef('vpcId')).toBe(
      '{{resolve:ssm:/team/my-app/vpc-id}}',
    );
  });

  it('pins a parameter dynamic ref to a version', () => {
    expect(registry().parameterRef('vpcId', { version: 3 })).toBe(
      '{{resolve:ssm:/team/my-app/vpc-id:3}}',
    );
  });

  it('produces an encrypted parameter dynamic ref', () => {
    expect(registry().secureParameterRef('vpcId')).toBe(
      '{{resolve:ssm-secure:/team/my-app/vpc-id}}',
    );
  });

  it('rejects a version outside the CloudFormation range', () => {
    expect(() => registry().parameterRef('vpcId', { version: 0 })).toThrow(
      /between 1 and 100/,
    );
    expect(() => registry().parameterRef('vpcId', { version: 101 })).toThrow(
      /between 1 and 100/,
    );
    expect(() => registry().parameterRef('vpcId', { version: 1.5 })).toThrow(
      /between 1 and 100/,
    );
  });

  it('creates a secret under the registry prefix', () => {
    const stack = plainStack();

    registry().createSecret(stack, 'DbPassword', 'dbPassword', {
      description: 'Database password',
    });

    Template.fromStack(stack).hasResourceProperties(
      'AWS::SecretsManager::Secret',
      {
        Name: '/team/my-app/db-password',
        Description: 'Database password',
      },
    );
  });

  it('rejects an unknown secret key at runtime', () => {
    expect(() =>
      registry().createSecret(plainStack(), 'Missing', 'nope' as never),
    ).toThrow(/unknown secret key/);
  });

  it('rejects an unknown parameter key at runtime', () => {
    expect(() => registry().parameterName('nope' as never)).toThrow(
      /unknown parameter key/,
    );
  });

  it('rejects an unknown parameter key at compile time', () => {
    // @ts-expect-error 'nope' is not one of the declared parameter keys
    expect(() => registry().parameterRef('nope')).toThrow(
      /unknown parameter key/,
    );
  });

  it('grants scoped read access to the registry prefix', () => {
    const statements = registry().readPolicyStatements(stackIn('us-east-1'));

    expect(statements.map((statement) => statement.actions)).toEqual([
      ['ssm:GetParameter', 'ssm:GetParameters'],
      ['secretsmanager:GetSecretValue'],
    ]);
    expect(statements[0]?.resources).toEqual([
      `arn:aws:ssm:us-east-1:${account}:parameter/team/my-app/*`,
    ]);
    expect(statements[1]?.resources).toEqual([
      `arn:aws:secretsmanager:us-east-1:${account}:secret:/team/my-app/*`,
    ]);
  });
});

describe('ARN patterns', () => {
  it('builds literal ARNs from the stack region and account', () => {
    const stack = stackIn('us-east-1');

    expect(registry().parameterArnPattern(stack)).toBe(
      `arn:aws:ssm:us-east-1:${account}:parameter/team/my-app/*`,
    );
    expect(registry().secretArnPattern(stack)).toBe(
      `arn:aws:secretsmanager:us-east-1:${account}:secret:/team/my-app/*`,
    );
  });
});

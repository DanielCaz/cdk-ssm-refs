import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
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

function parametersOnly() {
  return defineParamRegistry({
    prefix: '/team/my-app',
    parameters: { vpcId: 'vpc-id' },
  });
}

/**
 * A stack in `region`. The partition literals flag makes CDK render the
 * partition as a literal where the installed `aws-cdk-lib` supports it;
 * otherwise it stays an `AWS::Partition` token. Tests therefore build their
 * expected ARNs from `stack.partition`.
 */
function stackIn(region: string) {
  const app = new cdk.App({
    context: { '@aws-cdk/core:enablePartitionLiterals': true },
  });
  return new cdk.Stack(app, 'Stack', { env: { account, region } });
}

/** Expected SSM parameter ARN pattern for `stack`. */
function ssmArn(stack: cdk.Stack) {
  return `arn:${stack.partition}:ssm:${stack.region}:${account}:parameter/team/my-app/*`;
}

/** Expected Secrets Manager ARN pattern for `stack`. */
function secretArn(stack: cdk.Stack) {
  return `arn:${stack.partition}:secretsmanager:${stack.region}:${account}:secret:/team/my-app/*`;
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

    // The output is created next to the parameter as `${id}Output`.
    Template.fromStack(stack).hasOutput('VpcIdParamOutput', {
      Value: 'vpc-123',
    });
  });

  it('uses the given construct id for the parameter as is', () => {
    const stack = plainStack();

    const parameter = registry().putParameter(
      stack,
      'VpcIdParam',
      'vpcId',
      'vpc-123',
    );

    expect(parameter.node.id).toBe('VpcIdParam');
    expect(
      Object.keys(
        Template.fromStack(stack).findResources('AWS::SSM::Parameter'),
      ),
    ).toEqual([expect.stringMatching(/^VpcIdParam[0-9A-F]{8}$/)]);
  });

  it('keeps the 0.1.0 logical id when the old suffixed id is passed', () => {
    const stack = plainStack();

    registry().putParameter(stack, 'VpcIdParam-param', 'vpcId', 'vpc-123');

    // 0.1.0 created the construct as `${id}-param`, which synthesized to this.
    expect(
      Object.keys(
        Template.fromStack(stack).findResources('AWS::SSM::Parameter'),
      ),
    ).toEqual([expect.stringMatching(/^VpcIdParamparam[0-9A-F]{8}$/)]);
  });

  it('exposes the fully qualified parameter name', () => {
    expect(registry().parameterName('vpcId')).toBe('/team/my-app/vpc-id');
  });

  it('normalizes trailing prefix slashes before joining a parameter path', () => {
    const registryWithTrailingSlash = defineParamRegistry({
      prefix: '/team/my-app//',
      parameters: { vpcId: 'vpc-id' },
    });

    expect(registryWithTrailingSlash.parameterName('vpcId')).toBe(
      '/team/my-app/vpc-id',
    );
  });

  it('normalizes a leading slash in the parameter path', () => {
    const registryWithLeadingSlash = defineParamRegistry({
      prefix: '/team/my-app',
      parameters: { vpcId: '/vpc-id' },
    });

    expect(registryWithLeadingSlash.parameterName('vpcId')).toBe(
      '/team/my-app/vpc-id',
    );
  });

  it('normalizes repeated slashes within a parameter path', () => {
    const registryWithRepeatedSlash = defineParamRegistry({
      prefix: '/team/my-app',
      parameters: { vpcId: 'network//vpc-id' },
    });

    expect(registryWithRepeatedSlash.parameterName('vpcId')).toBe(
      '/team/my-app/network/vpc-id',
    );
  });

  it('uses the current parameter path value from the mapping', () => {
    const parameters = { vpcId: 'vpc-id' };
    const mutableRegistry = defineParamRegistry({
      prefix: '/team/my-app',
      parameters,
    });

    parameters.vpcId = '/vpc-id';

    expect(mutableRegistry.parameterName('vpcId')).toBe('/team/my-app/vpc-id');
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

  it('accepts versions above 100, which long-lived parameters reach', () => {
    expect(registry().parameterRef('vpcId', { version: 150 })).toBe(
      '{{resolve:ssm:/team/my-app/vpc-id:150}}',
    );
  });

  it('pins an encrypted parameter dynamic ref to a version', () => {
    expect(registry().secureParameterRef('vpcId', { version: 2 })).toBe(
      '{{resolve:ssm-secure:/team/my-app/vpc-id:2}}',
    );
  });

  it('rejects a version that is not a positive integer', () => {
    for (const version of [0, -1, 1.5, Number.NaN]) {
      expect(() => registry().parameterRef('vpcId', { version })).toThrow(
        /positive integer/,
      );
      expect(() => registry().secureParameterRef('vpcId', { version })).toThrow(
        /positive integer/,
      );
    }
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
    const stack = stackIn('us-east-1');
    const statements = registry().readPolicyStatements(stack);

    expect(statements.map((statement) => statement.actions)).toEqual([
      ['ssm:GetParameter', 'ssm:GetParameters'],
      ['secretsmanager:GetSecretValue'],
    ]);
    expect(statements[0]?.resources).toEqual([ssmArn(stack)]);
    expect(statements[1]?.resources).toEqual([secretArn(stack)]);
  });

  it('leaves out the Secrets Manager statement when there are no secrets', () => {
    const statements = parametersOnly().readPolicyStatements(
      stackIn('us-east-1'),
    );

    expect(statements.map((statement) => statement.actions)).toEqual([
      ['ssm:GetParameter', 'ssm:GetParameters'],
    ]);
  });

  it('leaves out the Secrets Manager statement for an empty secrets map', () => {
    const emptySecrets = defineParamRegistry({
      prefix: '/team/my-app',
      parameters: { vpcId: 'vpc-id' },
      secrets: {},
    });

    expect(emptySecrets.readPolicyStatements(plainStack())).toHaveLength(1);
  });
});

describe('path segments', () => {
  it('rejects an empty parameter path when the registry is defined', () => {
    expect(() =>
      defineParamRegistry({ prefix: '/a', parameters: { x: '' } }),
    ).toThrow(/parameter path for key "x"/);
    expect(() =>
      defineParamRegistry({ prefix: '/a', parameters: { x: '//' } }),
    ).toThrow(/at least one path segment/);
  });

  it('rejects an empty secret path when the registry is defined', () => {
    expect(() =>
      defineParamRegistry({
        prefix: '/a',
        parameters: {},
        secrets: { s: '/' },
      }),
    ).toThrow(/secret path for key "s"/);
  });

  it('allows nested paths', () => {
    const nested = defineParamRegistry({
      prefix: '/a',
      parameters: { x: 'network/vpc-id' },
      secrets: { s: 'db/password' },
    });

    expect(nested.parameterName('x')).toBe('/a/network/vpc-id');
    expect(nested.secretName('s')).toBe('/a/db/password');
  });

  it('normalizes secret paths the same way as parameter paths', () => {
    const messy = defineParamRegistry({
      prefix: '/a/',
      parameters: {},
      secrets: { s: '/db//password/' },
    });

    expect(messy.secretName('s')).toBe('/a/db/password');
  });

  it('does not treat inherited object properties as keys', () => {
    expect(() => registry().parameterName('toString' as never)).toThrow(
      /unknown parameter key/,
    );
  });
});

describe('secrets', () => {
  it('uses the given construct id for the secret as is', () => {
    const stack = plainStack();

    const secret = registry().createSecret(stack, 'DbPassword', 'dbPassword');

    expect(secret.node.id).toBe('DbPassword');
    expect(
      Object.keys(
        Template.fromStack(stack).findResources('AWS::SecretsManager::Secret'),
      ),
    ).toEqual([expect.stringMatching(/^DbPassword[0-9A-F]{8}$/)]);
  });

  it('exposes the fully qualified secret name', () => {
    expect(registry().secretName('dbPassword')).toBe(
      '/team/my-app/db-password',
    );
  });

  it('rejects an unknown secret key for secretName at runtime', () => {
    expect(() => registry().secretName('nope' as never)).toThrow(
      /unknown secret key/,
    );
  });

  it('builds a Secrets Manager dynamic reference', () => {
    const stack = plainStack();

    expect(stack.resolve(registry().secretRef('dbPassword'))).toBe(
      '{{resolve:secretsmanager:/team/my-app/db-password:SecretString:::}}',
    );
  });

  it('passes jsonField, versionStage and versionId to the reference', () => {
    const stack = plainStack();

    expect(
      stack.resolve(
        registry().secretRef('dbPassword', {
          jsonField: 'password',
          versionStage: 'AWSPREVIOUS',
        }),
      ),
    ).toBe(
      '{{resolve:secretsmanager:/team/my-app/db-password:SecretString:password:AWSPREVIOUS:}}',
    );
    expect(
      stack.resolve(
        registry().secretRef('dbPassword', { versionId: 'abc-123' }),
      ),
    ).toBe(
      '{{resolve:secretsmanager:/team/my-app/db-password:SecretString:::abc-123}}',
    );
  });

  it('rejects an unknown secret key for secretRef at compile time', () => {
    // @ts-expect-error 'nope' is not one of the declared secret keys
    expect(() => registry().secretRef('nope')).toThrow(/unknown secret key/);
  });

  it('is uncallable for secrets when the registry declares none', () => {
    // @ts-expect-error this registry has no secrets, so no key is valid
    expect(() => parametersOnly().secretRef('anything')).toThrow(
      /unknown secret key/,
    );
  });

  it('imports a secret by its name', () => {
    const stack = plainStack();

    const secret = registry().importSecret(stack, 'Imported', 'dbPassword');

    expect(secret.node.id).toBe('Imported');
    expect(stack.resolve(secret.secretName)).toBe('/team/my-app/db-password');
  });
});

describe('grantRead', () => {
  function role(stack: cdk.Stack) {
    return new iam.Role(stack, 'Reader', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
  }

  it('attaches scoped parameter and secret read access to a role', () => {
    const stack = stackIn('us-east-1');

    const grant = registry().grantRead(role(stack));

    expect(grant.success).toBe(true);
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: ['ssm:GetParameter', 'ssm:GetParameters'],
            Effect: 'Allow',
            Resource: stack.resolve(ssmArn(stack)),
          },
          {
            Action: 'secretsmanager:GetSecretValue',
            Effect: 'Allow',
            Resource: stack.resolve(secretArn(stack)),
          },
        ],
      },
    });
  });

  it('grants only SSM access when the registry has no secrets', () => {
    const stack = stackIn('us-east-1');

    parametersOnly().grantRead(role(stack));

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: ['ssm:GetParameter', 'ssm:GetParameters'],
            Effect: 'Allow',
            Resource: stack.resolve(ssmArn(stack)),
          },
        ],
      },
    });
  });

  it('uses the region and partition of the stack the grantee lives in', () => {
    const stack = stackIn('cn-north-1');

    registry().grantRead(role(stack));

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          { Resource: stack.resolve(ssmArn(stack)) },
          { Resource: stack.resolve(secretArn(stack)) },
        ],
      },
    });
  });

  it('needs a stack when the grantee is not a construct', () => {
    const stack = stackIn('us-east-1');
    const grantee = role(stack).grantPrincipal;

    expect(() => registry().grantRead({ grantPrincipal: grantee })).toThrow(
      /needs a stack/,
    );
    expect(
      registry().grantRead({ grantPrincipal: grantee }, stack).success,
    ).toBe(true);
  });
});

describe('ARN patterns', () => {
  it('builds ARNs from the stack partition, region and account', () => {
    const stack = stackIn('us-east-1');

    expect(registry().parameterArnPattern(stack)).toBe(ssmArn(stack));
    expect(registry().secretArnPattern(stack)).toBe(secretArn(stack));
  });
});

// Older aws-cdk-lib versions do not support partition literals and keep the
// partition as an `AWS::Partition` token, so there is nothing to check there.
const supportsPartitionLiterals = !cdk.Token.isUnresolved(
  stackIn('us-east-1').partition,
);

describe.skipIf(!supportsPartitionLiterals)('partition literals', () => {
  it.each([
    ['us-east-1', 'aws'],
    ['us-gov-west-1', 'aws-us-gov'],
    ['cn-north-1', 'aws-cn'],
  ])('uses the partition of %s', (region, partition) => {
    const stack = stackIn(region);

    expect(registry().parameterArnPattern(stack)).toBe(
      `arn:${partition}:ssm:${region}:${account}:parameter/team/my-app/*`,
    );
    expect(registry().secretArnPattern(stack)).toBe(
      `arn:${partition}:secretsmanager:${region}:${account}:secret:/team/my-app/*`,
    );
  });
});

describe('ARN patterns (environment agnostic)', () => {
  it('yields pseudo parameters for an environment agnostic stack', () => {
    const stack = plainStack();

    expect(stack.resolve(registry().parameterArnPattern(stack))).toEqual({
      'Fn::Join': [
        '',
        [
          'arn:',
          { Ref: 'AWS::Partition' },
          ':ssm:',
          { Ref: 'AWS::Region' },
          ':',
          { Ref: 'AWS::AccountId' },
          ':parameter/team/my-app/*',
        ],
      ],
    });
  });
});

# cdk-ssm-refs

Typed registry for AWS Systems Manager parameters and Secrets Manager secrets in AWS CDK.

Declare your parameters and secrets once, and get a consistent path prefix, compile-time
checked keys, ready-made dynamic references, and IAM read policies scoped to exactly that
prefix.

## Install

```bash
bun add @danielcaz/cdk-ssm-refs
```

`aws-cdk-lib`, `constructs`, and `typescript` are peer dependencies, so your CDK app
supplies them.

## Usage

```ts
import { defineParamRegistry } from '@danielcaz/cdk-ssm-refs';

export const params = defineParamRegistry({
  prefix: '/team/my-app', // must start with '/'; trailing slashes are ignored
  parameters: {
    vpcId: 'vpc-id',
    subnetIds: 'subnet-ids',
  },
  secrets: {
    dbPassword: 'db-password',
  },
});
```

The keys of `parameters` and `secrets` are the only values accepted by the `key` argument
of every method, so an unknown key is a compile error.

### Writing parameters

```ts
import { ParameterTier } from 'aws-cdk-lib/aws-ssm';

// Creates /team/my-app/vpc-id
params.putParameter(this, 'VpcIdParam', 'vpcId', vpc.vpcId);

// Any other StringParameterProps are passed through
params.putParameter(this, 'SubnetIdsParam', 'subnetIds', subnetIds.join(','), {
  description: 'Private subnet ids',
  tier: ParameterTier.STANDARD,
});
```

### Reading parameters from another stack

```ts
// '{{resolve:ssm:/team/my-app/vpc-id}}'
const vpcId = params.parameterRef('vpcId');

// Pinned to a specific version, for drift detection
const pinned = params.parameterRef('vpcId', { version: 3 });

// Encrypted reference - requires a SecureString parameter
const secure = params.secureParameterRef('vpcId');
```

### Secrets

```ts
const secret = params.createSecret(this, 'DbPassword', 'dbPassword', {
  description: 'Database password',
  generateSecretString: { excludePunctuation: true },
});

// Use secret.secretValue directly within the creating stack
```

### IAM read policies

```ts
import { Stack } from 'aws-cdk-lib';

const role = new iam.Role(this, 'Reader', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
});

// ssm:GetParameter(s) plus secretsmanager:GetSecretValue, both scoped
// to the registry prefix in the region and account of the stack.
for (const statement of params.readPolicyStatements(Stack.of(this))) {
  role.addToPolicy(statement);
}
```

The ARN patterns are also exposed on their own via `parameterArnPattern(stack)` and
`secretArnPattern(stack)` if you need to build a different policy.

## API

| Member                                        | Description                                                      |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `defineParamRegistry(config)`                 | Creates a `ParamRegistry`.                                       |
| `config.prefix`                               | Path prefix. Must start with `/`; trailing slashes ignored.      |
| `config.parameters`                           | Key to path-segment map for SSM parameters.                      |
| `config.secrets`                              | Key to path-segment map for Secrets Manager secrets. Optional.   |
| `config.emitOutputs`                          | Emit a `CfnOutput` per `putParameter` call. Defaults to `false`. |
| `parameterName(key)`                          | Fully qualified parameter name, e.g. `/team/my-app/vpc-id`.      |
| `putParameter(scope, id, key, value, props?)` | Creates a `StringParameter`.                                     |
| `parameterRef(key, options?)`                 | `{{resolve:ssm:...}}` dynamic reference.                         |
| `secureParameterRef(key, options?)`           | `{{resolve:ssm-secure:...}}` dynamic reference.                  |
| `createSecret(scope, id, key, props?)`        | Creates a `Secret`.                                              |
| `parameterArnPattern(stack)`                  | ARN pattern for every parameter under the prefix.                |
| `secretArnPattern(stack)`                     | ARN pattern for every secret under the prefix.                   |
| `readPolicyStatements(stack)`                 | Read-only IAM statements for both patterns.                      |
| `normalizePrefix(prefix)`                     | Low-level prefix normalizer used by the constructor.             |

## Caveats

- **`prefix` must start with `/`.** `defineParamRegistry` throws on `'team/my-app'`, so write
  `'/team/my-app'`. Trailing slashes are ignored, and empty segments (`//`) are rejected.
- **Dynamic references resolve at deploy time.** The parameter must already exist in the
  target account and region, so calling `putParameter` and `parameterRef` for the same
  key in one stack will not work — the reference is resolved before the parameter is
  created.
- **References are not version-pinned by default.** `parameterRef('vpcId')` resolves
  whatever version is current at deploy time and will not report drift when the value
  changes. Pass `{ version }` if you want that.
- **`secureParameterRef` requires a `SecureString` parameter.** Plain `String`
  parameters cannot be read through `ssm-secure`.
- **Secret names get a random suffix.** CloudFormation appends six characters to every
  secret name it creates, so a secret cannot be looked up by its exact name from another
  stack.
- **`StringParameterProps` has no `removalPolicy`.** Call
  `parameter.applyRemovalPolicy(...)` on the construct returned by `putParameter`
  instead.
- **`readPolicyStatements` grants `GetParameter`/`GetParameters` only.** Add
  `ssm:GetParametersByPath` yourself if you load the whole subtree by path.
- **ARN patterns are pinned to the `aws` partition.** `parameterArnPattern` and
  `secretArnPattern` return `arn:aws:...` strings built from the stack's region and account,
  with no partition lookup, feature flag or partition pseudo parameter involved, so for a
  stack with an explicit environment they are plain strings that are easy to assert on. A
  GovCloud or China deployment would need the partition parameterized again.
- **ESM only.** The package is published as ESM and requires Node >= 20.19.0, which is the
  first release where `require(esm)` works without a flag.

## Development

```bash
bun install
bun run test
bun run typecheck
bun run build
```

# cdk-ssm-refs

[![npm version](https://img.shields.io/npm/v/cdk-ssm-refs)](https://www.npmjs.com/package/cdk-ssm-refs)
[![CI](https://github.com/DanielCaz/cdk-ssm-refs/actions/workflows/validate-pr.yml/badge.svg?branch=main)](https://github.com/DanielCaz/cdk-ssm-refs/actions/workflows/validate-pr.yml)
[![license](https://img.shields.io/github/license/DanielCaz/cdk-ssm-refs)](./LICENSE)
[![node](https://img.shields.io/node/v/cdk-ssm-refs)](https://nodejs.org)

Typed registry for AWS Systems Manager parameters and Secrets Manager secrets in AWS CDK.

Declare your parameters and secrets once, and get a consistent path prefix, compile-time
checked keys, ready-made dynamic references, and IAM read policies scoped to exactly that
prefix.

## Install

```bash
npm install cdk-ssm-refs
# or: pnpm add cdk-ssm-refs / yarn add cdk-ssm-refs / bun add cdk-ssm-refs
```

`aws-cdk-lib` (`^2.73.0`) and `constructs` (`^10.0.0`) are peer dependencies, so your CDK
app supplies them. CI runs the test suite against both the oldest and the newest versions
those ranges allow. `typescript` (`^5.9.3`) is an optional peer dependency; the package
ships its own type declarations.

## Usage

```ts
import { defineParamRegistry } from 'cdk-ssm-refs';

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

`putParameter` returns the `StringParameter` it creates, so you can keep working with the
construct. To pin one, call `applyRemovalPolicy(RemovalPolicy.RETAIN)` on the return value,
importing `RemovalPolicy` from `aws-cdk-lib/core`.

### Emitting stack outputs

```ts
const params = defineParamRegistry({
  prefix: '/team/my-app',
  parameters: { vpcId: 'vpc-id' },
  emitOutputs: true,
});

params.putParameter(this, 'VpcIdParam', 'vpcId', vpc.vpcId);
// Also creates a CfnOutput from the construct id 'VpcIdParam-output'
```

With `emitOutputs` enabled every `putParameter` call additionally emits a `CfnOutput` whose
value is the raw parameter value. See the caveats below before turning this on.

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
import * as iam from 'aws-cdk-lib/aws-iam';

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

| Member                                                            | Description                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `defineParamRegistry(config)`                                     | Creates a `ParamRegistry`.                                       |
| `ParamRegistry`                                                   | The class itself, if you need it as a type.                      |
| `config.prefix`                                                   | Path prefix. Must start with `/`; trailing slashes ignored.      |
| `config.parameters`                                               | Key to path-segment map for SSM parameters.                      |
| `config.secrets`                                                  | Key to path-segment map for Secrets Manager secrets. Optional.   |
| `config.emitOutputs`                                              | Emit a `CfnOutput` per `putParameter` call. Defaults to `false`. |
| `parameterName(key)` → `string`                                   | Fully qualified parameter name, e.g. `/team/my-app/vpc-id`.      |
| `putParameter(scope, id, key, value, props?)` → `StringParameter` | Creates a `StringParameter`.                                     |
| `parameterRef(key, options?)` → `string`                          | `{{resolve:ssm:...}}` dynamic reference.                         |
| `secureParameterRef(key, options?)` → `string`                    | `{{resolve:ssm-secure:...}}` dynamic reference.                  |
| `createSecret(scope, id, key, props?)` → `Secret`                 | Creates a `Secret`.                                              |
| `parameterArnPattern(stack)` → `string`                           | ARN pattern for every parameter under the prefix.                |
| `secretArnPattern(stack)` → `string`                              | ARN pattern for every secret under the prefix.                   |
| `readPolicyStatements(stack)` → `PolicyStatement[]`               | Read-only IAM statements for both patterns.                      |
| `normalizePrefix(prefix)` → `{ withSlash, withoutSlash }`         | Low-level prefix normalizer used by the constructor.             |

`ParamRegistryConfig` and `DynamicRefOptions` are also exported as types, for annotating
your own helpers.

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
- **`version` must be an integer from 1 to 100.** CloudFormation accepts no other
  parameter versions, so `parameterRef('vpcId', { version: 0 })` throws.
- **`emitOutputs` writes the value into the template.** Each `CfnOutput` carries the raw
  parameter value, which anyone who can read the stack can see, so leave it off for
  sensitive values. CloudFormation logical ids cannot contain `-`, so CDK strips it during
  synthesis and the `'VpcIdParam-output'` construct id is deployed as `VpcIdParamoutput`.
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
  stack with an explicit environment they are plain strings that are easy to assert on.
- **ESM only.** The package ships ESM and requires Node >= 20.19.0, which is the
  first release where `require(esm)` works without a flag.

## Development

```bash
bun install
bun run test
bun run typecheck
bun run format:check
bun run build
bun run check:package
```

## Versioning and releases

This project follows [Semantic Versioning](https://semver.org). While the version is `0.x`,
breaking changes bump the minor version. Releases are automated with
[release-please](https://github.com/googleapis/release-please) from
[Conventional Commits](https://www.conventionalcommits.org), and every release is published
to npm with provenance. See the [changelog](./CHANGELOG.md) and the
[GitHub releases](https://github.com/DanielCaz/cdk-ssm-refs/releases) for what changed.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first. To report
a vulnerability, see [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)

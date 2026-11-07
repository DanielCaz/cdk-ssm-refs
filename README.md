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

Each value is the path under the prefix. It may be nested (`'network/vpc-id'`), and leading,
trailing and repeated slashes are ignored. A value with no path segment at all (`''` or
`'/'`) throws as soon as the registry is defined.

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

The `id` is used as the construct id as given. `putParameter` returns the
`StringParameter` it creates, so you can keep working with the construct. To pin one, call `applyRemovalPolicy(RemovalPolicy.RETAIN)` on the return value,
importing `RemovalPolicy` from `aws-cdk-lib/core`.

### Emitting stack outputs

```ts
const params = defineParamRegistry({
  prefix: '/team/my-app',
  parameters: { vpcId: 'vpc-id' },
  emitOutputs: true,
});

params.putParameter(this, 'VpcIdParam', 'vpcId', vpc.vpcId);
// Also creates a CfnOutput from the construct id 'VpcIdParamOutput'
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

The secret is created with the exact name `/team/my-app/db-password`, so other stacks can
find it by name:

```ts
import * as rds from 'aws-cdk-lib/aws-rds';

// A SecretValue holding '{{resolve:secretsmanager:/team/my-app/db-password}}'.
// Secret-aware constructs accept it directly.
const password = params.secretRef('dbPassword');
rds.Credentials.fromPassword('admin', password);

// One field of a JSON secret, or a specific version
params.secretRef('dbPassword', { jsonField: 'password' });
params.secretRef('dbPassword', { versionStage: 'AWSPREVIOUS' });

// An ISecret, for grantRead() and constructs that want a secret object
const imported = params.importSecret(this, 'ImportedDbPassword', 'dbPassword');
imported.grantRead(role);
```

`secretRef` and `importSecret` need the secret to exist in the target account and region
before the stack that uses them is deployed.

### IAM read policies

```ts
import * as iam from 'aws-cdk-lib/aws-iam';

const role = new iam.Role(this, 'Reader', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
});

// ssm:GetParameter(s) on the registry prefix, plus
// secretsmanager:GetSecretValue when the registry declares secrets.
params.grantRead(role);

// Works on anything grantable, such as a Lambda function
params.grantRead(fn);
```

`grantRead(grantee)` uses the partition, region and account of the stack that contains the
grantee. If the grantee is not a construct, pass the stack as the second argument.

If you need the statements themselves, `readPolicyStatements(stack)` returns them, and the
ARN patterns are also exposed on their own via `parameterArnPattern(stack)` and
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
| `secretName(key)` → `string`                                      | Fully qualified secret name, e.g. `/team/my-app/db-password`.    |
| `putParameter(scope, id, key, value, props?)` → `StringParameter` | Creates a `StringParameter`.                                     |
| `parameterRef(key, options?)` → `string`                          | `{{resolve:ssm:...}}` dynamic reference.                         |
| `secureParameterRef(key, options?)` → `string`                    | `{{resolve:ssm-secure:...}}` dynamic reference.                  |
| `createSecret(scope, id, key, props?)` → `Secret`                 | Creates a `Secret`.                                              |
| `secretRef(key, options?)` → `SecretValue`                        | `{{resolve:secretsmanager:...}}` dynamic reference.              |
| `importSecret(scope, id, key)` → `ISecret`                        | Imports the secret by name.                                      |
| `parameterArnPattern(stack)` → `string`                           | ARN pattern for every parameter under the prefix.                |
| `secretArnPattern(stack)` → `string`                              | ARN pattern for every secret under the prefix.                   |
| `readPolicyStatements(stack)` → `PolicyStatement[]`               | Read-only IAM statements for the registry.                       |
| `grantRead(grantee, stack?)` → `Grant`                            | Grants those read-only statements to `grantee`.                  |
| `normalizePrefix(prefix)` → `{ withSlash, withoutSlash }`         | Low-level prefix normalizer used by the constructor.             |

`ParamRegistryConfig`, `DynamicRefOptions` and `SecretRefOptions` are also exported as types,
for annotating your own helpers.

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
- **`version` must be a positive integer.** `parameterRef('vpcId', { version: 0 })` throws.
  Parameter Store keeps only the 100 most recent versions of a parameter, but version
  numbers keep increasing, so a parameter that has been updated 150 times has a valid
  version 150.
- **`emitOutputs` writes the value into the template.** Each `CfnOutput` carries the raw
  parameter value, which anyone who can read the stack can see, so leave it off for
  sensitive values. The output's construct id is `${id}Output`, so avoid giving another
  construct in the same scope that id.
- **`secureParameterRef` requires a `SecureString` parameter.** Plain `String`
  parameters cannot be read through `ssm-secure`. CloudFormation also cannot create
  `SecureString` parameters, so they have to exist already, and `ssm-secure` references
  only work in [supported resource properties](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-ssm-secure-strings.html).
- **Secrets Manager adds six random characters to the ARN, not the name.** A secret created
  by `createSecret` has the exact name `prefix/key`, so `secretRef` and `importSecret` find
  it by name. Do not end a path segment in a hyphen followed by exactly six characters,
  because Secrets Manager can mistake that for the ARN suffix.
- **`StringParameterProps` has no `removalPolicy`.** Call
  `parameter.applyRemovalPolicy(...)` on the construct returned by `putParameter`
  instead.
- **`readPolicyStatements` and `grantRead` grant `GetParameter`/`GetParameters` only,** plus
  `GetSecretValue` when the registry declares secrets. Add `ssm:GetParametersByPath`
  yourself if you load the whole subtree by path, and `kms:Decrypt` if the parameters or
  secrets use a customer managed KMS key.
- **ARN patterns follow the stack's partition.** They are built with `Stack.formatArn`, so
  they work in `aws-cn` and `aws-us-gov` too. By default CDK renders the partition as the
  `AWS::Partition` pseudo parameter; enable the `@aws-cdk/core:enablePartitionLiterals`
  feature flag if you want a literal for stacks with an explicit region. Assert on
  `stack.resolve(...)` in tests rather than comparing raw strings.
- **ESM only.** The package ships ESM and requires Node >= 20.19.0, which is the
  first release where `require(esm)` works without a flag.

## Migrating from 0.1.x

- **Construct ids are used as given.** `putParameter` and `createSecret` used to create the
  construct as `${id}-param` and `${id}-secret`, and the `emitOutputs` output as
  `${id}-output`. They now use `id` as is, and the output is `${id}Output`. Parameter and
  secret names are fixed, so a deployment that renames the construct tries to create a
  second resource with the same name and fails. To keep a deployed resource, pass the old id
  yourself, for example `putParameter(this, 'VpcIdParam-param', ...)`. To move to the new
  ids, use `cdk refactor` or retain and re-import the resources.
- **`readPolicyStatements` and `grantRead` skip the Secrets Manager statement** when the
  registry declares no `secrets`.
- **ARN patterns use the stack's partition** instead of a hardcoded `aws`. Code that
  compared them to `arn:aws:...` strings should compare against `stack.resolve(...)`.
- **Parameter versions above 100 are accepted.**
- **Invalid `parameters` and `secrets` paths throw when the registry is defined,** and
  `secrets` paths are normalized the same way as `parameters` paths.

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

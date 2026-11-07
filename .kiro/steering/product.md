# Product

`cdk-ssm-refs` is an npm library for AWS CDK that provides a typed registry of SSM Parameter Store parameters and Secrets Manager secrets.

Users declare parameters and secrets once with `defineParamRegistry({ prefix, parameters, secrets?, emitOutputs? })`. They get:

- A consistent path prefix (must start with `/`)
- Compile-time checked keys
- Helpers to create parameters/secrets (`putParameter`, `createSecret`)
- CloudFormation dynamic references (`parameterRef`, `secureParameterRef`, `secretRef`) and `importSecret`
- IAM read policies scoped to the prefix (`readPolicyStatements`, `grantRead`)

Published to npm (ESM only, MIT) with provenance. Versioning is SemVer; while `0.x`, breaking changes bump the minor. Releases are automated with release-please from Conventional Commits.

Behavior caveats are documented in the README. Keep the README and TSDoc in sync when changing behavior.

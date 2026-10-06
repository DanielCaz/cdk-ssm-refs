# Security policy

## Supported versions

Only the latest published release of `cdk-ssm-refs` receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub:
[Report a vulnerability](https://github.com/DanielCaz/cdk-ssm-refs/security/advisories/new).

Do not open a public issue or pull request for a suspected vulnerability. Include the
affected version, a description of the impact, and steps or a minimal example to reproduce
it.

You can expect an acknowledgement within a few days. Confirmed issues are fixed in a new
release and disclosed through a GitHub security advisory once a fix is available.

## Scope

This library generates AWS CDK constructs, dynamic references and IAM policy statements.
Reports about the following are in scope:

- IAM policy statements or ARN patterns that grant broader access than documented
- Secret or parameter values leaking into synthesized templates or outputs when the
  documentation says they will not
- Supply-chain concerns with the published package or its release process

Behavior that is already listed under "Caveats" in the README, such as `emitOutputs`
writing raw parameter values into the template, is documented and not a vulnerability.

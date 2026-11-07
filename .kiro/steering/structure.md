# Structure

```
src/
  index.ts      Public entry point; the only place exports are declared
  registry.ts   ParamRegistry class and defineParamRegistry factory
  paths.ts      normalizePrefix / normalizeSegment (path validation and normalization)
  types.ts      ParamRegistryConfig, DynamicRefOptions, SecretRefOptions
test/
  registry.test.ts   Vitest suite
dist/                Build output (generated, gitignored, do not edit)
.github/             CI workflows (validate-pr, pr-title, release), issue/PR templates, dependabot
tsconfig.json        Typecheck config (includes src and test, noEmit)
tsconfig.build.json  Declaration emit for the build
release-please-config.json, .release-please-manifest.json   Release automation
```

## Architecture notes

- `ParamRegistry<P, S>` is generic over the parameter and secret key maps, which gives compile-time key checking via `keyof P` / `keyof S`.
- Parameter and secret names are `${prefix}/${normalizedSegment}`. ARN patterns are built with `Stack.formatArn` (partition-aware). Secret ARNs use `COLON_RESOURCE_NAME`.
- `grantRead` and `readPolicyStatements` include the Secrets Manager statement only when the registry declares secrets.
- Dynamic references resolve at deploy time, so they cannot reference a parameter created in the same stack.
- New public symbols must be exported from `src/index.ts` and documented in the README API table.
- Do not hand-edit `CHANGELOG.md` or the release-please files; they are managed by release automation.

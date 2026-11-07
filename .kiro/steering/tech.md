# Tech Stack

- Language: TypeScript (strict), ESM only (`"type": "module"`), Node >= 20.19.0
- Package manager / bundler: Bun (`bun.lock`); `bun build` for JS output, `tsc` for declarations
- Peer deps: `aws-cdk-lib` (^2.73.0), `constructs` (^10.0.0); `typescript` optional
- Test: Vitest (`test/registry.test.ts`)
- Format: Prettier (`.prettierrc`)
- Package checks: `publint`, `@arethetypeswrong/cli`
- Releases: release-please + Conventional Commits (PR titles are validated by `.github/workflows/pr-title.yml`)

## Commands

```bash
bun install
bun run test            # vitest run
bun run typecheck       # tsc --noEmit
bun run format:check    # prettier --check .
bun run format          # prettier --write .
bun run build           # rm -rf dist, bun build, then tsc -p tsconfig.build.json
bun run check:package   # publint + attw
```

## Code conventions

- Relative imports must use the `.js` extension (e.g. `./paths.js`), because of ESM and `verbatimModuleSyntax`.
- Use `import type` for type-only imports.
- Strict tsconfig: `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals/Parameters`. Use bracket access for index signatures.
- Import CDK modules as namespaces: `cdk` from `aws-cdk-lib/core`, plus `iam`, `sm`, `ssm` from their `aws-cdk-lib/aws-*` entry points.
- Error messages are prefixed with `[cdk-ssm-refs]` and name the offending value, using `JSON.stringify` for strings where practical.
- Validate input eagerly (at registry definition), not lazily on first use.
- Public API gets TSDoc explaining deploy-time behavior and caveats. Config and option fields are `readonly`.
- Do not add new runtime dependencies. The package is `sideEffects: false` and `dist` is the only published folder.
- Use exact or pinned versions when adding dev dependencies.

# Contributing to cdk-ssm-refs

Thanks for taking the time to contribute. Bug reports, feature ideas, documentation fixes
and pull requests are all welcome.

## Getting started

You need [Bun](https://bun.sh) and Node.js 20.19 or newer.

```bash
git clone https://github.com/DanielCaz/cdk-ssm-refs.git
cd cdk-ssm-refs
bun install
```

| Command                 | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `bun run test`          | Runs the test suite (Vitest)                            |
| `bun run typecheck`     | Type-checks `src` and `test`                            |
| `bun run format`        | Formats the repo with Prettier                          |
| `bun run format:check`  | Fails if anything is not formatted                      |
| `bun run build`         | Builds `dist` (bundled JS plus type declarations)       |
| `bun run check:package` | Lints the package with publint and Are The Types Wrong? |

Before opening a pull request, run `test`, `typecheck`, `format:check` and `build`. CI runs
the same checks, plus the tests against the oldest and newest `aws-cdk-lib` and `constructs`
versions the package supports, and an install-and-import smoke test of the packed tarball on
Node 20, 22 and 24.

## Pull requests

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Branch from `main` and keep the change focused.
3. Add or update tests for any behavior change. Update the README when the public API or a
   caveat changes.
4. Open the pull request against `main`.

### Pull request titles

Pull requests are squash-merged, so **the PR title becomes the commit message** on `main`.
Titles must follow [Conventional Commits](https://www.conventionalcommits.org), because
releases and the changelog are generated from them:

| Title                                 | Effect on the version (while `0.x`)   |
| ------------------------------------- | ------------------------------------- |
| `fix: handle empty path segments`     | patch                                 |
| `feat: add secretRef helper`          | minor                                 |
| `feat!: rename defineParamRegistry`   | minor (major once the version is 1.x) |
| `docs: clarify prefix rules`          | none, listed under Documentation      |
| `chore:`, `ci:`, `test:`, `refactor:` | none, not listed in the changelog     |

A breaking change is marked with `!` after the type, or with a `BREAKING CHANGE:` footer in
the PR description. Describe what consumers need to change.

## Compatibility rules

- The supported ranges for `aws-cdk-lib` and `constructs` are declared in `peerDependencies`
  and tested in CI. Raising the lower bound of a peer range is a breaking change.
- The package is ESM only and supports Node.js `>=20.19.0`. Changing either is a breaking
  change.
- Anything exported from `src/index.ts` is public API and follows semantic versioning.

## How releases work

Maintainers do not bump versions or edit the changelog by hand.

1. Merging to `main` makes release-please open or update a **Release PR** containing the
   next version and the changelog entry.
2. Merging that PR creates the `vX.Y.Z` tag and GitHub Release.
3. The same workflow then publishes the package to npm using OIDC trusted publishing, with
   provenance. No npm token is stored in the repository.

A published version is never overwritten. If a release is faulty, a fixed version is
published and the faulty one is deprecated with `npm deprecate`.

## Reporting security issues

Please do not open public issues for vulnerabilities. See [SECURITY.md](./SECURITY.md).

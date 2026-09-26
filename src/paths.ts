/**
 * Validates and normalizes an SSM / Secrets Manager path prefix.
 *
 * A prefix must start with `/` and contain at least one path segment, so
 * `/team/my-app` is accepted and `team/my-app` is rejected. Trailing slashes are
 * ignored, and empty path segments (`//`) are rejected.
 *
 * Returns both of the forms the AWS APIs need: the leading-slash form used in
 * parameter and secret names, and that same value with the single leading
 * slash removed, which is how ARN resource names are written.
 *
 * @throws If `prefix` does not start with `/`, has no path segment, or
 * contains an empty path segment.
 */
export function normalizePrefix(prefix: string): {
  withSlash: string;
  withoutSlash: string;
} {
  if (!prefix.startsWith('/')) {
    throw new Error(
      `[cdk-ssm-refs] prefix must start with "/", received ${JSON.stringify(prefix)}`,
    );
  }

  const trimmed = prefix.replace(/\/+$/, '');

  if (trimmed.length === 0) {
    throw new Error(
      `[cdk-ssm-refs] prefix must contain at least one path segment, received ${JSON.stringify(prefix)}`,
    );
  }

  if (trimmed.includes('//')) {
    throw new Error(
      `[cdk-ssm-refs] prefix must not contain empty path segments, received ${JSON.stringify(prefix)}`,
    );
  }

  return { withSlash: trimmed, withoutSlash: trimmed.slice(1) };
}

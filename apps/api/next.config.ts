import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * `packages/shared` lives outside apps/api and has no build step, so Turbopack
 * needs the monorepo root to resolve `@shared/*` imports (tsconfig paths).
 * There are no npm workspaces — each app installs its own deps.
 */
const repoRoot = path.resolve(__dirname, '..', '..');

const nextConfig: NextConfig = {
  turbopack: {
    root: repoRoot,
  },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;

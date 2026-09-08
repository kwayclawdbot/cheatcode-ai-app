import type { NextConfig } from 'next';

/**
 * apps/site is its own Vercel project with Root Directory = apps/site.
 *
 * Unlike apps/api it imports nothing from packages/shared, so it is entirely
 * self-contained and must NOT point Turbopack or output tracing at the repo
 * root — on Vercel the deployment root is apps/site and the parent is not
 * uploaded. Keeping this config empty is what lets the site deploy on its own.
 */
const nextConfig: NextConfig = {};

export default nextConfig;

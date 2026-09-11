/**
 * THE KAI WORKSPACE.
 *
 * Kai talks, and the workspace responds. One agent, one command protocol, and
 * any number of places able to render it — Home is the primary host, Trade is
 * the direct entrance to the same machinery, and neither is a second build of
 * the other.
 *
 * NAMED `kai-workspace` RATHER THAN `workspace` FOR A REASON. `features/workspace`
 * already exists and means something different: the per-SYMBOL asset workspace
 * from an earlier round (`useWorkspace(symbol, mode)` and its tabs). Two things
 * called "the workspace" in one codebase is a confusion that costs an hour every
 * time somebody new reads either of them, so this one says whose workspace it is.
 */
export { WorkspaceHost, SurfaceStrip } from './WorkspaceHost';
export { ChartSurface } from './surfaces/ChartSurface';
export {
  AlertSurface, CommunitySurface, NewsSurface, SetupSurface, WebSurface,
} from './surfaces/objects';
export { useChartRuntime, type ChartRuntime, type ChartRuntimeOpts } from './chart-runtime';
export { useWorkspaceBridge, type WorkspaceBridge } from './bridge';
export {
  workspace, useWorkspaceSurfaces, useActiveSurface, MAX_SURFACES,
  type Surface, type WorkspaceSnapshot,
} from './store';

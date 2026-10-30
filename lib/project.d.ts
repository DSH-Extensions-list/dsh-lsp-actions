/**
 * Project-config detection for routing: which configured marker file (if any) governs a source
 * file. The walk starts at the file's own directory and climbs to the workspace root, so one
 * extension can be served by different language servers in sibling projects — a `deno.json`
 * project next to a `package.json` project — with no hard-coded path rule and no cross-project
 * bleed: only the nearest ancestor that holds a *configured* marker claims the file, and the
 * workspace root is the hard upper bound.
 * @module dsh-lsp-actions/project
 */
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { ResolvedServer } from './servers.js';
/**
 * Every project marker some server entry declares, deduplicated in config order.
 * @param servers - the resolved servers.
 * @returns the marker file names to probe, in the order entries declare them.
 */
export declare function configuredProjectMarkers(servers: readonly ResolvedServer[]): string[];
/**
 * Find the marker file that governs one source file: the nearest ancestor directory — the file's
 * own directory first, the workspace root last — holding one of `markers`, scanning the markers in
 * the given order inside each directory. Directories without a configured marker are skipped, a
 * file outside the workspace has no project context, and no filesystem call is made when the
 * servers table declares no marker at all.
 * @param fs - the filesystem seam sharing the language server's execution world.
 * @param markers - the configured marker file names (see `configuredProjectMarkers`).
 * @param filePath - the source file (relative to `workspaceRoot` or absolute).
 * @param workspaceRoot - the workspace root, the walk's upper bound.
 * @param signal - optional cancellation.
 * @returns the governing marker file name, or undefined when none applies.
 */
export declare function findProjectMarker(fs: FileSystem, markers: readonly string[], filePath: string, workspaceRoot: string, signal?: AbortSignal): Promise<string | undefined>;
//# sourceMappingURL=project.d.ts.map
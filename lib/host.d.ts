/**
 * Filesystem-seam source access for the LSP action client: canonicalizing the workspace and
 * reading the byte-bounded transient document that `didOpen` synchronizes with the server.
 * @module dsh-lsp-actions/host
 */
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs';
/** A canonical workspace in the filesystem/subprocess execution world. */
export interface HostWorkspace {
    /** Stable filesystem identity used for client pooling. */
    readonly target: FsTarget;
    /** Canonical absolute path accepted as a subprocess cwd. */
    readonly canonicalPath: string;
    /** Canonical file URI sent during LSP initialization. */
    readonly fileUrl: string;
}
/** A validated source and the exact URI sent to the language server. */
export interface HostSource {
    /** The resolved file target, for observations and guarded writes. */
    readonly target: FsTarget;
    /** Canonical file URI in the execution world's platform syntax. */
    readonly fileUrl: string;
    /** Current complete UTF-8 text. */
    readonly text: string;
    /** Opaque freshness token of the target at read time, for guarded writes and observations. */
    readonly version?: import('@deepseek-ai/dsh-fs').FsVersion;
}
/**
 * Resolve and validate one workspace through `ctx.fs`.
 * @param fs - filesystem provider sharing the language server's execution world.
 * @param workspaceRoot - caller-supplied workspace path.
 * @param signal - optional cancellation around provider operations.
 * @returns stable identity plus process path and file URI.
 */
export declare function canonicalizeWorkspace(fs: FileSystem, workspaceRoot: string, signal?: AbortSignal): Promise<HostWorkspace>;
/**
 * Resolve, contain, and read one byte-bounded source through `ctx.fs`, carrying back the
 * freshness token so a formatting write can observe and guard the exact bytes the server saw.
 * @param fs - filesystem provider sharing the server's execution world.
 * @param filePath - absolute source path or path relative to `workspace`.
 * @param workspace - already-canonical workspace.
 * @param maxDocumentBytes - largest complete source accepted by this host.
 * @param signal - optional cancellation.
 * @returns canonical file URI, current text, and freshness token.
 */
export declare function readHostSource(fs: FileSystem, filePath: string, workspace: HostWorkspace, maxDocumentBytes: number, signal?: AbortSignal): Promise<HostSource>;
/** Throw the signal's abort reason when the signal has fired. */
export declare function throwIfAborted(signal: AbortSignal | undefined): void;
/** Normalize a `file:` URI for identity comparison: decoded path, case-folded on Windows. */
export declare function normalizeFileUri(uri: string): string;
/** Decode a `file:` URI's percent escapes without case-folding, so path slicing stays exact. */
export declare function decodeFileUri(uri: string): string;
/**
 * The workspace-relative path one document URI points at, when the URI lies under the canonical
 * workspace URI.
 * @param workspace - the canonical workspace.
 * @param uri - the document URI the server named.
 * @returns the relative path (`.` for the workspace root itself), or undefined when the URI does
 *   not fall under the workspace.
 */
export declare function workspaceRelativePath(workspace: HostWorkspace, uri: string): string | undefined;
/**
 * The `/`-separated path one document URI points at under a root URI. Servers re-spell the root
 * URI sent at `initialize` (lowercase drive letters and percent-encoded colons on Windows, a
 * trailing slash on either side), so containment is judged on decoded, case-insensitive forms
 * while the relative path itself is sliced from the decoded URI — a normalized string can differ
 * in length from the raw one, which would shift the cut.
 * @param rootUri - canonical URI of the containing root (workspace, project, …).
 * @param uri - the document URI to relativize.
 * @returns the relative, `/`-separated path (`.` for the root itself), or undefined when the URI
 *   does not fall under `rootUri`.
 */
export declare function relativeUnderRootUri(rootUri: string, uri: string): string | undefined;
//# sourceMappingURL=host.d.ts.map
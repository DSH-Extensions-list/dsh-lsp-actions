/**
 * Filesystem-seam source access for the LSP action client: canonicalizing the workspace and
 * reading the byte-bounded transient document that `didOpen` synchronizes with the server.
 * @module dsh-lsp-actions/host
 */
import { Buffer } from 'node:buffer';
/**
 * Resolve and validate one workspace through `ctx.fs`.
 * @param fs - filesystem provider sharing the language server's execution world.
 * @param workspaceRoot - caller-supplied workspace path.
 * @param signal - optional cancellation around provider operations.
 * @returns stable identity plus process path and file URI.
 */
export async function canonicalizeWorkspace(fs, workspaceRoot, signal) {
    throwIfAborted(signal);
    let target;
    try {
        target = await fs.resolve(workspaceRoot, signal === undefined ? {} : { signal });
    }
    catch (error) {
        throwIfAborted(signal);
        throw new Error(`workspace root "${workspaceRoot}" cannot be resolved: ${messageOf(error)}`, { cause: error });
    }
    throwIfAborted(signal);
    const info = await fs.stat(target, signal).catch((error) => {
        throwIfAborted(signal);
        throw error;
    });
    throwIfAborted(signal);
    if (info?.type !== 'directory') {
        throw new Error(`workspace root "${workspaceRoot}" is not a directory`);
    }
    return {
        target,
        canonicalPath: fs.processPath(target),
        fileUrl: fs.fileUrl(target),
    };
}
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
export async function readHostSource(fs, filePath, workspace, maxDocumentBytes, signal) {
    throwIfAborted(signal);
    let target;
    try {
        target = await fs.resolve(filePath, {
            cwd: workspace.canonicalPath,
            ...signal === undefined ? {} : { signal },
        });
    }
    catch (error) {
        throwIfAborted(signal);
        throw new Error(`source "${filePath}" cannot be resolved: ${messageOf(error)}`, { cause: error });
    }
    throwIfAborted(signal);
    if (!fs.contains(workspace.target, target)) {
        throw new Error(`source "${filePath}" resolves outside the workspace`);
    }
    const info = await fs.stat(target, signal).catch((error) => {
        throwIfAborted(signal);
        throw error;
    });
    throwIfAborted(signal);
    const chunks = [];
    let bytes = 0;
    try {
        const stream = await fs.streamText(target, signal);
        for await (const chunk of stream) {
            throwIfAborted(signal);
            bytes += Buffer.byteLength(chunk);
            if (bytes > maxDocumentBytes)
                break;
            chunks.push(chunk);
        }
    }
    catch (error) {
        throwIfAborted(signal);
        throw new Error(`source "${filePath}" could not be read: ${messageOf(error)}`, { cause: error });
    }
    if (bytes > maxDocumentBytes) {
        throw new Error(`source "${filePath}" exceeds the ${maxDocumentBytes}-byte limit; reading stopped after ${bytes} bytes`);
    }
    throwIfAborted(signal);
    return {
        target,
        fileUrl: fs.fileUrl(target),
        text: chunks.join(''),
        ...info === undefined ? {} : { version: info.version },
    };
}
/** Throw the signal's abort reason when the signal has fired. */
export function throwIfAborted(signal) {
    if (signal?.aborted)
        throw signal.reason;
}
/** Normalize a `file:` URI for identity comparison: decoded path, case-folded on Windows. */
export function normalizeFileUri(uri) {
    return foldFileUri(decodeFileUri(uri));
}
/** Decode a `file:` URI's percent escapes without case-folding, so path slicing stays exact. */
export function decodeFileUri(uri) {
    try {
        const url = new URL(uri);
        if (url.protocol !== 'file:')
            return uri;
        return `file://${decodeURIComponent(url.pathname)}`;
    }
    catch {
        return uri;
    }
}
function foldFileUri(uri) {
    if (process.platform !== 'win32')
        return uri;
    const marker = 'file://';
    if (!uri.startsWith(marker))
        return uri;
    return `${marker}${uri.slice(marker.length).toLowerCase()}`;
}
/**
 * The workspace-relative path one document URI points at, when the URI lies under the canonical
 * workspace URI.
 * @param workspace - the canonical workspace.
 * @param uri - the document URI the server named.
 * @returns the relative path (`.` for the workspace root itself), or undefined when the URI does
 *   not fall under the workspace.
 */
export function workspaceRelativePath(workspace, uri) {
    return relativeUnderRootUri(workspace.fileUrl, uri);
}
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
export function relativeUnderRootUri(rootUri, uri) {
    const root = decodeFileUri(rootUri);
    const decoded = decodeFileUri(uri);
    const identity = (candidate) => process.platform === 'win32' ? candidate.toLowerCase() : candidate;
    if (identity(decoded) === identity(root))
        return '.';
    const prefix = root.endsWith('/') ? root : `${root}/`;
    if (!identity(decoded).startsWith(identity(prefix)))
        return undefined;
    return decoded.slice(prefix.length);
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=host.js.map
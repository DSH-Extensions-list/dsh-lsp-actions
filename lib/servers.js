/**
 * Server configuration and routing: the `servers` table schema, load-time validation and
 * executable resolution, and the per-file routing that picks one server entry (glob patterns
 * first, then the file's nearest project marker, then the extension map) plus its language id.
 * @module dsh-lsp-actions/servers
 */
import z from '@deepseek-ai/schemastery';
import { finalExtension } from "./extension.js";
/** Node's largest schedulable timer, the upper bound for every timeout-shaped config field. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const DEFAULT_MAX_MESSAGE_BYTES = 16_000_000;
const DEFAULT_MAX_STDERR_BYTES = 1_000_000;
/** The default byte cap for any single source document a tool opens for a language server. */
export const DEFAULT_MAX_DOCUMENT_BYTES = 4_000_000;
const DEFAULT_KILL_GRACE_MS = 2_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;
const DEFAULT_DIAGNOSTICS_SETTLE_MS = 2_000;
const DEFAULT_DIAGNOSTICS_DEBOUNCE_MS = 250;
const DEFAULT_IDLE_TIMEOUT_MS = 0;
export const LspServerEntry = z.object({
    command: z.string().required(),
    extensionToLanguage: z.dict(String).required(),
    fileGlobs: z.array(String).default([]),
    projectMarkers: z.array(String).default([]),
    args: z.array(String).default([]),
    env: z.dict(String).default({}),
    initializationOptions: z.any().default(null),
    configuration: z.any().default(null),
    formattingOptions: z.any().default(null),
    maxMessageBytes: z.number().default(DEFAULT_MAX_MESSAGE_BYTES),
    maxStderrBytes: z.number().default(DEFAULT_MAX_STDERR_BYTES),
    killGraceMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_KILL_GRACE_MS),
    shutdownTimeoutMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
    diagnosticsSettleMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_DIAGNOSTICS_SETTLE_MS),
    diagnosticsDebounceMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_DIAGNOSTICS_DEBOUNCE_MS),
    idleTimeoutMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_IDLE_TIMEOUT_MS),
});
export const EditorConfig = z.object({
    enabled: z.boolean().default(false),
    requestTimeoutMs: z.number().max(MAX_TIMER_DELAY_MS).default(60_000),
    diagnosticsCacheMaxFiles: z.number().default(64),
});
export const Config = z.object({
    servers: z.dict(LspServerEntry).default({}),
    editor: EditorConfig.default({}),
    maxDiagnostics: z.number().default(200),
    maxCompletionItems: z.number().default(20),
    maxCodeActions: z.number().default(50),
    maxSymbols: z.number().default(100),
    maxSignatures: z.number().default(10),
    maxInlayHints: z.number().default(200),
    maxResultChars: z.number().default(16_000),
    maxDocumentBytes: z.number().default(DEFAULT_MAX_DOCUMENT_BYTES),
    timeoutMs: z.number().max(MAX_TIMER_DELAY_MS).default(60_000),
});
/**
 * Resolve every server entry's executable at load (fail loud on a missing command or an invalid
 * bound) before any provider publishes. Mirrors the official `lsp-stdio` load contract.
 * @param ctx - the plugin context (uses `ctx.subprocess.resolveExecutable`).
 * @param servers - the schemastery-resolved servers table.
 * @param signal - load cancellation.
 * @returns the resolved servers in config order.
 */
export async function resolveServers(ctx, servers, signal) {
    const resolved = [];
    for (const [serverId, entry] of Object.entries(servers)) {
        if (serverId.trim() === '')
            throw new Error('lsp-actions: server ids must be non-empty strings');
        // A raw config handed straight to apply() (tests, programmatic mounting) may omit a field the
        // schemastery schema would have defaulted: normalize the project markers before validating.
        const resolvedEntry = { ...entry, projectMarkers: entry.projectMarkers ?? [] };
        validateServerEntry(serverId, resolvedEntry);
        for (const glob of resolvedEntry.fileGlobs) {
            globToRegExp(glob); // throws on a malformed pattern at load, not at routing time
        }
        const executable = await ctx.subprocess.resolveExecutable(resolvedEntry.command, resolvedEntry.env, signal);
        resolved.push({ serverId, entry: resolvedEntry, executable });
    }
    return resolved;
}
/**
 * Route one file to a server entry: entries with matching `fileGlobs` first, then the entry claimed
 * by the file's nearest project marker, then entries whose `extensionToLanguage` maps the file's
 * extension — every pass in config order. A glob route uses the file's own extension mapping when
 * the entry maps it; the entry's first mapping is the fallback only for files whose extension the
 * glob — not the map — selected. A project marker never widens a server's file types: it decides
 * only among the entries that already map the file's extension.
 * @param servers - the resolved servers.
 * @param filePath - the source file path (absolute or workspace-relative).
 * @param projectMarker - the nearest configured project marker governing `filePath` (see
 *   `findProjectMarker`), when the servers table declares any.
 * @returns the route, or undefined when no entry handles the file.
 */
export function routeFile(servers, filePath, projectMarker) {
    const normalized = filePath.replaceAll('\\', '/');
    const extension = finalExtension(filePath);
    for (const server of servers) {
        for (const glob of server.entry.fileGlobs) {
            if (globToRegExp(glob).test(normalized)) {
                const languageId = server.entry.extensionToLanguage[extension] ?? firstLanguageId(server);
                return { server, languageId };
            }
        }
    }
    if (projectMarker !== undefined) {
        for (const server of servers) {
            if (!server.entry.projectMarkers.includes(projectMarker))
                continue;
            const languageId = server.entry.extensionToLanguage[extension];
            if (languageId !== undefined)
                return { server, languageId };
        }
    }
    for (const server of servers) {
        const languageId = server.entry.extensionToLanguage[extension];
        if (languageId !== undefined)
            return { server, languageId };
    }
    return undefined;
}
/** The first extension mapping's language id, used when a glob route wins without an extension hit. */
export function firstLanguageId(server) {
    const languageId = Object.values(server.entry.extensionToLanguage)[0];
    if (languageId === undefined)
        throw new Error(`lsp-actions: server "${server.serverId}" maps no extensions`);
    return languageId;
}
/**
 * Compile a path glob (`*`/`**`/`?`) to an anchored regular expression. `*` and `?` do not cross
 * separators; `**` does. Matching runs against `/`-normalized paths.
 * @param pattern - the glob pattern.
 * @returns the compiled, anchored expression.
 * @throws Error when the pattern is empty or contains unbalanced brackets.
 */
export function globToRegExp(pattern) {
    let source = '^';
    let i = 0;
    const push = (text) => {
        source += text.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    };
    while (i < pattern.length) {
        const char = pattern[i];
        if (char === '*') {
            if (pattern[i + 1] === '*') {
                // A lone `**` spans path separators; `**/` also matches zero directories.
                if (pattern[i + 2] === '/') {
                    source += '(?:[^/]+/)*';
                    i += 3;
                }
                else {
                    source += '.*';
                    i += 2;
                }
                continue;
            }
            source += '[^/]*';
            i += 1;
            continue;
        }
        if (char === '?') {
            source += '[^/]';
            i += 1;
            continue;
        }
        if (char === '[') {
            const close = pattern.indexOf(']', i + 1);
            if (close < 0)
                throw new Error(`lsp-actions: unbalanced "[" in fileGlob "${pattern}"`);
            source += pattern.slice(i, close + 1);
            i = close + 1;
            continue;
        }
        push(char);
        i += 1;
    }
    source += '$';
    if (source === '^$')
        throw new Error('lsp-actions: fileGlob patterns must be non-empty');
    return new RegExp(source);
}
/** Reject config values that would fail later (nonpositive caps, invalid timers) at load. */
function validateServerEntry(serverId, entry) {
    assertServerTimer(serverId, 'killGraceMs', entry.killGraceMs);
    assertServerTimer(serverId, 'shutdownTimeoutMs', entry.shutdownTimeoutMs);
    assertServerTimer(serverId, 'diagnosticsSettleMs', entry.diagnosticsSettleMs);
    assertServerTimer(serverId, 'diagnosticsDebounceMs', entry.diagnosticsDebounceMs);
    assertServerNonnegativeInteger(serverId, 'idleTimeoutMs', entry.idleTimeoutMs);
    assertServerPositiveInteger(serverId, 'maxMessageBytes', entry.maxMessageBytes);
    assertServerPositiveInteger(serverId, 'maxStderrBytes', entry.maxStderrBytes);
    const extensions = Object.entries(entry.extensionToLanguage);
    if (extensions.length === 0) {
        throw new Error(`lsp-actions: servers.${serverId} must map at least one extension`);
    }
    for (const [extension, languageId] of extensions) {
        const normalized = normalizeExtension(extension);
        if (!/^\.[^./\\]+$/.test(normalized)) {
            throw new Error(`lsp-actions: servers.${serverId} maps an invalid extension "${extension}"`);
        }
        if (languageId.trim() === '') {
            throw new Error(`lsp-actions: servers.${serverId} maps extension "${extension}" to an empty language id`);
        }
    }
    for (const marker of entry.projectMarkers) {
        // A marker is probed as a plain file name inside each ancestor directory, never as a path.
        if (marker.trim() === '' || marker.trim() !== marker || marker === '.' || marker === '..' || /[/\\]/u.test(marker)) {
            throw new Error(`lsp-actions: servers.${serverId} lists an invalid project marker "${marker}" (plain file names only, e.g. "deno.json")`);
        }
    }
}
/** Reject a timer value Node would clamp instead of scheduling as configured. */
export function assertTimer(name, value) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_TIMER_DELAY_MS) {
        throw new Error(`lsp-actions: ${name} must be a positive integer no greater than ${MAX_TIMER_DELAY_MS}`);
    }
}
/** Reject a nonpositive or non-integer config value at load. */
export function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`lsp-actions: ${name} must be a positive integer`);
    }
}
/** Reject a timer value Node would clamp instead of scheduling as configured. */
function assertServerTimer(serverId, name, value) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_TIMER_DELAY_MS) {
        throw new Error(`lsp-actions: servers.${serverId}.${name} must be a positive integer no greater than ${MAX_TIMER_DELAY_MS}`);
    }
}
/** Reject a nonpositive or non-integer config value at load. */
function assertServerPositiveInteger(serverId, name, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`lsp-actions: servers.${serverId}.${name} must be a positive integer`);
    }
}
/** Reject a negative or non-integer config value at load (zero is a valid "disabled" value). */
function assertServerNonnegativeInteger(serverId, name, value) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`lsp-actions: servers.${serverId}.${name} must be a nonnegative integer`);
    }
}
/** Lowercase an extension and ensure it carries a leading dot. */
function normalizeExtension(extension) {
    const lower = extension.toLowerCase();
    return lower.startsWith('.') ? lower : `.${lower}`;
}
//# sourceMappingURL=servers.js.map
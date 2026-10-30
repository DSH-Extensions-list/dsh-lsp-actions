/**
 * Server configuration and routing: the `servers` table schema, load-time validation and
 * executable resolution, and the per-file routing that picks one server entry (glob patterns
 * first, then the file's nearest project marker, then the extension map) plus its language id.
 * @module dsh-lsp-actions/servers
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** The default byte cap for any single source document a tool opens for a language server. */
export declare const DEFAULT_MAX_DOCUMENT_BYTES = 4000000;
/** One configured local language server and its host bounds. */
export interface LspServerEntry {
    /** Executable to spawn (absolute, or resolved on PATH at load). */
    command: string;
    /** Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`). */
    extensionToLanguage: Record<string, string>;
    /** Optional path globs (e.g. `src/**\/*.ts`); when a file matches, this entry wins over the extension map. */
    fileGlobs?: string[];
    /**
     * Optional project config files (plain file names, e.g. `["deno.json", "deno.jsonc"]`). The
     * nearest ancestor directory of a routed file that holds one of these names claims the file for
     * this entry, so sibling projects sharing an extension can use different servers without a
     * hard-coded path rule. A marker only decides among entries that already map the file's
     * extension, and `fileGlobs` still wins over it.
     */
    projectMarkers?: string[];
    /** Arguments passed to the executable (no shell). Default `[]`. */
    args?: string[];
    /** Extra env vars merged on top of the scrubbed ambient env. Default `{}`. */
    env?: Record<string, string>;
    /** Static `initialize` options forwarded to the server. Default `null`. */
    initializationOptions?: unknown;
    /** Static answer to every `workspace/configuration` item. Default `null`. */
    configuration?: unknown;
    /** Static `textDocument/formatting` options (`{ tabSize, insertSpaces }`); omitted when null. Default `null`. */
    formattingOptions?: unknown;
    /** Largest single framed message accepted from the server (bytes). Default 16000000. */
    maxMessageBytes?: number;
    /** Largest stderr tail retained for diagnostics (bytes). Default 1000000. */
    maxStderrBytes?: number;
    /** Request-cancel and SIGTERM→SIGKILL grace (ms). Default 2000. */
    killGraceMs?: number;
    /** Graceful `shutdown`/`exit` budget before escalation (ms). Default 5000. */
    shutdownTimeoutMs?: number;
    /** Settle window for push-only diagnostics after `didOpen` (ms). Default 2000. */
    diagnosticsSettleMs?: number;
    /** Quiet period after the last pushed batch before the client returns it (ms). Default 250. */
    diagnosticsDebounceMs?: number;
    /** Idle time before an unused server instance is disposed (ms); 0 keeps it alive. Default 0. */
    idleTimeoutMs?: number;
}
/** Editor-protocol configuration: the IDE-backend transport and its bounds. */
export interface EditorConfig {
    /**
     * Serve the editor action protocol (`lsp.actions.list` / `lsp.actions.run` / `lsp.events`) over
     * newline-delimited JSON-RPC on process stdio. Default false — enable it only in a dedicated
     * headless backend composition whose stdout nothing else claims.
     */
    enabled?: boolean;
    /** Per-run timeout budget in ms, enforced inside the plugin. Default 60000. */
    requestTimeoutMs?: number;
    /** Bounded LRU diagnostics-cache size in files (least-recently-used eviction). Default 64. */
    diagnosticsCacheMaxFiles?: number;
}
/** Plugin configuration: a named table of local language servers plus tool result caps. */
export interface Config {
    /** Named server entries; empty disables the plugin's own client (the official seam may still serve). */
    servers: Record<string, LspServerEntry>;
    /** Editor action protocol (the IDE integration backend). */
    editor?: EditorConfig;
    /** Largest number of rendered diagnostics before an omission marker. Default 200. */
    maxDiagnostics?: number;
    /** Largest number of rendered completion items before an omission marker. Default 20. */
    maxCompletionItems?: number;
    /** Largest number of rendered code actions before an omission marker. Default 50. */
    maxCodeActions?: number;
    /** Largest number of rendered symbols before an omission marker. Default 100. */
    maxSymbols?: number;
    /** Largest number of rendered signatures in one signature-help result. Default 10. */
    maxSignatures?: number;
    /** Largest number of rendered inlay hints before an omission marker. Default 200. */
    maxInlayHints?: number;
    /** Largest complete rendered result in characters, including truncation metadata. Default 16000. */
    maxResultChars?: number;
    /** Largest source file a tool will open for a language server (bytes). Default 4000000. */
    maxDocumentBytes?: number;
    /** Tool-call timeout budget in ms, enforced by the official timeout policy. Default 60000. */
    timeoutMs?: number;
}
export declare const LspServerEntry: z<LspServerEntry>;
export declare const EditorConfig: z<EditorConfig>;
export declare const Config: z<Config>;
/** One server entry after schemastery filled every default. */
export type ResolvedServerEntry = Required<LspServerEntry>;
/** The plugin config after schemastery filled every default. */
export type ResolvedConfig = Omit<Required<Config>, 'servers' | 'editor'> & {
    servers: Record<string, ResolvedServerEntry>;
    editor: Required<EditorConfig>;
};
/** One resolved, executable server plus its routing. */
export interface ResolvedServer {
    /** The entry's stable key in the `servers` table. */
    readonly serverId: string;
    /** The entry with every default filled and validated. */
    readonly entry: ResolvedServerEntry;
    /** The absolute executable resolved at load. */
    readonly executable: string;
}
/** The route one file selects: which server and what language id to open it with. */
export interface ServerRoute {
    readonly server: ResolvedServer;
    readonly languageId: string;
}
/**
 * Resolve every server entry's executable at load (fail loud on a missing command or an invalid
 * bound) before any provider publishes. Mirrors the official `lsp-stdio` load contract.
 * @param ctx - the plugin context (uses `ctx.subprocess.resolveExecutable`).
 * @param servers - the schemastery-resolved servers table.
 * @param signal - load cancellation.
 * @returns the resolved servers in config order.
 */
export declare function resolveServers(ctx: Context, servers: Record<string, ResolvedServerEntry>, signal?: AbortSignal): Promise<ResolvedServer[]>;
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
export declare function routeFile(servers: readonly ResolvedServer[], filePath: string, projectMarker?: string): ServerRoute | undefined;
/** The first extension mapping's language id, used when a glob route wins without an extension hit. */
export declare function firstLanguageId(server: ResolvedServer): string;
/**
 * Compile a path glob (`*`/`**`/`?`) to an anchored regular expression. `*` and `?` do not cross
 * separators; `**` does. Matching runs against `/`-normalized paths.
 * @param pattern - the glob pattern.
 * @returns the compiled, anchored expression.
 * @throws Error when the pattern is empty or contains unbalanced brackets.
 */
export declare function globToRegExp(pattern: string): RegExp;
/** Reject a timer value Node would clamp instead of scheduling as configured. */
export declare function assertTimer(name: string, value: number): void;
/** Reject a nonpositive or non-integer config value at load. */
export declare function assertPositiveInteger(name: string, value: number): void;
//# sourceMappingURL=servers.d.ts.map
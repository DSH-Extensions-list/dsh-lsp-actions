/**
 * The action runner the three tools call: official-seam-first, own-client-fallback. When the
 * extended `ctx.lsp` seam is mounted, actions go through it; when the seam is absent, too old, or
 * has no provider for the file, the plugin's own client serves the call from the `servers` table.
 * A seam provider that exists but lacks the capability fails loud — the user configured the
 * server in one place and gets a real error instead of a silently spawned duplicate.
 * @module dsh-lsp-actions/runner
 */
import { LspActionClient } from './client.js';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { HostSource } from './host.js';
import type { ResolvedServer } from './servers.js';
import type { SeamService } from './seam.js';
import type { LspCodeActionsResult, LspCompletionResult, LspDiagnosticsResult, LspEditsResult, LspInlayHintsResult, LspPosition, LspRange, LspRenameResult, LspSignaturesResult, LspSymbolsResult } from './vocabulary.js';
/** One action call as the tools prepare it: everything the runner needs to serve it either way. */
export interface RunnerRequest {
    /** The source file (relative to `workspaceRoot` or absolute). */
    readonly filePath: string;
    /** The workspace root the server resolves against. */
    readonly workspaceRoot: string;
    /** The pre-read source the own client's didOpen synchronizes (the seam re-reads its own copy). */
    readonly source?: HostSource;
    /** The cursor position, for completion and signature help. */
    readonly position?: LspPosition;
    /** The formatting/code-action/inlay-hint range, for range-scoped operations. */
    readonly range?: LspRange;
    /** The symbol name query, for workspace symbol search. */
    readonly query?: string;
    /** CodeActionKind filters, for code actions. */
    readonly onlyKinds?: readonly string[];
}
/**
 * The LSP action provider interface: the unified surface the tools consume, agnostic of which
 * backend served the result. The bundled runner (seam-first, own-client-fallback) implements it;
 * a third-party plugin can implement and register an alternative provider of this same contract
 * without touching the tools.
 */
export interface ActionRunner {
    diagnostics(request: RunnerRequest, signal?: AbortSignal): Promise<LspDiagnosticsResult>;
    formatDocument(request: RunnerRequest, signal?: AbortSignal): Promise<LspEditsResult>;
    completion(request: RunnerRequest, signal?: AbortSignal): Promise<LspCompletionResult>;
    codeActions(request: RunnerRequest, signal?: AbortSignal): Promise<LspCodeActionsResult>;
    workspaceSymbols(request: RunnerRequest, signal?: AbortSignal): Promise<LspSymbolsResult>;
    documentSymbols(request: RunnerRequest, signal?: AbortSignal): Promise<LspSymbolsResult>;
    signatureHelp(request: RunnerRequest, signal?: AbortSignal): Promise<LspSignaturesResult>;
    inlayHints(request: RunnerRequest, signal?: AbortSignal): Promise<LspInlayHintsResult>;
    rename(request: RunnerRequest, newName: string, signal?: AbortSignal): Promise<LspRenameResult>;
}
/**
 * Create the seam-first action runner. The seam is resolved through `getSeam` on every call, not
 * captured at apply time, so the plugin serves through a seam that loads after it or is re-added
 * later; a seam that is absent at call time falls back to the own client. When an `fs` seam is
 * supplied, a file whose nearest project marker is claimed by a server entry routes to that entry
 * before the plain extension map applies (see `findProjectMarker`).
 * @param options - the per-call seam resolver, the own client, the resolved server table, and the
 *   optional filesystem used for project-marker routing.
 * @returns the runner facade.
 */
export declare function createActionRunner(options: {
    readonly getSeam: () => SeamService | undefined;
    readonly client: LspActionClient;
    readonly servers: readonly ResolvedServer[];
    /** Filesystem used to detect each file's project marker; omit to route by globs/extensions only. */
    readonly fs?: FileSystem;
}): ActionRunner;
//# sourceMappingURL=runner.d.ts.map
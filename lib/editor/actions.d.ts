/**
 * The four editor-protocol actions (`diagnostics.get`, `completion.get`, `quickfix.apply`,
 * `format`) over the same seam-first action runner the model tools use. Read-only actions are
 * reference-only; the two write actions apply server-verified edits through the official
 * `fs/write-intent` waterfall and the per-session sandbox policy — the same official permission
 * presets and approval choreography as `lsp_format`/`lsp_rename`, with the editor's escalation
 * pair (`sandbox_permissions` + `justification`) resolved through `approveEscalation`.
 *
 * Positions and ranges here are zero-based (LSP convention); the model tools keep one-based.
 * @module dsh-lsp-actions/editor/actions
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ActionRunner } from '../runner.js';
import type { FormatSandboxController } from '../sandbox.js';
import type { ResolvedConfig } from '../servers.js';
import type { LruDiagnosticsCache } from './cache.js';
import type { EditorActionDescriptor, EditorActionResult, EditorEvent } from './types.js';
/** The editor-facing agent shape (structurally, so no agent-package dependency). */
export interface EditorAgent {
    readonly session: {
        readonly id: unknown;
    };
}
/** The per-run context the service assembles: identity, cancellation, and the approval actor. */
export interface EditorRunContext {
    readonly requestId: string;
    readonly signal: AbortSignal;
    /** The live agent of the addressed session, when the session exists and has one. */
    readonly agent: EditorAgent | undefined;
}
/** The dependencies one action call needs. */
export interface EditorActionDeps {
    readonly ctx: Context;
    readonly runner: ActionRunner;
    readonly sandbox: FormatSandboxController;
    readonly config: ResolvedConfig;
    readonly cache: LruDiagnosticsCache;
    readonly onEvent: (event: EditorEvent) => void;
}
/** The static v1 action catalog, in the order `lsp.actions.list` advertises it. */
export declare const EDITOR_ACTIONS: readonly EditorActionDescriptor[];
/** Dispatch one action id to its handler. */
export declare function runEditorAction(deps: EditorActionDeps, action: string, params: Record<string, unknown> | undefined, run: EditorRunContext): Promise<EditorActionResult>;
//# sourceMappingURL=actions.d.ts.map
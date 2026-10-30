/**
 * The three model-facing LSP action tools: `lsp_diagnostics` (read-only), `lsp_format` (writes
 * through fs write-intent and sandbox policy), and `lsp_completion` (reference-only hints). All
 * three declare `timeoutMs` for the official timeout policy to enforce and observe `exec.signal`
 * throughout; results are capped and never cached.
 * @module dsh-lsp-actions/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { HostWorkspace } from './host.js';
import type { ActionRunner, RunnerRequest } from './runner.js';
import { FormatSandboxController } from './sandbox.js';
import type { ResolvedConfig } from './servers.js';
import type { LspPosition, LspRange } from './vocabulary.js';
/** The shared position schema, reused inside ranges and output projections. */
export declare const POSITION_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly line: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly character: {
            readonly type: "integer";
            readonly required: true;
        };
    };
};
/** The shared output-side range schema. */
export declare const OUTPUT_RANGE_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: true;
    readonly properties: {
        readonly start: {
            readonly required: true;
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly line: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly character: {
                    readonly type: "integer";
                    readonly required: true;
                };
            };
        };
        readonly end: {
            readonly required: true;
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly line: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly character: {
                    readonly type: "integer";
                    readonly required: true;
                };
            };
        };
    };
};
/** The schema-typed raw argument shape of `lsp_format` (escalation fields included under a confining fs). */
export interface FormatToolArgs {
    file_path: string;
    range?: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    };
    sandbox_permissions?: string;
    justification?: string;
}
/**
 * Register the `lsp_diagnostics` tool: read-only diagnostics for one file, count-capped in the
 * canonical value and character-capped in the rendered text.
 * @param ctx - the plugin context.
 * @param runner - the seam-first action runner.
 * @param config - the resolved plugin configuration.
 */
export declare function registerDiagnosticsTool(ctx: Context, runner: ActionRunner, config: ResolvedConfig): void;
/**
 * Register the `lsp_format` tool: formatting through a language server, applied through the
 * filesystem write-intent waterfall and the per-call sandbox policy. Read-only sandbox modes fail
 * loud before any server round-trip; a stale on-disk file fails as a structured conflict.
 * @param ctx - the plugin context.
 * @param runner - the seam-first action runner.
 * @param sandbox - the shared escalation controller.
 * @param config - the resolved plugin configuration.
 */
export declare function registerFormatTool(ctx: Context, runner: ActionRunner, sandbox: FormatSandboxController, config: ResolvedConfig): void;
/**
 * Register the `lsp_completion` tool: reference-only completion hints at a cursor position. The
 * description and the rendered header both state that nothing is executed — applying a suggestion
 * is the model's own write/edit decision.
 * @param ctx - the plugin context.
 * @param runner - the seam-first action runner.
 * @param config - the resolved plugin configuration.
 */
export declare function registerCompletionTool(ctx: Context, runner: ActionRunner, config: ResolvedConfig): void;
/** The raw argument shape of `lsp_rename` (escalation fields included under a confining fs). */
export interface RenameToolArgs {
    file_path: string;
    line: number;
    character: number;
    new_name: string;
    sandbox_permissions?: string;
    justification?: string;
}
/**
 * Register the `lsp_rename` tool: a server-verified symbol rename applied through the filesystem
 * write-intent waterfall and the per-call sandbox policy, exactly like `lsp_format` but across
 * every document the server edits. Read-only sandbox modes fail loud before any server
 * round-trip; a stale on-disk file fails as a structured conflict.
 * @param ctx - the plugin context.
 * @param runner - the seam-first action runner.
 * @param sandbox - the shared escalation controller.
 * @param config - the resolved plugin configuration.
 */
export declare function registerRenameTool(ctx: Context, runner: ActionRunner, sandbox: FormatSandboxController, config: ResolvedConfig): void;
/**
 * Validate a new symbol name: non-empty after trimming, no embedded newlines.
 * @param newName - the caller-supplied name.
 * @returns the trimmed name.
 */
export declare function parseNewName(newName: string): string;
/** The shared preparation every tool runs: workspace + contained, byte-capped source read. */
export declare function prepareRequest(ctx: Context, config: ResolvedConfig, filePath: string, workspaceRoot: string, exec: ToolExecution): Promise<RunnerRequest & {
    source: NonNullable<RunnerRequest['source']>;
    workspace: HostWorkspace;
}>;
/** Validate a non-blank file path. */
export declare function parseFilePath(filePath: string): string;
/** Validate one-based cursor coordinates and convert them to the zero-based wire position. */
export declare function parseCursor(line: number, character: number): LspPosition;
/** Validate an optional one-based range and convert it to the zero-based wire range. */
export declare function parseOptionalRange(range: FormatToolArgs['range']): LspRange | undefined;
/** The session workspace root, or a structured failure — a server needs a real workspace. */
export declare function requireWorkspace(exec: ToolExecution): string;
/**
 * Map a mutation write failure for the model: sandbox denials become the shared `[sandbox: …]`
 * marker (via the controller), while stale/not-observed failures become the structured conflict
 * that asks the model to choose between re-running and applying the changes manually.
 * @param error - the already sandbox-mapped error.
 * @param action - the tool name, named in the recovery advice.
 * @returns the error to throw.
 */
export declare function mapWriteFailure(error: unknown, action: string): unknown;
/** The one-based line span the applied edits touch (0 for an empty edit list). */
export declare function linesChangedByEdits(edits: readonly {
    range: LspRange;
}[]): number;
//# sourceMappingURL=tools.d.ts.map
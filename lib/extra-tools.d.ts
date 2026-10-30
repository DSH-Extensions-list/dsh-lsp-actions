/**
 * The extended read-only LSP action tools: `lsp_code_action` (server-verified quickfixes, never
 * applied), `lsp_symbols` (workspace-wide or per-document symbol search), `lsp_signature`
 * (signature help at a cursor), and `lsp_inlay_hints` (server type/parameter hints). All four are
 * read-only: results are reference material, and applying anything is the model's own write/edit
 * decision. All declare `timeoutMs` for the official timeout policy and observe `exec.signal`.
 * @module dsh-lsp-actions/extra-tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ActionRunner } from './runner.js';
import type { ResolvedConfig } from './servers.js';
import { symbolKindLabel } from './render.js';
/**
 * Register the `lsp_code_action` tool: server-verified fixes for a range (or the first
 * diagnostic's range) as reference-only items — the tool never applies edits or runs commands.
 * @param ctx - the plugin context.
 * @param runner - the seam-first action runner.
 * @param config - the resolved plugin configuration.
 */
export declare function registerCodeActionTool(ctx: Context, runner: ActionRunner, config: ResolvedConfig): void;
/**
 * Register the `lsp_symbols` tool: workspace-wide symbol search by name (`query`) or a per-file
 * symbol outline (`file_path` without `query`). At least one of the two must be supplied.
 * @param ctx - the plugin context.
 * @param runner - the seam-first action runner.
 * @param config - the resolved plugin configuration.
 */
export declare function registerSymbolsTool(ctx: Context, runner: ActionRunner, config: ResolvedConfig): void;
/**
 * Register the `lsp_signature` tool: signature help at a cursor position.
 * @param ctx - the plugin context.
 * @param runner - the seam-first action runner.
 * @param config - the resolved plugin configuration.
 */
export declare function registerSignatureTool(ctx: Context, runner: ActionRunner, config: ResolvedConfig): void;
/**
 * Register the `lsp_inlay_hints` tool: server type/parameter inlay hints for a file or range.
 * @param ctx - the plugin context.
 * @param runner - the seam-first action runner.
 * @param config - the resolved plugin configuration.
 */
export declare function registerInlayHintsTool(ctx: Context, runner: ActionRunner, config: ResolvedConfig): void;
/** The human-readable label for a numeric symbol kind, re-exported for tests. */
export { symbolKindLabel };
//# sourceMappingURL=extra-tools.d.ts.map
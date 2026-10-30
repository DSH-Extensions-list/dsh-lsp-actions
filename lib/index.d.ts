/**
 * LSP action surface for DeepSeek Harness: diagnostics, formatting, completion, code actions,
 * symbols, signature help, inlay hints, and rename tools over language servers. Actions go through
 * the extended official `ctx.lsp` seam when it is mounted (the upstream PR proposal); otherwise
 * the plugin's own minimal stdio client serves them from the `servers` table, resolved and
 * validated at load. With an empty servers table and no seam, the tools are still registered and
 * fail loudly with `LSP_ACTION_UNAVAILABLE` on use — the seam is resolved per call, so a seam
 * mounted after this plugin is served without a reload.
 *
 * Namespace plugin (named exports, no default export).
 * @module dsh-lsp-actions
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config as ConfigSchema } from './servers.js';
import type { Config as ConfigType } from './servers.js';
export { LspServerEntry } from './servers.js';
export { LspActionClient } from './client.js';
export { createActionRunner } from './runner.js';
export type { ActionRunner, RunnerRequest } from './runner.js';
export { LspActionError } from './vocabulary.js';
export type { LspActionErrorCode, LspActionResult, LspCodeActionItem, LspCodeActionsResult, LspCompletionItem, LspDiagnostic, LspDiagnosticSeverity, LspDiagnosticsResult, LspEditsResult, LspInlayHint, LspInlayHintsResult, LspPosition, LspRange, LspRenameResult, LspSignature, LspSignaturesResult, LspSymbol, LspSymbolsResult, LspTextEdit, } from './vocabulary.js';
export { applyEdits } from './edits.js';
export { LruDiagnosticsCache } from './editor/cache.js';
export { EditorActionService } from './editor/service.js';
export { EditorJsonRpcServer, EDITOR_METHOD_EVENTS, EDITOR_METHOD_LIST, EDITOR_METHOD_RUN } from './editor/server.js';
export type { EditorServerOptions } from './editor/server.js';
export type { EditorActionDescriptor, EditorActionId, EditorActionResult, EditorCompletionParams, EditorDiagnostic, EditorDiagnosticsParams, EditorErrorInfo, EditorEvent, EditorFormatParams, EditorListResult, EditorQuickfixParams, EditorRunRequest, EditorRunResult, EditorSessionInfo, } from './editor/types.js';
export { EDITOR_PROTOCOL } from './editor/types.js';
export { encodeMessage, MessageDecoder } from './framing.js';
export { formatAppliedEdits, formatCodeActions, formatCompletionList, formatDiagnostics, formatInlayHints, formatRenameResult, formatSignatures, formatSymbols, presentLspCodeActionCall, presentLspCodeActionResult, presentLspCompletionCall, presentLspCompletionResult, presentLspDiagnosticsCall, presentLspDiagnosticsResult, presentLspFormatCall, presentLspFormatResult, presentLspInlayHintsCall, presentLspInlayHintsResult, presentLspRenameCall, presentLspRenameResult, presentLspSignatureCall, presentLspSignatureResult, presentLspSymbolsCall, presentLspSymbolsResult, symbolKindLabel, } from './render.js';
export { globToRegExp, routeFile, resolveServers, } from './servers.js';
export { configuredProjectMarkers, findProjectMarker, } from './project.js';
export { decodeTextEdits, negotiatePositionEncoding, normalizeCodeActions, normalizeCompletionItems, normalizeDiagnostics, normalizeEdits, normalizeInlayHints, normalizeSignatures, normalizeSymbols, normalizeWorkspaceEdit, PositionCodec, requestMethod, supportsAction, supportsPullDiagnostics, supportsTransientOpen, } from './translate.js';
/** Cordis plugin name for loader diagnostics. */
export declare const name = "lsp-actions";
/** Services required by this plugin. */
export declare const inject: string[];
/** Plugin configuration schema (schemastery fills every default; misconfiguration fails at load). */
export declare const Config: import("@deepseek-ai/schemastery").default<ConfigSchema>;
/**
 * Register the eight LSP action tools. Resolves every configured server executable at load (fail
 * loud on a missing command) before registering anything; tool, client, and server lifecycles are
 * effect-scoped, so disposal unregisters the tools and tears down every live server. Files route
 * by `fileGlobs`, then by the nearest project marker a server entry declares (`projectMarkers`),
 * then by the extension map. The official seam is resolved lazily per call (see the runner), so
 * registration is independent of the seam's load order; without servers and without a seam, calls
 * fail loudly with `LSP_ACTION_UNAVAILABLE` instead of the plugin silently contributing nothing.
 * @param ctx - the plugin context (must inject `tools`, `fs`, `subprocess`).
 * @param config - the resolved plugin configuration.
 */
export declare function apply(ctx: Context, config: ConfigType): Promise<void>;
//# sourceMappingURL=index.d.ts.map
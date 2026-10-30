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
import { LspActionClient } from "./client.js";
import { registerCodeActionTool, registerInlayHintsTool, registerSignatureTool, registerSymbolsTool } from "./extra-tools.js";
import { startEditorProtocol } from "./editor/server.js";
import { createActionRunner } from "./runner.js";
import { FormatSandboxController } from "./sandbox.js";
import { assertPositiveInteger, assertTimer, Config as ConfigSchema, resolveServers } from "./servers.js";
import { registerCompletionTool, registerDiagnosticsTool, registerFormatTool, registerRenameTool } from "./tools.js";
export { LspServerEntry } from "./servers.js";
export { LspActionClient } from "./client.js";
export { createActionRunner } from "./runner.js";
export { LspActionError } from "./vocabulary.js";
export { applyEdits } from "./edits.js";
export { LruDiagnosticsCache } from "./editor/cache.js";
export { EditorActionService } from "./editor/service.js";
export { EditorJsonRpcServer, EDITOR_METHOD_EVENTS, EDITOR_METHOD_LIST, EDITOR_METHOD_RUN } from "./editor/server.js";
export { EDITOR_PROTOCOL } from "./editor/types.js";
export { encodeMessage, MessageDecoder } from "./framing.js";
export { formatAppliedEdits, formatCodeActions, formatCompletionList, formatDiagnostics, formatInlayHints, formatRenameResult, formatSignatures, formatSymbols, presentLspCodeActionCall, presentLspCodeActionResult, presentLspCompletionCall, presentLspCompletionResult, presentLspDiagnosticsCall, presentLspDiagnosticsResult, presentLspFormatCall, presentLspFormatResult, presentLspInlayHintsCall, presentLspInlayHintsResult, presentLspRenameCall, presentLspRenameResult, presentLspSignatureCall, presentLspSignatureResult, presentLspSymbolsCall, presentLspSymbolsResult, symbolKindLabel, } from "./render.js";
export { globToRegExp, routeFile, resolveServers, } from "./servers.js";
export { configuredProjectMarkers, findProjectMarker, } from "./project.js";
export { decodeTextEdits, negotiatePositionEncoding, normalizeCodeActions, normalizeCompletionItems, normalizeDiagnostics, normalizeEdits, normalizeInlayHints, normalizeSignatures, normalizeSymbols, normalizeWorkspaceEdit, PositionCodec, requestMethod, supportsAction, supportsPullDiagnostics, supportsTransientOpen, } from "./translate.js";
/** Cordis plugin name for loader diagnostics. */
export const name = 'lsp-actions';
/** Services required by this plugin. */
export const inject = ['tools', 'fs', 'subprocess'];
// Service Definition — the plugin contract: LSP action vocabulary re-exports, the config schema below, and the runner/seam service types.
/** Plugin configuration schema (schemastery fills every default; misconfiguration fails at load). */
export const Config = ConfigSchema;
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
export async function apply(ctx, config) {
    // The schema normally fills every editor default; tolerate a raw config handed straight to
    // apply() (tests, programmatic mounting) by defaulting the whole editor group here.
    const resolved = {
        ...config,
        editor: {
            enabled: false,
            requestTimeoutMs: 60_000,
            diagnosticsCacheMaxFiles: 64,
            ...config.editor,
        },
    };
    assertPositiveInteger('maxDiagnostics', resolved.maxDiagnostics);
    assertPositiveInteger('maxCompletionItems', resolved.maxCompletionItems);
    assertPositiveInteger('maxCodeActions', resolved.maxCodeActions);
    assertPositiveInteger('maxSymbols', resolved.maxSymbols);
    assertPositiveInteger('maxSignatures', resolved.maxSignatures);
    assertPositiveInteger('maxInlayHints', resolved.maxInlayHints);
    assertPositiveInteger('maxResultChars', resolved.maxResultChars);
    assertPositiveInteger('maxDocumentBytes', resolved.maxDocumentBytes);
    assertTimer('timeoutMs', resolved.timeoutMs);
    assertPositiveInteger('editor.diagnosticsCacheMaxFiles', resolved.editor.diagnosticsCacheMaxFiles);
    assertTimer('editor.requestTimeoutMs', resolved.editor.requestTimeoutMs);
    // Resolve every executable BEFORE registering anything: a bad later command must not publish an
    // earlier tool, matching the official lsp-stdio load contract.
    //
    // A02 generation guard: the executable probe (PATH lookups plus `--version` spawns) is the widest
    // async window in the family, and a mount disposed or reloaded inside it used to run the effect
    // creation below against a dead fiber (INACTIVE_EFFECT). Capture the fiber's generation before the
    // await and register nothing when it changed — the fiber is gone, so there is nothing to own.
    // A context without a fiber (direct `apply()` callers such as tests and programmatic mounting) has
    // no generation to defend, so the guard stays inert there and the load contract is unchanged.
    const generation = ctx.fiber?.uid;
    const servers = await resolveServers(ctx, resolved.servers);
    if (generation !== undefined && ctx.fiber?.uid !== generation)
        return;
    const sandbox = new FormatSandboxController(ctx);
    const client = new LspActionClient(ctx.subprocess, ctx.fs, resolved.maxDocumentBytes, message => ctx.logger('lsp-actions').warn(message));
    // `ctx.lsp` is an optional capability: typed required by the seam package, absent at runtime in
    // compositions without a provider. Consume it structurally and lazily, never by import or by an
    // apply-time snapshot — the seam may load after this plugin or be re-added mid-session.
    // Consumer — resolves the optional ctx.lsp seam lazily and drives the stdio client over ctx.subprocess/ctx.fs per call.
    const getSeam = () => ctx.get('lsp');
    // The fs seam drives project-marker routing: a file whose nearest ancestor holds a marker some
    // entry declares (`projectMarkers`) is served by that entry instead of the extension default.
    const runner = createActionRunner({ getSeam, client, servers, fs: ctx.fs });
    // Service Provider — registers the eight LSP action tools plus the optional editor JSON-RPC transport through a scoped ctx.effect.
    ctx.effect(() => {
        registerDiagnosticsTool(ctx, runner, resolved);
        registerCompletionTool(ctx, runner, resolved);
        registerFormatTool(ctx, runner, sandbox, resolved);
        registerCodeActionTool(ctx, runner, resolved);
        registerSymbolsTool(ctx, runner, resolved);
        registerSignatureTool(ctx, runner, resolved);
        registerInlayHintsTool(ctx, runner, resolved);
        registerRenameTool(ctx, runner, sandbox, resolved);
        // The IDE integration backend: `lsp.actions.list` / `lsp.actions.run` / `lsp.events` over
        // JSON-RPC stdio. Only composed when the deployment opts in (editor.enabled) — a Web or CLI
        // composition must never claim stdout. Every registration here is effect-scoped, so stopping
        // or updating the plugin tears down the transport, the listeners, and the cache.
        const editor = resolved.editor.enabled
            ? startEditorProtocol(ctx, runner, sandbox, resolved)
            : undefined;
        return async () => {
            await editor?.dispose();
            await client.disposeAll();
        };
    }, 'lsp-actions.registerTools');
}
//# sourceMappingURL=index.js.map
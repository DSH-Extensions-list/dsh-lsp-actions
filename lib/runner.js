/**
 * The action runner the three tools call: official-seam-first, own-client-fallback. When the
 * extended `ctx.lsp` seam is mounted, actions go through it; when the seam is absent, too old, or
 * has no provider for the file, the plugin's own client serves the call from the `servers` table.
 * A seam provider that exists but lacks the capability fails loud — the user configured the
 * server in one place and gets a real error instead of a silently spawned duplicate.
 * @module dsh-lsp-actions/runner
 */
import { finalExtension } from "./extension.js";
import { configuredProjectMarkers, findProjectMarker } from "./project.js";
import { firstLanguageId, routeFile } from "./servers.js";
import { classifySeamAttempt, trySeamAction } from "./seam.js";
import { LspActionError } from "./vocabulary.js";
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
export function createActionRunner(options) {
    const markers = options.fs === undefined ? [] : configuredProjectMarkers(options.servers);
    const fs = options.fs;
    // Seam vintages are cached per seam INSTANCE, not per runner: the contract allows a seam to load
    // after this plugin or be re-added mid-session, and a fresh seam object deserves a fresh record.
    const vintages = new WeakMap();
    const seamVintageOf = (seam) => vintages.get(seam);
    const recordSeamVintage = (seam, attempt) => {
        vintages.set(seam, classifySeamAttempt(attempt));
    };
    const collaborators = {
        client: options.client,
        servers: options.servers,
        seamVintageOf,
        recordSeamVintage,
        projectMarker: fs === undefined || markers.length === 0
            ? noProjectMarker
            : (filePath, workspaceRoot, signal) => findProjectMarker(fs, markers, filePath, workspaceRoot, signal),
    };
    return {
        diagnostics: (request, signal) => runOp({ ...collaborators, seam: options.getSeam() }, 'diagnostics', request, signal),
        formatDocument: (request, signal) => runOp({ ...collaborators, seam: options.getSeam() }, 'formatDocument', request, signal),
        completion: (request, signal) => runOp({ ...collaborators, seam: options.getSeam() }, 'completion', request, signal),
        codeActions: (request, signal) => runOp({ ...collaborators, seam: options.getSeam() }, 'codeAction', request, signal),
        workspaceSymbols: (request, signal) => runOp({ ...collaborators, seam: options.getSeam() }, 'workspaceSymbol', request, signal),
        documentSymbols: (request, signal) => runOp({ ...collaborators, seam: options.getSeam() }, 'documentSymbol', request, signal),
        signatureHelp: (request, signal) => runOp({ ...collaborators, seam: options.getSeam() }, 'signatureHelp', request, signal),
        inlayHints: (request, signal) => runOp({ ...collaborators, seam: options.getSeam() }, 'inlayHint', request, signal),
        rename: (request, newName, signal) => renameOp({ ...collaborators, seam: options.getSeam() }, request, newName, signal),
    };
}
/** The project resolver used when no server entry declares a marker (no filesystem access at all). */
async function noProjectMarker() {
    return undefined;
}
/** The route for one request: the nearest claimed project marker decides, then globs/extensions. */
async function routeForFile(options, request, signal) {
    const projectMarker = await options.projectMarker(request.filePath, request.workspaceRoot, signal);
    return routeFile(options.servers, request.filePath, projectMarker);
}
async function runOp(options, operation, request, signal) {
    if (options.seam !== undefined) {
        // A `legacy` seam (the published four-operation surface) rejects every action operation with a
        // code-less error; that is a capability fact about the seam, so it is recorded from the first
        // real attempt and cached per seam instance, after which a legacy seam is skipped entirely
        // instead of paying a failed round trip on every call. No extra probe query is spent.
        if (options.seamVintageOf?.(options.seam) !== 'legacy') {
            const attempt = await trySeamAction(options.seam, operation, request.filePath, request.workspaceRoot, request.position, request.range, signal, extrasFor(operation, request));
            options.recordSeamVintage?.(options.seam, attempt);
            if (attempt.ok)
                return attempt.result;
            if (attempt.reason === 'unsupported') {
                throw new LspActionError(`the mounted ctx.lsp provider does not support ${operation}; configure a server that advertises it`, 'LSP_ACTION_UNSUPPORTED');
            }
            if (attempt.reason === 'error')
                throw attempt.error;
            // absent / legacy / unavailable: the seam cannot serve this action — fall through to the
            // plugin's own client, which fails loud itself when no server entry handles the file.
        }
    }
    // Workspace symbol search has no document to route by: when no entry matches (or no file path
    // was supplied), fall back to the first configured server.
    const routed = await routeForFile(options, request, signal);
    const route = routed ?? firstServerRoute(options.servers, operation);
    if (route === undefined) {
        throw new LspActionError(noRouteMessage(request.filePath), 'LSP_ACTION_UNAVAILABLE');
    }
    if (operation === 'workspaceSymbol') {
        // With a routing file, keep it open for the request: project-based servers (tsls) refuse
        // document-free workspace/symbol.
        if (request.source !== undefined) {
            const actionRequest = {
                filePath: request.filePath,
                workspaceRoot: request.workspaceRoot,
                source: request.source,
                languageId: route.languageId,
            };
            return await options.client.workspaceSymbolsInDocument(route.server, actionRequest, request.query ?? '', signal);
        }
        return await options.client.workspaceSymbols(route.server, request.workspaceRoot, request.query ?? '', signal);
    }
    if (request.source === undefined) {
        throw new LspActionError(`the ${operation} action requires a source document`, 'LSP_ACTION_WORKSPACE_REQUIRED');
    }
    const actionRequest = {
        filePath: request.filePath,
        workspaceRoot: request.workspaceRoot,
        source: request.source,
        languageId: route.languageId,
        ...request.position === undefined ? {} : { position: request.position },
        ...request.range === undefined ? {} : { range: request.range },
        ...request.onlyKinds === undefined ? {} : { onlyKinds: request.onlyKinds },
    };
    switch (operation) {
        case 'diagnostics': return await options.client.diagnostics(route.server, actionRequest, signal);
        case 'formatDocument': return await options.client.formatDocument(route.server, actionRequest, signal);
        case 'completion': return await options.client.completion(route.server, actionRequest, signal);
        case 'codeAction': return await options.client.codeActions(route.server, actionRequest, signal);
        case 'documentSymbol': return await options.client.documentSymbols(route.server, actionRequest, signal);
        case 'signatureHelp': return await options.client.signatureHelp(route.server, actionRequest, signal);
        case 'inlayHint': return await options.client.inlayHints(route.server, actionRequest, signal);
    }
}
/** The first configured server's route, for workspace-scoped actions without a file to route by. */
function firstServerRoute(servers, operation) {
    if (operation !== 'workspaceSymbol')
        return undefined;
    const first = servers[0];
    if (first === undefined)
        return undefined;
    return { server: first, languageId: firstLanguageId(first) };
}
/** The operation-specific extras one seam query carries (`query` for symbol search, `only` filters). */
function extrasFor(operation, request) {
    switch (operation) {
        case 'workspaceSymbol': return request.query === undefined ? {} : { query: request.query };
        case 'codeAction': return request.onlyKinds === undefined ? {} : { onlyKinds: request.onlyKinds };
        default: return {};
    }
}
/**
 * Serve the rename action: seam first (only a seam that answers with the `rename` result kind
 * serves it — any current seam vintage falls back), then the plugin's own client.
 */
async function renameOp(options, request, newName, signal) {
    if (options.seam !== undefined) {
        const attempt = await trySeamAction(options.seam, 'rename', request.filePath, request.workspaceRoot, request.position, request.range, signal, { newName });
        if (attempt.ok) {
            if (attempt.result.kind === 'rename')
                return attempt.result;
            // A seam answered with a different result kind: it cannot serve rename — fall through.
        }
        else {
            if (attempt.reason === 'unsupported') {
                throw new LspActionError('the mounted ctx.lsp provider does not support rename; configure a server that advertises it', 'LSP_ACTION_UNSUPPORTED');
            }
            if (attempt.reason === 'error')
                throw attempt.error;
            // absent / legacy / unavailable: the seam cannot serve rename — fall through to the
            // plugin's own client, which fails loud itself when no entry handles the file.
        }
    }
    const route = await routeForFile(options, request, signal);
    if (route === undefined) {
        throw new LspActionError(noRouteMessage(request.filePath), 'LSP_ACTION_UNAVAILABLE');
    }
    if (request.source === undefined) {
        throw new LspActionError('the rename action requires a source document', 'LSP_ACTION_WORKSPACE_REQUIRED');
    }
    const actionRequest = {
        filePath: request.filePath,
        workspaceRoot: request.workspaceRoot,
        source: request.source,
        languageId: route.languageId,
        ...request.position === undefined ? {} : { position: request.position },
    };
    return await options.client.rename(route.server, actionRequest, newName, signal);
}
/** The fail-loud message when neither the seam nor the servers table handles the file. */
function noRouteMessage(filePath) {
    const extension = finalExtension(filePath);
    const subject = extension === '' ? 'this file type' : `files with the "${extension}" extension`;
    return `no LSP server is configured for ${subject} — add an entry to the lsp-actions servers table, or register an LSP provider on ctx.lsp`;
}
//# sourceMappingURL=runner.js.map
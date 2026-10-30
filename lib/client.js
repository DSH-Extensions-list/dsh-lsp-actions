/**
 * The plugin's own minimal LSP action client — the fallback for compositions where the official
 * `ctx.lsp` seam does not serve action operations yet. One server process per (server entry,
 * canonical workspace), lazily spawned and serialized; each document runs a resident
 * didOpen→(didChange)→… lifecycle (open once, kept open until process teardown) so project-based
 * servers like typescript-language-server keep serving signatureHelp and document-free
 * workspace/symbol instead of answering null on a document that was just closed. See
 * `docs/seam-extension-notes.md` for the migration story to the official seam.
 * @module dsh-lsp-actions/client
 */
import { abortable } from "./abort.js";
import { LspConnection, LspRpcError } from "./connection.js";
import { canonicalizeWorkspace, normalizeFileUri, readHostSource, workspaceRelativePath } from "./host.js";
import { decodeTextEdits, negotiatePositionEncoding, normalizeCodeActions, normalizeCompletionItems, normalizeDiagnostics, normalizeEdits, normalizeInlayHints, normalizeSignatures, normalizeSymbols, normalizeWorkspaceEdit, PositionCodec, requestMethod, supportsAction, supportsPullDiagnostics, supportsTransientOpen, } from "./translate.js";
import { LspActionError } from "./vocabulary.js";
import { DEFAULT_MAX_DOCUMENT_BYTES } from "./servers.js";
/**
 * Pooled minimal LSP action client. Instances are single-flight per canonical workspace and are
 * evicted as soon as they die; every await observes cancellation.
 */
export class LspActionClient {
    subprocess;
    fs;
    maxDocumentBytes;
    warn;
    instances = new Map();
    /** Evicted instances whose teardown is still settling or retrying. */
    reaps = new Map();
    /** Instances whose three reaps failed: the tree may still be alive, so keep the last reference. */
    failedReaps = new Set();
    lifetime = new AbortController();
    disposed = false;
    constructor(subprocess, fs, 
    /** Byte cap for documents the rename flow reads back to decode cross-file positions. */
    maxDocumentBytes = DEFAULT_MAX_DOCUMENT_BYTES, 
    /** Host logger for teardown failures that used to be swallowed. */
    warn = () => { }) {
        this.subprocess = subprocess;
        this.fs = fs;
        this.maxDocumentBytes = maxDocumentBytes;
        this.warn = warn;
    }
    /** Spawn one connection through the subprocess seam (the real provider at runtime). */
    spawner = spec => this.subprocess.spawn(spec);
    /**
     * Run the diagnostics action through the routed server.
     * @param server - the routed server entry.
     * @param request - the action request.
     * @param signal - optional cancellation.
     * @returns the normalized diagnostics result.
     */
    diagnostics(server, request, signal) {
        return this.run(server, request, signal, instance => instance.diagnostics(request, signal));
    }
    /**
     * Run the formatting action through the routed server; the client only RETURNS edits, it never
     * writes files — the tool applies them through `ctx.fs` write-intent.
     * @param server - the routed server entry.
     * @param request - the action request (carries the optional range).
     * @param signal - optional cancellation.
     * @returns the normalized edits result.
     */
    formatDocument(server, request, signal) {
        return this.run(server, request, signal, instance => instance.formatDocument(request, signal));
    }
    /**
     * Run the completion action through the routed server.
     * @param server - the routed server entry.
     * @param request - the action request (carries the cursor position).
     * @param signal - optional cancellation.
     * @returns the normalized completion result.
     */
    completion(server, request, signal) {
        return this.run(server, request, signal, instance => instance.completion(request, signal));
    }
    /**
     * Run the code actions action through the routed server; the client only REPORTS edits and
     * commands, it never applies them — applying one is the model's own write/edit decision.
     * @param server - the routed server entry.
     * @param request - the action request (carries the optional range and kind filters).
     * @param signal - optional cancellation.
     * @returns the normalized code actions result.
     */
    codeActions(server, request, signal) {
        return this.run(server, request, signal, instance => instance.codeActions(request, signal));
    }
    /**
     * Run a workspace-wide symbol search through the routed server (no document involved).
     * @param server - the routed server entry.
     * @param workspaceRoot - the workspace to search.
     * @param query - the symbol name query.
     * @param signal - optional cancellation.
     * @returns the normalized symbols result.
     */
    workspaceSymbols(server, workspaceRoot, query, signal) {
        return this.runBare(server, workspaceRoot, signal, instance => instance.workspaceSymbols(query, signal));
    }
    /**
     * Run a workspace-wide symbol search with one document kept open: project-based servers (tsls)
     * refuse document-free `workspace/symbol`, so the routing file stays transiently open for the
     * request and closes afterwards.
     * @param server - the routed server entry.
     * @param request - the action request (whose source is kept open during the search).
     * @param query - the symbol name query.
     * @param signal - optional cancellation.
     * @returns the normalized symbols result.
     */
    workspaceSymbolsInDocument(server, request, query, signal) {
        return this.run(server, request, signal, instance => instance.workspaceSymbolsInDocument(request, query, signal));
    }
    /**
     * Run a document symbol listing through the routed server.
     * @param server - the routed server entry.
     * @param request - the action request.
     * @param signal - optional cancellation.
     * @returns the normalized symbols result.
     */
    documentSymbols(server, request, signal) {
        return this.run(server, request, signal, instance => instance.documentSymbols(request, signal));
    }
    /**
     * Run signature help through the routed server.
     * @param server - the routed server entry.
     * @param request - the action request (carries the cursor position).
     * @param signal - optional cancellation.
     * @returns the normalized signatures result.
     */
    signatureHelp(server, request, signal) {
        return this.run(server, request, signal, instance => instance.signatureHelp(request, signal));
    }
    /**
     * Run inlay hints through the routed server.
     * @param server - the routed server entry.
     * @param request - the action request (carries the optional range).
     * @param signal - optional cancellation.
     * @returns the normalized inlay hints result.
     */
    inlayHints(server, request, signal) {
        return this.run(server, request, signal, instance => instance.inlayHints(request, signal));
    }
    /**
     * Run a symbol rename through the routed server; the client only RETURNS the grouped edits, it
     * never writes files — the tool applies them through `ctx.fs` write-intent. Cross-document
     * positions are decoded per document (reading the target text for non-utf-16 servers), so the
     * returned edits are utf-16 for every document.
     * @param server - the routed server entry.
     * @param request - the action request (carries the cursor position).
     * @param newName - the new symbol name.
     * @param signal - optional cancellation.
     * @returns the normalized, decoded rename result.
     */
    rename(server, request, newName, signal) {
        return this.run(server, request, signal, async (instance, querySignal) => {
            const workspace = await canonicalizeWorkspace(this.fs, request.workspaceRoot, querySignal);
            this.assertActive(querySignal);
            const raw = await instance.rename(request, newName, querySignal);
            return this.decodeRenameEdits(raw, request, workspace, querySignal);
        });
    }
    /** Disposed flag through a method so an await cannot narrow it to a literal. */
    isDisposed() {
        return this.disposed;
    }
    /** Reject work that cannot publish or use a client-owned instance. */
    assertActive(signal) {
        if (this.isDisposed())
            throw new LspActionError('LSP action client is disposed', 'LSP_ACTION_SERVER_FAILED');
        if (signal?.aborted)
            throw signal.reason;
    }
    /** Fuse caller cancellation with client disposal for every filesystem and protocol await. */
    querySignal(signal) {
        return signal === undefined
            ? this.lifetime.signal
            : AbortSignal.any([signal, this.lifetime.signal]);
    }
    async run(server, request, signal, body) {
        this.assertActive(signal);
        const querySignal = this.querySignal(signal);
        const workspace = await canonicalizeWorkspace(this.fs, request.workspaceRoot, querySignal);
        this.assertActive(querySignal);
        const key = `${server.serverId}\u0000${workspace.target.targetKey}`;
        return this.runScoped(key, workspace, server, querySignal, body);
    }
    /** The document-free sibling of {@link run}: serves workspace-scoped actions (symbol search). */
    async runBare(server, workspaceRoot, signal, body) {
        this.assertActive(signal);
        const querySignal = this.querySignal(signal);
        const workspace = await canonicalizeWorkspace(this.fs, workspaceRoot, querySignal);
        this.assertActive(querySignal);
        const key = `${server.serverId}\u0000${workspace.target.targetKey}`;
        return this.runScoped(key, workspace, server, querySignal, body);
    }
    /** Serialize and run one action attempt pair (retry-once included) for a canonical workspace. */
    runScoped(key, workspace, server, signal, body) {
        return this.enqueue(key, signal, async () => {
            this.assertActive(signal);
            try {
                return await this.runOnce(key, workspace, server, signal, body);
            }
            catch (error) {
                // A structured server failure with the first instance dying during its handshake gets one
                // fresh-spawn retry, matching the official stdio host's single bad-transport retry.
                // Mid-action failures surface as plain connection errors and never retry here.
                if (isHandshakeServerFailure(error)) {
                    return await this.runOnce(key, workspace, server, signal, body);
                }
                throw error;
            }
        });
    }
    /** One attempt: publish/borrow the instance, run the action, evict the dead, arm the idle timer. */
    async runOnce(key, workspace, server, signal, body) {
        const instance = this.instanceFor(key, workspace, server);
        // A timer armed by the previous action must not fire under this one.
        this.clearIdleTimer(key);
        try {
            return await body(instance, signal);
        }
        finally {
            // A dead instance can never serve again: evict it so the next call spawns fresh, but keep
            // its teardown tracked — a failed dispose must not leave the process tree unreferenced.
            if (instance.dead) {
                if (this.instances.get(key) === instance)
                    this.instances.delete(key);
                this.clearIdleTimer(key);
                void this.reap(instance);
            }
            else if (server.entry.idleTimeoutMs > 0) {
                this.armIdleTimer(key, instance, server.entry.idleTimeoutMs);
            }
        }
    }
    /**
     * Dispose one evicted instance with bounded retries, keeping it referenced until teardown
     * settles. A rejected {@link LspActionInstance.startTeardown} used to be swallowed here, which
     * both hid the failure and left the process tree with no owner; the retry makes it observable
     * and gives a transient provider-observation failure another chance.
     * @param instance - the evicted instance to tear down.
     * @returns the settling teardown promise (never rejects unobserved).
     */
    reap(instance) {
        const existing = this.reaps.get(instance);
        if (existing !== undefined)
            return existing;
        const task = (async () => {
            let lastError;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await instance.dispose();
                    this.failedReaps.delete(instance);
                    return;
                }
                catch (error) {
                    lastError = error;
                    if (attempt < 3)
                        await new Promise(resolve => setTimeout(resolve, attempt * 250));
                }
            }
            this.failedReaps.add(instance);
            this.warn(`lsp-actions: teardown failed after 3 attempts (process tree may still be alive): ${messageOf(lastError)}`);
            throw lastError;
        })().finally(() => {
            this.reaps.delete(instance);
        });
        // The caller may background this; a rejected teardown is already logged and must not surface
        // as an unhandled rejection.
        task.catch(() => { });
        this.reaps.set(instance, task);
        return task;
    }
    /** Idle-eviction timers per workspace key; a use resets, a fire disposes and evicts. */
    idleTimers = new Map();
    armIdleTimer(key, instance, idleTimeoutMs) {
        this.clearIdleTimer(key);
        const timer = setTimeout(() => {
            if (this.instances.get(key) !== instance)
                return;
            this.instances.delete(key);
            this.idleTimers.delete(key);
            void this.reap(instance);
        }, idleTimeoutMs);
        timer.unref?.();
        this.idleTimers.set(key, timer);
    }
    clearIdleTimer(key) {
        const timer = this.idleTimers.get(key);
        if (timer === undefined)
            return;
        clearTimeout(timer);
        this.idleTimers.delete(key);
    }
    /** Serialize one complete action lifecycle per canonical workspace. */
    enqueue(key, signal, run) {
        const previous = this.tailFor(key);
        const result = abortable(previous, signal).then(run);
        // The tail follows the actual prior work even when this caller aborts its wait, so later
        // callers still serialize without inheriting an earlier action's outcome.
        this.setTail(key, previous.then(() => result).then(() => undefined, () => undefined));
        return result;
    }
    /** The serialization tail for one workspace key (per-instance queues live on the instance). */
    tails = new Map();
    tailFor(key) {
        return this.tails.get(key) ?? Promise.resolve();
    }
    setTail(key, tail) {
        this.tails.set(key, tail);
        void tail.then(() => {
            if (this.tails.get(key) === tail)
                this.tails.delete(key);
        });
    }
    /** Return or synchronously publish the one instance for a canonical workspace. */
    instanceFor(key, workspace, server) {
        this.assertActive();
        const existing = this.instances.get(key);
        if (existing !== undefined)
            return existing;
        const created = new LspActionInstance({
            executable: server.executable,
            args: server.entry.args,
            cwd: workspace.canonicalPath,
            workspaceUri: workspace.fileUrl,
            env: server.entry.env,
            configuration: server.entry.configuration,
            initializationOptions: server.entry.initializationOptions,
            formattingOptions: server.entry.formattingOptions,
            maxMessageBytes: server.entry.maxMessageBytes,
            maxStderrBytes: server.entry.maxStderrBytes,
            killGraceMs: server.entry.killGraceMs,
            shutdownTimeoutMs: server.entry.shutdownTimeoutMs,
            diagnosticsSettleMs: server.entry.diagnosticsSettleMs,
            diagnosticsDebounceMs: server.entry.diagnosticsDebounceMs,
            idleTimeoutMs: server.entry.idleTimeoutMs,
        }, this.spawner);
        this.instances.set(key, created);
        return created;
    }
    /** Dispose every live instance, drain pending reaps, and block further actions. */
    async disposeAll() {
        this.disposed = true;
        this.lifetime.abort(new LspActionError('LSP action client is disposed', 'LSP_ACTION_SERVER_FAILED'));
        for (const timer of this.idleTimers.values())
            clearTimeout(timer);
        this.idleTimers.clear();
        const live = [...this.instances.values()];
        this.instances.clear();
        const pending = [...this.reaps.values()];
        const failed = [...this.failedReaps];
        const results = await Promise.allSettled([
            ...live.map(instance => this.reap(instance)),
            ...pending,
            ...failed.map(instance => this.reap(instance)),
        ]);
        const failures = [];
        for (const result of results) {
            if (result.status === 'rejected')
                failures.push(result.reason);
        }
        if (failures.length > 0)
            throw new AggregateError(failures, 'lsp-actions instance teardown failed');
    }
    /**
     * Decode one rename's grouped wire edits into utf-16, per document: the origin document uses
     * the source text the server saw; any other document is read back for its codec (utf-16 servers
     * need no read — their positions are already utf-16). An unreadable or out-of-workspace target
     * on a non-utf-16 server is a structured conflict, never silently mis-decoded positions.
     */
    async decodeRenameEdits(raw, request, workspace, signal) {
        const decoded = {};
        const originUri = normalizeFileUri(request.source.fileUrl);
        for (const [uri, edits] of Object.entries(raw.edits)) {
            let codec;
            if (raw.encoding === 'utf-16') {
                codec = undefined;
            }
            else if (normalizeFileUri(uri) === originUri) {
                codec = new PositionCodec(request.source.text);
            }
            else {
                const relative = workspaceRelativePath(workspace, uri);
                if (relative === undefined) {
                    throw new LspActionError(`the language server's rename edits a document outside the workspace (${uri}), whose ${raw.encoding} positions cannot be decoded`, 'LSP_ACTION_CONFLICT');
                }
                let target;
                try {
                    target = (await readHostSource(this.fs, relative, workspace, this.maxDocumentBytes, signal)).text;
                }
                catch (error) {
                    throw new LspActionError(`the language server's rename edits a document that cannot be read (${uri}): ${messageOf(error)}`, 'LSP_ACTION_CONFLICT', { cause: error });
                }
                codec = new PositionCodec(target);
            }
            decoded[uri] = decodeTextEdits(edits, codec, raw.encoding);
        }
        return { kind: 'rename', edits: decoded };
    }
}
/** One initialized server process: handshake, serialized queue, and bounded teardown. */
export class LspActionInstance {
    spec;
    connection;
    capabilities;
    positionEncoding = 'utf-16';
    queue = Promise.resolve();
    disposed = false;
    teardownPromise;
    processClosed = false;
    /** True when the handshake (initialize) ended in failure — the one retryable server state. */
    handshakeFailed = false;
    ready;
    /** Latest pushed diagnostic batch per document URI (push-only servers). */
    pushed = new Map();
    /** Last batch handed to a caller, reused when the document text is unchanged. */
    lastPushed = new Map();
    pushWaiters = new Map();
    /** Per-document text (and codec) for the resident open document, for push-path conversion. */
    openedDocs = new Map();
    /**
     * Resident open documents per URI: kept open for the instance's lifetime so project-based
     * servers (tsls) keep serving signatureHelp and document-free workspace/symbol. didOpen runs
     * once per URI; a later request with changed source sends a full-document didChange.
     */
    residentDocs = new Map();
    constructor(spec, spawner) {
        this.spec = spec;
        this.connection = new LspConnection({
            command: spec.executable,
            args: spec.args,
            cwd: spec.cwd,
            env: spec.env,
            maxMessageBytes: spec.maxMessageBytes,
            maxStderrBytes: spec.maxStderrBytes,
            killGraceMs: spec.killGraceMs,
            configuration: spec.configuration,
        }, spawner, (method, params) => this.answerServerRequest(method, params));
        this.connection.onNotification((method, params) => { this.onNotification(method, params); });
        this.ready = this.initialize().catch((error) => {
            this.handshakeFailed = true;
            throw error;
        });
        // A handshake rejection must not surface as an unhandled rejection before the first action
        // awaits it; actions attach the real handler.
        this.ready.catch(() => { });
        void this.connection.closed.then(() => { this.processClosed = true; });
    }
    /** Synchronous liveness check: true once the process closed or the instance was disposed. */
    get dead() {
        return this.processClosed || this.disposed || this.connection.failed;
    }
    async initialize() {
        try {
            const result = await this.connection.request('initialize', {
                // A subprocess provider may run in another PID namespace or machine;
                // the host PID would let the server monitor an unrelated process.
                processId: null,
                rootUri: this.spec.workspaceUri,
                workspaceFolders: [{ uri: this.spec.workspaceUri, name: 'workspace' }],
                capabilities: CLIENT_CAPABILITIES,
                initializationOptions: this.spec.initializationOptions,
            });
            const capabilities = result.capabilities;
            if (capabilities === null || typeof capabilities !== 'object') {
                throw new LspActionError('language server initialize result had no capabilities', 'LSP_ACTION_MALFORMED_RESPONSE');
            }
            this.capabilities = capabilities;
            this.positionEncoding = negotiatePositionEncoding(this.capabilities.positionEncoding);
            await this.connection.notify('initialized', {});
        }
        catch (error) {
            // Handshake failures are always server-side: the initialize request raced no signal here.
            throw serverFailed(error, this.connection.stderrTail);
        }
    }
    /** Await the handshake, tearing the instance down when it ends in failure. */
    async readyGate(signal) {
        if (this.disposed)
            throw new LspActionError('LSP action client is disposed', 'LSP_ACTION_SERVER_FAILED');
        if (signal?.aborted)
            throw signal.reason;
        try {
            await abortable(this.ready, signal);
        }
        catch (error) {
            if (!this.dead)
                await this.startTeardown().catch(() => { });
            throw error;
        }
    }
    /** Run one action through the serialized queue. */
    runSerialized(signal, run) {
        // Serialize behind prior work but observe abort DURING the queue wait too, so a hung earlier
        // action cannot block a later caller's timeout.
        const result = abortable(this.queue, signal).then(run);
        this.queue = this.queue.then(() => result).then(() => undefined, () => undefined);
        return result;
    }
    diagnostics(request, signal) {
        return this.runSerialized(signal, async () => {
            await this.readyGate(signal);
            this.assertSupports('diagnostics', request);
            const capabilities = this.requiredCapabilities();
            const pull = supportsPullDiagnostics(capabilities);
            return await this.withDocument(request, signal, async (uri) => {
                if (pull) {
                    const payload = await this.sendRequest('textDocument/diagnostic', { textDocument: { uri } }, signal);
                    return { kind: 'diagnostics', diagnostics: normalizeDiagnostics(payload, this.decodeFor(request.source.text)) };
                }
                const diagnostics = await this.waitForPushedDiagnostics(uri, request.source.text, signal);
                return { kind: 'diagnostics', diagnostics };
            });
        });
    }
    formatDocument(request, signal) {
        return this.runSerialized(signal, async () => {
            await this.readyGate(signal);
            this.assertSupports('formatDocument', request);
            return await this.withDocument(request, signal, async (uri) => {
                const method = requestMethod({ operation: 'formatDocument', range: request.range });
                const payload = await this.sendRequest(method, {
                    textDocument: { uri },
                    ...this.spec.formattingOptions === null ? {} : { options: this.spec.formattingOptions },
                    ...request.range === undefined ? {} : { range: this.encodeRange(request.source.text, request.range) },
                }, signal);
                return { kind: 'edits', edits: normalizeEdits(payload, this.decodeFor(request.source.text)) };
            });
        });
    }
    completion(request, signal) {
        return this.runSerialized(signal, async () => {
            await this.readyGate(signal);
            this.assertSupports('completion', request);
            return await this.withDocument(request, signal, async (uri) => {
                const payload = await this.sendRequest('textDocument/completion', {
                    textDocument: { uri },
                    position: this.encodePosition(request.source.text, request.position),
                }, signal);
                return { kind: 'completion', items: normalizeCompletionItems(payload, this.decodeFor(request.source.text)) };
            });
        });
    }
    codeActions(request, signal) {
        return this.runSerialized(signal, async () => {
            await this.readyGate(signal);
            this.assertSupports('codeAction', request);
            return await this.withDocument(request, signal, async (uri) => {
                const diagnostics = await this.collectDiagnostics(uri, request, signal);
                const range = request.range ?? firstDiagnosticRange(diagnostics) ?? documentRange(request.source.text);
                const encode = this.encodeAll(request.source.text);
                const payload = await this.sendRequest('textDocument/codeAction', {
                    textDocument: { uri },
                    range: encode === undefined ? range : { start: encode(range.start), end: encode(range.end) },
                    context: {
                        diagnostics: diagnostics.map(diagnostic => wireDiagnostic(diagnostic, encode)),
                        ...request.onlyKinds === undefined ? {} : { only: request.onlyKinds },
                    },
                }, signal);
                return { kind: 'codeActions', items: normalizeCodeActions(payload, this.decodeFor(request.source.text)) };
            });
        });
    }
    workspaceSymbols(query, signal) {
        return this.runSerialized(signal, async () => {
            await this.readyGate(signal);
            const capabilities = this.requiredCapabilities();
            if (!supportsAction(capabilities, 'workspaceSymbol', false)) {
                throw new LspActionError('server does not support workspaceSymbol', 'LSP_ACTION_UNSUPPORTED');
            }
            const payload = await this.sendRequest('workspace/symbol', { query }, signal);
            return { kind: 'symbols', items: normalizeSymbols(payload, undefined) };
        });
    }
    /** The document-open variant of {@link workspaceSymbols}, for project-based servers. */
    workspaceSymbolsInDocument(request, query, signal) {
        return this.runSerialized(signal, async () => {
            await this.readyGate(signal);
            const capabilities = this.requiredCapabilities();
            if (!supportsAction(capabilities, 'workspaceSymbol', false)) {
                throw new LspActionError('server does not support workspaceSymbol', 'LSP_ACTION_UNSUPPORTED');
            }
            return await this.withDocument(request, signal, async () => {
                const payload = await this.sendRequest('workspace/symbol', { query }, signal);
                return { kind: 'symbols', items: normalizeSymbols(payload, undefined) };
            });
        });
    }
    documentSymbols(request, signal) {
        return this.runSerialized(signal, async () => {
            await this.readyGate(signal);
            this.assertSupports('documentSymbol', request);
            return await this.withDocument(request, signal, async (uri) => {
                const payload = await this.sendRequest('textDocument/documentSymbol', { textDocument: { uri } }, signal);
                return { kind: 'symbols', items: normalizeSymbols(payload, uri, this.decodeFor(request.source.text)) };
            });
        });
    }
    signatureHelp(request, signal) {
        return this.runSerialized(signal, async () => {
            await this.readyGate(signal);
            this.assertSupports('signatureHelp', request);
            return await this.withDocument(request, signal, async (uri) => {
                const payload = await this.sendRequest('textDocument/signatureHelp', {
                    textDocument: { uri },
                    position: this.encodePosition(request.source.text, request.position),
                }, signal);
                return { kind: 'signatures', ...normalizeSignatures(payload) };
            });
        });
    }
    inlayHints(request, signal) {
        return this.runSerialized(signal, async () => {
            await this.readyGate(signal);
            this.assertSupports('inlayHint', request);
            return await this.withDocument(request, signal, async (uri) => {
                const payload = await this.sendRequest('textDocument/inlayHint', {
                    textDocument: { uri },
                    ...request.range === undefined ? {} : { range: this.encodeRange(request.source.text, request.range) },
                }, signal);
                return { kind: 'inlayHints', items: normalizeInlayHints(payload, this.decodeFor(request.source.text)) };
            });
        });
    }
    /**
     * Run a rename through the server and return the grouped wire edits (positions still in the
     * server's encoding; the client decodes them per document). `textDocument/prepareRename` runs
     * first as advisory validation: a `null` answer is the structured no-symbol failure, while a
     * server without the method (or that rejects it on a transient document) still serves rename.
     */
    rename(request, newName, signal) {
        return this.runSerialized(signal, async () => {
            await this.readyGate(signal);
            this.assertSupports('rename', request);
            return await this.withDocument(request, signal, async (uri) => {
                const position = this.encodePosition(request.source.text, request.position);
                if (position === undefined)
                    throw new Error('rename requires a cursor position');
                try {
                    const prepared = await this.sendRequest('textDocument/prepareRename', {
                        textDocument: { uri },
                        position,
                    }, signal);
                    if (prepared === null || prepared === undefined) {
                        throw new LspActionError('no symbol to rename at this position', 'LSP_ACTION_NO_SYMBOL');
                    }
                }
                catch (error) {
                    // Advisory only: an error RESPONSE (including method-not-found) does not stop the call;
                    // a transport failure does.
                    if (!(error instanceof LspRpcError))
                        throw error;
                }
                const payload = await this.sendRequest('textDocument/rename', {
                    textDocument: { uri },
                    position,
                    newName,
                }, signal);
                return { kind: 'rename', edits: normalizeWorkspaceEdit(payload), encoding: this.positionEncoding };
            });
        });
    }
    /** Collect this document's diagnostics for a code-action context (pull or push-settle). */
    async collectDiagnostics(uri, request, signal) {
        const capabilities = this.requiredCapabilities();
        if (supportsPullDiagnostics(capabilities)) {
            const payload = await this.sendRequest('textDocument/diagnostic', { textDocument: { uri } }, signal);
            return normalizeDiagnostics(payload, this.decodeFor(request.source.text));
        }
        return await this.waitForPushedDiagnostics(uri, request.source.text, signal);
    }
    /** The codec for one document, or undefined when the server speaks utf-16. */
    codecFor(text) {
        return this.positionEncoding === 'utf-16' ? undefined : new PositionCodec(text);
    }
    /** Encode a utf-16 cursor position into the server's encoding. */
    encodePosition(text, position) {
        if (position === undefined)
            return undefined;
        return this.codecFor(text)?.encode(position, this.positionEncoding) ?? position;
    }
    /** Encode a utf-16 range into the server's encoding. */
    encodeRange(text, range) {
        if (range === undefined)
            return undefined;
        const codec = this.codecFor(text);
        if (codec === undefined)
            return range;
        return { start: codec.encode(range.start, this.positionEncoding), end: codec.encode(range.end, this.positionEncoding) };
    }
    /** A result-side position decoder for one document, or undefined for utf-16 servers. */
    decodeFor(text) {
        const codec = this.codecFor(text);
        if (codec === undefined)
            return undefined;
        return position => codec.decode(position, this.positionEncoding);
    }
    /** A position encoder for one document, or undefined for utf-16 servers. */
    encodeAll(text) {
        const codec = this.codecFor(text);
        if (codec === undefined)
            return undefined;
        return position => codec.encode(position, this.positionEncoding);
    }
    requiredCapabilities() {
        if (this.capabilities === undefined) {
            throw new Error('LSP action instance is not initialized');
        }
        return this.capabilities;
    }
    /** Reject an action the server did not advertise, or a sync mode this client cannot serve. */
    assertSupports(operation, request) {
        const capabilities = this.requiredCapabilities();
        if (!supportsAction(capabilities, operation, request.range !== undefined)) {
            throw new LspActionError(`server does not support ${operation}`, 'LSP_ACTION_UNSUPPORTED');
        }
        if (!supportsTransientOpen(capabilities.textDocumentSync)) {
            throw new LspActionError('server does not support the transient textDocument/didOpen this client requires', 'LSP_ACTION_UNSUPPORTED');
        }
    }
    /**
     * Run `body` inside the resident didOpen→(didChange) document lifecycle: a document is opened
     * once per instance and stays open (no per-request didClose), so project-based servers (tsls)
     * keep serving signatureHelp and document-free workspace/symbol. A later request with changed
     * source sends a full-document didChange; process shutdown closes every document.
     */
    async withDocument(request, signal, body) {
        const uri = request.source.fileUrl;
        const key = normalizeFileUri(uri);
        const resident = this.residentDocs.get(key);
        try {
            if (signal?.aborted)
                throw signal.reason;
            if (resident === undefined) {
                try {
                    await abortable(this.connection.notify('textDocument/didOpen', {
                        textDocument: { uri, languageId: request.languageId, version: 1, text: request.source.text },
                    }), signal);
                }
                catch (error) {
                    // A canceled backpressured write or failed stdin leaves the protocol stream unusable.
                    await this.startTeardown().catch(() => { });
                    throw error;
                }
                this.residentDocs.set(key, { version: 1, text: request.source.text });
                this.lastPushed.delete(key);
            }
            else if (resident.text !== request.source.text) {
                try {
                    await abortable(this.connection.notify('textDocument/didChange', {
                        textDocument: { uri, version: resident.version + 1 },
                        contentChanges: [{ text: request.source.text }],
                    }), signal);
                }
                catch (error) {
                    await this.startTeardown().catch(() => { });
                    throw error;
                }
                resident.version += 1;
                resident.text = request.source.text;
                this.lastPushed.delete(key);
            }
            // Remember the open text so push notifications (publishDiagnostics) can be decoded from
            // the server's position encoding; it persists for the instance's lifetime.
            this.openedDocs.set(key, { text: request.source.text, codec: this.codecFor(request.source.text) });
            return await body(uri);
        }
        finally {
            // Resident session: no didClose here — teardown terminates the process and closes all
            // documents; a fresh instance (next workspace or after eviction) starts with an empty map.
        }
    }
    /** Send a request, racing it against abort with a bounded cancel grace. */
    async sendRequest(method, params, signal) {
        const requestId = this.connection.peekNextId();
        const send = this.connection.request(method, params);
        if (signal === undefined)
            return await send;
        try {
            return await abortable(send, signal);
        }
        catch (error) {
            if (!signal.aborted)
                throw error;
            this.connection.cancel(requestId);
            // Wait, bounded, for the server to honor the cancellation; if it does not, the request is
            // still running: terminate the instance so nothing outlives the action.
            const grace = AbortSignal.timeout(this.spec.killGraceMs);
            const settled = await Promise.race([
                send.then(markSettled, markSettled),
                new Promise((resolve) => {
                    if (grace.aborted) {
                        resolve(false);
                        return;
                    }
                    grace.addEventListener('abort', () => { resolve(false); }, { once: true });
                }),
            ]);
            if (!settled)
                await this.startTeardown().catch(() => { });
            throw error;
        }
    }
    /**
     * Collect push-only diagnostics for one URI: the LATEST batch wins. Batches replace each other
     * (per LSP push semantics) while the settle window is open, and each push resets a short quiet
     * period (`diagnosticsDebounceMs`), so a server that publishes partial then complete batches
     * yields the complete one; the settle deadline resolves whatever is latest (empty when nothing
     * arrived).
     */
    waitForPushedDiagnostics(uri, text, signal) {
        const key = normalizeFileUri(uri);
        return new Promise((resolve, reject) => {
            const settle = AbortSignal.timeout(this.spec.diagnosticsSettleMs);
            const fused = signal === undefined ? settle : AbortSignal.any([signal, settle]);
            let done = false;
            let timer;
            const takeLatest = () => {
                if (done)
                    return;
                done = true;
                if (timer !== undefined)
                    clearTimeout(timer);
                this.pushWaiters.delete(key);
                const batch = this.pushed.get(key);
                this.pushed.delete(key);
                if (signal?.aborted) {
                    reject(signal.reason);
                    return;
                }
                if (batch !== undefined) {
                    this.lastPushed.set(key, batch);
                    resolve(batch.diagnostics);
                    return;
                }
                // Push-only servers (tsls included) do not republish for an unchanged
                // document, so the second call used to resolve to []. Reuse the last
                // batch only when the text it was produced from is still the same.
                const cached = this.lastPushed.get(key);
                resolve(cached !== undefined && cached.text === text ? cached.diagnostics : []);
            };
            // A push resets the quiet period: keep collecting while the server is still talking.
            const onPush = () => {
                if (timer !== undefined)
                    clearTimeout(timer);
                timer = setTimeout(takeLatest, this.spec.diagnosticsDebounceMs);
                timer.unref?.();
            };
            if (fused.aborted) {
                takeLatest();
                return;
            }
            this.pushWaiters.set(key, onPush);
            fused.addEventListener('abort', takeLatest, { once: true });
        });
    }
    onNotification(method, params) {
        if (method !== 'textDocument/publishDiagnostics')
            return;
        const record = params;
        if (record === null || typeof record !== 'object' || typeof record.uri !== 'string')
            return;
        let diagnostics;
        try {
            const codec = this.openedDocs.get(normalizeFileUri(record.uri))?.codec;
            const decode = codec === undefined
                ? undefined
                : (position) => codec.decode(position, this.positionEncoding);
            diagnostics = normalizeDiagnostics(record.diagnostics, decode);
        }
        catch {
            // A malformed push batch cannot fail a notification path; the next pull/settle sees no batch.
            return;
        }
        // The latest batch replaces any earlier one for the same URI, per LSP push semantics. URIs are
        // compared normalized: servers re-spell file URIs (tsserver pushes lowercase percent-encoded
        // drive letters), so a raw string comparison would miss every batch.
        const key = normalizeFileUri(record.uri);
        const text = this.openedDocs.get(key)?.text;
        this.pushed.set(key, { text, diagnostics });
        const waiter = this.pushWaiters.get(key);
        if (waiter !== undefined)
            waiter();
    }
    answerServerRequest(method, params) {
        if (method === 'workspace/configuration') {
            // Answer each requested item with its section value when the static configuration object
            // carries the section; otherwise fall back to the one static value for every item.
            const record = params;
            const items = Array.isArray(record?.items) ? record.items : [];
            return Promise.resolve(items.map(item => configurationSectionValue(this.spec.configuration, item)));
        }
        if (LIFECYCLE_NOOP_METHODS.has(method)) {
            // Accept lifecycle bookkeeping requests with an empty result; we register nothing dynamic.
            return Promise.resolve(null);
        }
        if (method === 'workspace/applyEdit') {
            // This client never applies server edits; the tool applies them through ctx.fs write-intent.
            return Promise.reject(new Error('workspace/applyEdit is not permitted by this client'));
        }
        return Promise.reject(new Error(`unsupported server request: ${method}`));
    }
    /** Reject queued work, attempt graceful shutdown, then escalate to tree termination. */
    async dispose() {
        await this.startTeardown();
    }
    /**
     * Publish disposal once and make every caller await the same quiescence boundary. A rejected
     * teardown clears the cached promise so a later dispose (the client's reap loop) can retry
     * instead of returning the same permanent rejection.
     */
    startTeardown() {
        this.disposed = true;
        this.teardownPromise ??= this.tearDown().catch((error) => {
            this.teardownPromise = undefined;
            throw error;
        });
        return this.teardownPromise;
    }
    async tearDown() {
        const budget = AbortSignal.timeout(this.spec.shutdownTimeoutMs);
        try {
            await abortable(this.connection.request('shutdown', null), budget);
            await abortable(this.connection.notify('exit', null), budget);
            await abortable(this.connection.closed, budget);
        }
        catch {
            // Graceful shutdown failed or timed out; process-tree cleanup below remains authoritative.
        }
        this.connection.terminate();
        // Quiescence is the postcondition disposal owes its callers, but the provider can lose its
        // range observation and never settle either wait. Bound both so a leak is reported as a
        // failed teardown (and retained by the reap queue) instead of hanging fiber disposal forever.
        const exitBudget = this.spec.killGraceMs + this.spec.shutdownTimeoutMs;
        try {
            const [exited] = await Promise.all([
                this.connection.waitForProcessTreeExit(AbortSignal.timeout(exitBudget)),
                abortable(this.connection.closed, AbortSignal.timeout(exitBudget)),
            ]);
            if (!exited)
                throw new Error('process tree did not exit');
        }
        catch (error) {
            throw new Error(`lsp-actions: process tree did not confirm exit within ${exitBudget}ms: ${messageOf(error)}`);
        }
    }
}
/** Mark a settled request in the cancel-grace race (either outcome means the request finished). */
function markSettled() {
    return true;
}
/** Whether a failure is the structured handshake failure the client retries once. */
function isHandshakeServerFailure(error) {
    return error instanceof LspActionError && error.code === 'LSP_ACTION_SERVER_FAILED';
}
/** Project one normalized diagnostic back to its wire form (for code-action contexts). */
function wireDiagnostic(diagnostic, encode) {
    const range = encode === undefined
        ? diagnostic.range
        : { start: encode(diagnostic.range.start), end: encode(diagnostic.range.end) };
    return {
        range,
        severity: diagnostic.severity,
        message: diagnostic.message,
        ...diagnostic.source === undefined ? {} : { source: diagnostic.source },
        ...diagnostic.code === undefined ? {} : { code: diagnostic.code },
    };
}
/** The range of the first diagnostic, for a code-action request without an explicit range. */
function firstDiagnosticRange(diagnostics) {
    return diagnostics[0]?.range;
}
/** The whole-document range, for a code-action request with neither a range nor diagnostics. */
function documentRange(text) {
    const lines = text.split('\n');
    return {
        start: { line: 0, character: 0 },
        end: { line: lines.length - 1, character: (lines[lines.length - 1] ?? '').length },
    };
}
/**
 * The configuration answer for one `workspace/configuration` item: the named section when the
 * static configuration is a plain object carrying it, else the whole static value (the tolerant
 * fallback servers like tsls accept).
 */
function configurationSectionValue(configuration, item) {
    const section = item?.section;
    if (typeof section === 'string'
        && configuration !== null
        && typeof configuration === 'object'
        && !Array.isArray(configuration)) {
        const value = configuration[section];
        if (value !== undefined)
            return value;
    }
    return configuration;
}
/** Wrap a server-side failure with its stderr tail, keeping the structured failure code. */
function serverFailed(error, stderrTail) {
    const message = error instanceof Error ? error.message : String(error);
    const tail = stderrTail.trim();
    return new LspActionError(tail === '' ? `language server failed: ${message}` : `language server failed: ${message}; stderr: ${tail}`, 'LSP_ACTION_SERVER_FAILED', { cause: error });
}
/** Coerce an unknown thrown value to a message string. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Server→client request methods this client acknowledges with an empty result. */
const LIFECYCLE_NOOP_METHODS = new Set([
    'window/workDoneProgress/create',
    'client/registerCapability',
    'client/unregisterCapability',
]);
/**
 * The client capabilities advertised at `initialize`: UTF-16 positions, workspace folders and
 * configuration, completion, and published diagnostics. No dynamic registration; the server's
 * returned capabilities are authoritative.
 */
const CLIENT_CAPABILITIES = {
    general: { positionEncodings: ['utf-16'] },
    workspace: { workspaceFolders: true, configuration: true },
    textDocument: {
        synchronization: { dynamicRegistration: false },
        completion: {},
        publishDiagnostics: { relatedInformation: false },
    },
};
//# sourceMappingURL=client.js.map
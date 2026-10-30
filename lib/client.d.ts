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
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionSpawner } from './connection.js';
import type { HostSource } from './host.js';
import type { WirePositionEncoding } from './translate.js';
import type { LspCodeActionsResult, LspCompletionResult, LspDiagnosticsResult, LspEditsResult, LspInlayHintsResult, LspPosition, LspRange, LspRenameResult, LspSignaturesResult, LspSymbolsResult, LspTextEdit } from './vocabulary.js';
import type { ResolvedServer } from './servers.js';
/** One action call as the client receives it: everything the tool already knows. */
export interface ActionRequest {
    /** The source file (relative to `workspaceRoot` or absolute). */
    readonly filePath: string;
    /** The workspace root the client resolves against and indexes. */
    readonly workspaceRoot: string;
    /** The pre-read, byte-capped source the didOpen synchronizes with the server. */
    readonly source: HostSource;
    /** The LSP language id for `filePath`, from the routed server's extension mapping. */
    readonly languageId: string;
    /** The cursor position, for completion and signature help. */
    readonly position?: LspPosition;
    /** The formatting/code-action/inlay-hint range, when the caller narrowed it. */
    readonly range?: LspRange;
    /** CodeActionKind filters for code actions (e.g. `quickfix`). */
    readonly onlyKinds?: readonly string[];
}
/** Everything one instance needs beyond the connection spec. */
interface InstanceSpec {
    readonly executable: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly workspaceUri: string;
    readonly env: Record<string, string>;
    readonly configuration: unknown;
    readonly initializationOptions: unknown;
    readonly formattingOptions: unknown;
    readonly maxMessageBytes: number;
    readonly maxStderrBytes: number;
    readonly killGraceMs: number;
    readonly shutdownTimeoutMs: number;
    readonly diagnosticsSettleMs: number;
    readonly diagnosticsDebounceMs: number;
    readonly idleTimeoutMs: number;
}
/** The raw rename result the instance produces: grouped wire edits still in the server's encoding. */
interface RawRenameResult {
    readonly kind: 'rename';
    readonly edits: Record<string, LspTextEdit[]>;
    readonly encoding: WirePositionEncoding;
}
/**
 * Pooled minimal LSP action client. Instances are single-flight per canonical workspace and are
 * evicted as soon as they die; every await observes cancellation.
 */
export declare class LspActionClient {
    private readonly subprocess;
    private readonly fs;
    /** Byte cap for documents the rename flow reads back to decode cross-file positions. */
    private readonly maxDocumentBytes;
    /** Host logger for teardown failures that used to be swallowed. */
    private readonly warn;
    private readonly instances;
    /** Evicted instances whose teardown is still settling or retrying. */
    private readonly reaps;
    /** Instances whose three reaps failed: the tree may still be alive, so keep the last reference. */
    private readonly failedReaps;
    private readonly lifetime;
    private disposed;
    constructor(subprocess: Context['subprocess'], fs: FileSystem, 
    /** Byte cap for documents the rename flow reads back to decode cross-file positions. */
    maxDocumentBytes?: number, 
    /** Host logger for teardown failures that used to be swallowed. */
    warn?: (message: string) => void);
    /** Spawn one connection through the subprocess seam (the real provider at runtime). */
    private readonly spawner;
    /**
     * Run the diagnostics action through the routed server.
     * @param server - the routed server entry.
     * @param request - the action request.
     * @param signal - optional cancellation.
     * @returns the normalized diagnostics result.
     */
    diagnostics(server: ResolvedServer, request: ActionRequest, signal?: AbortSignal): Promise<LspDiagnosticsResult>;
    /**
     * Run the formatting action through the routed server; the client only RETURNS edits, it never
     * writes files — the tool applies them through `ctx.fs` write-intent.
     * @param server - the routed server entry.
     * @param request - the action request (carries the optional range).
     * @param signal - optional cancellation.
     * @returns the normalized edits result.
     */
    formatDocument(server: ResolvedServer, request: ActionRequest, signal?: AbortSignal): Promise<LspEditsResult>;
    /**
     * Run the completion action through the routed server.
     * @param server - the routed server entry.
     * @param request - the action request (carries the cursor position).
     * @param signal - optional cancellation.
     * @returns the normalized completion result.
     */
    completion(server: ResolvedServer, request: ActionRequest, signal?: AbortSignal): Promise<LspCompletionResult>;
    /**
     * Run the code actions action through the routed server; the client only REPORTS edits and
     * commands, it never applies them — applying one is the model's own write/edit decision.
     * @param server - the routed server entry.
     * @param request - the action request (carries the optional range and kind filters).
     * @param signal - optional cancellation.
     * @returns the normalized code actions result.
     */
    codeActions(server: ResolvedServer, request: ActionRequest, signal?: AbortSignal): Promise<LspCodeActionsResult>;
    /**
     * Run a workspace-wide symbol search through the routed server (no document involved).
     * @param server - the routed server entry.
     * @param workspaceRoot - the workspace to search.
     * @param query - the symbol name query.
     * @param signal - optional cancellation.
     * @returns the normalized symbols result.
     */
    workspaceSymbols(server: ResolvedServer, workspaceRoot: string, query: string, signal?: AbortSignal): Promise<LspSymbolsResult>;
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
    workspaceSymbolsInDocument(server: ResolvedServer, request: ActionRequest, query: string, signal?: AbortSignal): Promise<LspSymbolsResult>;
    /**
     * Run a document symbol listing through the routed server.
     * @param server - the routed server entry.
     * @param request - the action request.
     * @param signal - optional cancellation.
     * @returns the normalized symbols result.
     */
    documentSymbols(server: ResolvedServer, request: ActionRequest, signal?: AbortSignal): Promise<LspSymbolsResult>;
    /**
     * Run signature help through the routed server.
     * @param server - the routed server entry.
     * @param request - the action request (carries the cursor position).
     * @param signal - optional cancellation.
     * @returns the normalized signatures result.
     */
    signatureHelp(server: ResolvedServer, request: ActionRequest, signal?: AbortSignal): Promise<LspSignaturesResult>;
    /**
     * Run inlay hints through the routed server.
     * @param server - the routed server entry.
     * @param request - the action request (carries the optional range).
     * @param signal - optional cancellation.
     * @returns the normalized inlay hints result.
     */
    inlayHints(server: ResolvedServer, request: ActionRequest, signal?: AbortSignal): Promise<LspInlayHintsResult>;
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
    rename(server: ResolvedServer, request: ActionRequest, newName: string, signal?: AbortSignal): Promise<LspRenameResult>;
    /** Disposed flag through a method so an await cannot narrow it to a literal. */
    private isDisposed;
    /** Reject work that cannot publish or use a client-owned instance. */
    private assertActive;
    /** Fuse caller cancellation with client disposal for every filesystem and protocol await. */
    private querySignal;
    private run;
    /** The document-free sibling of {@link run}: serves workspace-scoped actions (symbol search). */
    private runBare;
    /** Serialize and run one action attempt pair (retry-once included) for a canonical workspace. */
    private runScoped;
    /** One attempt: publish/borrow the instance, run the action, evict the dead, arm the idle timer. */
    private runOnce;
    /**
     * Dispose one evicted instance with bounded retries, keeping it referenced until teardown
     * settles. A rejected {@link LspActionInstance.startTeardown} used to be swallowed here, which
     * both hid the failure and left the process tree with no owner; the retry makes it observable
     * and gives a transient provider-observation failure another chance.
     * @param instance - the evicted instance to tear down.
     * @returns the settling teardown promise (never rejects unobserved).
     */
    private reap;
    /** Idle-eviction timers per workspace key; a use resets, a fire disposes and evicts. */
    private readonly idleTimers;
    private armIdleTimer;
    private clearIdleTimer;
    /** Serialize one complete action lifecycle per canonical workspace. */
    private enqueue;
    /** The serialization tail for one workspace key (per-instance queues live on the instance). */
    private tails;
    private tailFor;
    private setTail;
    /** Return or synchronously publish the one instance for a canonical workspace. */
    private instanceFor;
    /** Dispose every live instance, drain pending reaps, and block further actions. */
    disposeAll(): Promise<void>;
    /**
     * Decode one rename's grouped wire edits into utf-16, per document: the origin document uses
     * the source text the server saw; any other document is read back for its codec (utf-16 servers
     * need no read — their positions are already utf-16). An unreadable or out-of-workspace target
     * on a non-utf-16 server is a structured conflict, never silently mis-decoded positions.
     */
    private decodeRenameEdits;
}
/** One initialized server process: handshake, serialized queue, and bounded teardown. */
export declare class LspActionInstance {
    private readonly spec;
    private readonly connection;
    private capabilities;
    private positionEncoding;
    private queue;
    private disposed;
    private teardownPromise;
    private processClosed;
    /** True when the handshake (initialize) ended in failure — the one retryable server state. */
    private handshakeFailed;
    private readonly ready;
    /** Latest pushed diagnostic batch per document URI (push-only servers). */
    private readonly pushed;
    /** Last batch handed to a caller, reused when the document text is unchanged. */
    private readonly lastPushed;
    private readonly pushWaiters;
    /** Per-document text (and codec) for the resident open document, for push-path conversion. */
    private readonly openedDocs;
    /**
     * Resident open documents per URI: kept open for the instance's lifetime so project-based
     * servers (tsls) keep serving signatureHelp and document-free workspace/symbol. didOpen runs
     * once per URI; a later request with changed source sends a full-document didChange.
     */
    private readonly residentDocs;
    constructor(spec: InstanceSpec, spawner: ConnectionSpawner);
    /** Synchronous liveness check: true once the process closed or the instance was disposed. */
    get dead(): boolean;
    private initialize;
    /** Await the handshake, tearing the instance down when it ends in failure. */
    private readyGate;
    /** Run one action through the serialized queue. */
    private runSerialized;
    diagnostics(request: ActionRequest, signal?: AbortSignal): Promise<LspDiagnosticsResult>;
    formatDocument(request: ActionRequest, signal?: AbortSignal): Promise<LspEditsResult>;
    completion(request: ActionRequest, signal?: AbortSignal): Promise<LspCompletionResult>;
    codeActions(request: ActionRequest, signal?: AbortSignal): Promise<LspCodeActionsResult>;
    workspaceSymbols(query: string, signal?: AbortSignal): Promise<LspSymbolsResult>;
    /** The document-open variant of {@link workspaceSymbols}, for project-based servers. */
    workspaceSymbolsInDocument(request: ActionRequest, query: string, signal?: AbortSignal): Promise<LspSymbolsResult>;
    documentSymbols(request: ActionRequest, signal?: AbortSignal): Promise<LspSymbolsResult>;
    signatureHelp(request: ActionRequest, signal?: AbortSignal): Promise<LspSignaturesResult>;
    inlayHints(request: ActionRequest, signal?: AbortSignal): Promise<LspInlayHintsResult>;
    /**
     * Run a rename through the server and return the grouped wire edits (positions still in the
     * server's encoding; the client decodes them per document). `textDocument/prepareRename` runs
     * first as advisory validation: a `null` answer is the structured no-symbol failure, while a
     * server without the method (or that rejects it on a transient document) still serves rename.
     */
    rename(request: ActionRequest, newName: string, signal?: AbortSignal): Promise<RawRenameResult>;
    /** Collect this document's diagnostics for a code-action context (pull or push-settle). */
    private collectDiagnostics;
    /** The codec for one document, or undefined when the server speaks utf-16. */
    private codecFor;
    /** Encode a utf-16 cursor position into the server's encoding. */
    private encodePosition;
    /** Encode a utf-16 range into the server's encoding. */
    private encodeRange;
    /** A result-side position decoder for one document, or undefined for utf-16 servers. */
    private decodeFor;
    /** A position encoder for one document, or undefined for utf-16 servers. */
    private encodeAll;
    private requiredCapabilities;
    /** Reject an action the server did not advertise, or a sync mode this client cannot serve. */
    private assertSupports;
    /**
     * Run `body` inside the resident didOpen→(didChange) document lifecycle: a document is opened
     * once per instance and stays open (no per-request didClose), so project-based servers (tsls)
     * keep serving signatureHelp and document-free workspace/symbol. A later request with changed
     * source sends a full-document didChange; process shutdown closes every document.
     */
    private withDocument;
    /** Send a request, racing it against abort with a bounded cancel grace. */
    private sendRequest;
    /**
     * Collect push-only diagnostics for one URI: the LATEST batch wins. Batches replace each other
     * (per LSP push semantics) while the settle window is open, and each push resets a short quiet
     * period (`diagnosticsDebounceMs`), so a server that publishes partial then complete batches
     * yields the complete one; the settle deadline resolves whatever is latest (empty when nothing
     * arrived).
     */
    private waitForPushedDiagnostics;
    private onNotification;
    private answerServerRequest;
    /** Reject queued work, attempt graceful shutdown, then escalate to tree termination. */
    dispose(): Promise<void>;
    /**
     * Publish disposal once and make every caller await the same quiescence boundary. A rejected
     * teardown clears the cached promise so a later dispose (the client's reap loop) can retry
     * instead of returning the same permanent rejection.
     */
    private startTeardown;
    private tearDown;
}
export {};
//# sourceMappingURL=client.d.ts.map
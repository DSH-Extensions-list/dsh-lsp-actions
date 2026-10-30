/**
 * A JSON-RPC endpoint over one language server spawned through the subprocess capability. Owns id
 * correlation, outbound requests/notifications, inbound server→client requests (answering
 * `workspace/configuration` from static config and accepting lifecycle bookkeeping), notification
 * observers (the diagnostics push path), and fail-fast framing errors. Terminates through the
 * subprocess handle's tree-scoped escalation.
 * @module dsh-lsp-actions/connection
 */
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
/** How to launch the server and answer its configuration requests. */
export interface ConnectionSpec {
    /** The resolved absolute executable path (no shell). */
    readonly command: string;
    /** Arguments passed to the executable. */
    readonly args: readonly string[];
    /** The child's working directory (the canonical workspace). */
    readonly cwd: string;
    /** Explicit child environment overrides; the subprocess provider owns its ambient scrub. */
    readonly env: Record<string, string>;
    /** Largest single framed message accepted from the server. */
    readonly maxMessageBytes: number;
    /** Largest stderr tail retained for diagnostics. */
    readonly maxStderrBytes: number;
    /** The subprocess spec's `graceMs` for the terminate escalation. */
    readonly killGraceMs: number;
    /** Static answer to every `workspace/configuration` item. */
    readonly configuration: unknown;
}
/** Spawn one subprocess for this connection (the client passes `ctx.subprocess.spawn`). */
export type ConnectionSpawner = (spec: SubprocessSpawnSpec) => SubprocessHandle;
/** A JSON-RPC error response from the language server, carrying the wire error code. */
export declare class LspRpcError extends Error {
    readonly code: number;
    constructor(message: string, code: number);
}
/**
 * A live JSON-RPC endpoint bound to one child process. Requests reject immediately after the
 * process closes or the protocol stream fails, so no caller can hang on a dead server.
 */
export declare class LspConnection {
    private readonly onServerRequest;
    private readonly handle;
    private readonly stdin;
    private readonly decoder;
    private readonly pending;
    private readonly notificationHandlers;
    private nextId;
    private closeReason;
    /** Resolves once the process has fully exited and every pending request was rejected. */
    readonly closed: Promise<void>;
    /**
     * @param spec - how to launch the server and answer its configuration requests.
     * @param spawner - the subprocess seam's spawn (the client passes `ctx.subprocess.spawn`).
     * @param onServerRequest - answers a server→client request; rejects to send an error response.
     */
    constructor(spec: ConnectionSpec, spawner: ConnectionSpawner, onServerRequest: (method: string, params: unknown) => Promise<unknown>);
    /** The retained stderr tail, for diagnostics on a failed server. */
    get stderrTail(): string;
    /** Whether the transport has failed even if the close event has not arrived yet. */
    get failed(): boolean;
    /**
     * Observe an inbound server→client notification (e.g. `textDocument/publishDiagnostics`).
     * @param handler - invoked synchronously per notification, in registration order.
     */
    onNotification(handler: (method: string, params: unknown) => void): void;
    /**
     * Send a request and await its result.
     * @param method - the JSON-RPC method.
     * @param params - the request params.
     * @returns the response result; rejects on an error response, write failure, or close.
     */
    request(method: string, params: unknown): Promise<unknown>;
    /**
     * Send a notification (no id, no response).
     * @param method - the JSON-RPC method.
     * @param params - the notification params.
     * @returns a promise that settles when the framed notification has been written.
     */
    notify(method: string, params: unknown): Promise<void>;
    /**
     * Send a `$/cancelRequest` for an in-flight request id (best-effort; ignores write failure).
     * @param requestId - the numeric id of the request to cancel.
     */
    cancel(requestId: number): void;
    /** The id the NEXT `request()` will use, so the client can pre-arm a cancel. */
    peekNextId(): number;
    /** Terminate the server's process tree (the seam's SIGTERM→grace→SIGKILL escalation; idempotent). */
    terminate(): void;
    /** Wait until the owned process tree has exited. */
    waitForProcessTreeExit(signal?: AbortSignal): Promise<boolean>;
    private onStdout;
    private dispatch;
    private handleServerRequest;
    private handleResponse;
    private write;
    /** The exit-close error message, appending the retained stderr tail when the server wrote any. */
    private exitMessage;
    private fail;
    private failAll;
}
//# sourceMappingURL=connection.d.ts.map
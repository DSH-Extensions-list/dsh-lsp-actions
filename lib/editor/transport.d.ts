/**
 * The editor protocol's JSON-RPC transport: newline-delimited JSON-RPC 2.0 over byte streams,
 * wire-compatible with the official DeepSeek Harness SDK/ACP transports (one JSON object per line,
 * the same request/response/notification frame rules and error codes). A client that can speak the
 * official SDK wire can speak this wire unchanged — only the method vocabulary differs.
 * @module dsh-lsp-actions/editor/transport
 */
import type { Readable, Writable } from 'node:stream';
/** A request handler: resolves to the response `result`, rejects into a `-32603` error frame. */
export type EditorRequestHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;
/**
 * A minimal JSON-RPC 2.0 line endpoint over caller-owned streams. Malformed lines are ignored;
 * unknown methods answer `-32601`; handler failures answer `-32603`; notifications without a
 * handler are dropped. {@link start} attaches listeners and {@link close} detaches them.
 */
export declare class EditorJsonRpcTransport {
    private readonly input;
    private readonly output;
    private buffer;
    private readonly decoder;
    private started;
    private requestHandler;
    private notificationHandler;
    constructor(input: Readable, output: Writable);
    /** Attach the input listeners and begin reading frames. Idempotent. */
    start(): void;
    /** Detach listeners. Safe before {@link start}. */
    close(): void;
    /** Install the request handler, replacing any prior handler. */
    onRequest(handler: EditorRequestHandler): void;
    /** Install the notification handler, replacing any prior handler. */
    onNotification(handler: (method: string, params: Record<string, unknown>) => void): void;
    /** Send one server→client notification. */
    notify(method: string, params: object): void;
    /** Wait for the output stream to flush prior writes. */
    flush(): Promise<void>;
    private readonly onData;
    private drainLines;
    private readonly onInputError;
    private readonly onInputEnd;
    private handleLine;
    private handleRequest;
    private writeError;
    private write;
}
/** A protocol-level failure that maps to a specific JSON-RPC error code. */
export declare class EditorProtocolError extends Error {
    readonly jsonRpcCode: number;
    constructor(jsonRpcCode: number, message: string);
}
/** A fresh, transport-unique request id (used when a peer frame carries none). */
export declare function freshRequestId(): string;
//# sourceMappingURL=transport.d.ts.map
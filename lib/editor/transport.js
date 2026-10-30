/**
 * The editor protocol's JSON-RPC transport: newline-delimited JSON-RPC 2.0 over byte streams,
 * wire-compatible with the official DeepSeek Harness SDK/ACP transports (one JSON object per line,
 * the same request/response/notification frame rules and error codes). A client that can speak the
 * official SDK wire can speak this wire unchanged — only the method vocabulary differs.
 * @module dsh-lsp-actions/editor/transport
 */
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
/**
 * A minimal JSON-RPC 2.0 line endpoint over caller-owned streams. Malformed lines are ignored;
 * unknown methods answer `-32601`; handler failures answer `-32603`; notifications without a
 * handler are dropped. {@link start} attaches listeners and {@link close} detaches them.
 */
export class EditorJsonRpcTransport {
    input;
    output;
    buffer = '';
    decoder = new StringDecoder('utf8');
    started = false;
    requestHandler;
    notificationHandler;
    constructor(input, output) {
        this.input = input;
        this.output = output;
    }
    /** Attach the input listeners and begin reading frames. Idempotent. */
    start() {
        if (this.started)
            return;
        this.started = true;
        this.input.on('data', this.onData);
        this.input.on('error', this.onInputError);
        this.input.on('end', this.onInputEnd);
    }
    /** Detach listeners. Safe before {@link start}. */
    close() {
        this.input.off('data', this.onData);
        this.input.off('error', this.onInputError);
        this.input.off('end', this.onInputEnd);
    }
    /** Install the request handler, replacing any prior handler. */
    onRequest(handler) {
        this.requestHandler = handler;
    }
    /** Install the notification handler, replacing any prior handler. */
    onNotification(handler) {
        this.notificationHandler = handler;
    }
    /** Send one server→client notification. */
    notify(method, params) {
        this.write({ jsonrpc: '2.0', method, params });
    }
    /** Wait for the output stream to flush prior writes. */
    flush() {
        return new Promise((resolve, reject) => {
            this.output.write('', error => error === null || error === undefined ? resolve() : reject(error));
        });
    }
    onData = (chunk) => {
        this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
        this.drainLines();
    };
    drainLines() {
        for (;;) {
            const newline = this.buffer.indexOf('\n');
            if (newline < 0)
                break;
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            if (!line)
                continue;
            void this.handleLine(line);
        }
    }
    onInputError = () => { };
    onInputEnd = () => {
        this.buffer += this.decoder.end();
        this.drainLines();
    };
    async handleLine(line) {
        let message;
        try {
            message = JSON.parse(line);
        }
        catch {
            return;
        }
        if (message === null || typeof message !== 'object' || Array.isArray(message))
            return;
        const frame = message;
        const id = frame.id;
        const method = frame.method;
        if ((typeof id === 'string' || typeof id === 'number') && typeof method === 'string') {
            await this.handleRequest(id, method, normalizeParams(frame.params));
            return;
        }
        if (typeof method === 'string') {
            this.notificationHandler?.(method, normalizeParams(frame.params));
        }
    }
    async handleRequest(id, method, params) {
        const handler = this.requestHandler;
        if (handler === undefined) {
            this.writeError(id, -32601, `method not found: ${method}`);
            return;
        }
        try {
            const result = await handler(method, params);
            this.write({ jsonrpc: '2.0', id, result });
        }
        catch (error) {
            const code = error instanceof EditorProtocolError ? error.jsonRpcCode : -32603;
            this.writeError(id, code, error instanceof Error ? error.message : String(error));
        }
    }
    writeError(id, code, message) {
        this.write({ jsonrpc: '2.0', id, error: { code, message } });
    }
    write(message) {
        this.output.write(`${JSON.stringify(message)}\n`);
    }
}
/** A protocol-level failure that maps to a specific JSON-RPC error code. */
export class EditorProtocolError extends Error {
    jsonRpcCode;
    constructor(jsonRpcCode, message) {
        super(message);
        this.jsonRpcCode = jsonRpcCode;
        this.name = 'EditorProtocolError';
    }
}
/** Normalize JSON-RPC params to a plain object (arrays and scalars collapse to `{}`). */
function normalizeParams(params) {
    return params !== null && typeof params === 'object' && !Array.isArray(params)
        ? params
        : {};
}
/** A fresh, transport-unique request id (used when a peer frame carries none). */
export function freshRequestId() {
    return randomUUID();
}
//# sourceMappingURL=transport.js.map
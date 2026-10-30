/**
 * A JSON-RPC endpoint over one language server spawned through the subprocess capability. Owns id
 * correlation, outbound requests/notifications, inbound server→client requests (answering
 * `workspace/configuration` from static config and accepting lifecycle bookkeeping), notification
 * observers (the diagnostics push path), and fail-fast framing errors. Terminates through the
 * subprocess handle's tree-scoped escalation.
 * @module dsh-lsp-actions/connection
 */
import { encodeMessage, MessageDecoder } from "./framing.js";
const writeConnectionMessage = (stdin, message, done) => {
    stdin.write(encodeMessage(message), done);
};
/** A JSON-RPC error response from the language server, carrying the wire error code. */
export class LspRpcError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'LspRpcError';
    }
}
/**
 * A live JSON-RPC endpoint bound to one child process. Requests reject immediately after the
 * process closes or the protocol stream fails, so no caller can hang on a dead server.
 */
export class LspConnection {
    onServerRequest;
    handle;
    stdin;
    decoder;
    pending = new Map();
    notificationHandlers = new Set();
    nextId = 1;
    closeReason;
    /** Resolves once the process has fully exited and every pending request was rejected. */
    closed;
    /**
     * @param spec - how to launch the server and answer its configuration requests.
     * @param spawner - the subprocess seam's spawn (the client passes `ctx.subprocess.spawn`).
     * @param onServerRequest - answers a server→client request; rejects to send an error response.
     */
    constructor(spec, spawner, onServerRequest) {
        this.onServerRequest = onServerRequest;
        this.decoder = new MessageDecoder(spec.maxMessageBytes);
        this.handle = spawner({
            argv: [spec.command, ...spec.args],
            cwd: spec.cwd,
            stdio: {
                stdin: 'pipe',
                stdout: 'pipe',
                stderr: { maxBytes: spec.maxStderrBytes },
            },
            graceMs: spec.killGraceMs,
            env: spec.env,
        });
        if (this.handle.stdin === undefined || this.handle.stdout === undefined) {
            // The spawn already happened; terminate before throwing so the provider does not leak a
            // runner with no instance to own it.
            try {
                this.handle.terminate();
            }
            catch {
                // Best-effort: the missing stream is the primary failure.
            }
            throw new Error('lsp-actions: subprocess implementation dropped a piped protocol stream');
        }
        this.stdin = this.handle.stdin;
        this.closed = new Promise((resolve) => {
            const close = () => {
                const reason = this.closeReason ?? new Error(this.exitMessage());
                this.closeReason = reason;
                this.failAll(reason);
                resolve();
            };
            this.handle.done.then(close, (error) => {
                // A spawn-level failure never produces a close event; the rejection is the close boundary.
                this.fail(asError(error));
                close();
            });
        });
        this.stdin.on('error', (error) => { this.fail(error); });
        this.handle.stdout.on('data', (chunk) => { this.onStdout(chunk); });
    }
    /** The retained stderr tail, for diagnostics on a failed server. */
    get stderrTail() {
        return this.handle.collected.stderr?.readFrom(0).text ?? '';
    }
    /** Whether the transport has failed even if the close event has not arrived yet. */
    get failed() {
        return this.closeReason !== undefined;
    }
    /**
     * Observe an inbound server→client notification (e.g. `textDocument/publishDiagnostics`).
     * @param handler - invoked synchronously per notification, in registration order.
     */
    onNotification(handler) {
        this.notificationHandlers.add(handler);
    }
    /**
     * Send a request and await its result.
     * @param method - the JSON-RPC method.
     * @param params - the request params.
     * @returns the response result; rejects on an error response, write failure, or close.
     */
    request(method, params) {
        const id = this.nextId++;
        const promise = new Promise((resolve, reject) => {
            if (this.closeReason !== undefined) {
                reject(this.closeReason);
                return;
            }
            this.pending.set(id, { resolve, reject });
            void this.write({ jsonrpc: '2.0', id, method, params }).catch(() => { });
        });
        // A caller that stops awaiting (e.g. an aborted query) leaves this promise to reject at close;
        // this handler keeps that rejection from surfacing as an unhandled rejection.
        promise.catch(() => { });
        return promise;
    }
    /**
     * Send a notification (no id, no response).
     * @param method - the JSON-RPC method.
     * @param params - the notification params.
     * @returns a promise that settles when the framed notification has been written.
     */
    notify(method, params) {
        return this.write({ jsonrpc: '2.0', method, params });
    }
    /**
     * Send a `$/cancelRequest` for an in-flight request id (best-effort; ignores write failure).
     * @param requestId - the numeric id of the request to cancel.
     */
    cancel(requestId) {
        void this.write({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id: requestId } }).catch(() => { });
    }
    /** The id the NEXT `request()` will use, so the client can pre-arm a cancel. */
    peekNextId() {
        return this.nextId;
    }
    /** Terminate the server's process tree (the seam's SIGTERM→grace→SIGKILL escalation; idempotent). */
    terminate() {
        this.handle.terminate();
    }
    /** Wait until the owned process tree has exited. */
    async waitForProcessTreeExit(signal) {
        return await this.handle.waitForExit(signal);
    }
    onStdout(chunk) {
        let messages;
        try {
            messages = this.decoder.push(chunk);
        }
        catch (error) {
            this.fail(asError(error));
            this.handle.terminate();
            return;
        }
        for (const message of messages)
            this.dispatch(message);
    }
    dispatch(message) {
        if (message === null || typeof message !== 'object')
            return;
        const frame = message;
        const id = frame.id;
        const method = frame.method;
        if (typeof method === 'string' && (typeof id === 'number' || typeof id === 'string')) {
            void this.handleServerRequest(id, method, frame.params).catch(() => { });
            return;
        }
        if (typeof method === 'string') {
            for (const handler of this.notificationHandlers)
                handler(method, frame.params);
            return;
        }
        if (typeof id === 'number')
            this.handleResponse(id, frame);
    }
    async handleServerRequest(id, method, params) {
        try {
            const result = await this.onServerRequest(method, params);
            await this.write({ jsonrpc: '2.0', id, result });
        }
        catch (error) {
            await this.write({ jsonrpc: '2.0', id, error: { code: -32601, message: asError(error).message } });
        }
    }
    handleResponse(id, frame) {
        const pending = this.pending.get(id);
        if (!pending)
            return;
        this.pending.delete(id);
        const error = frame.error;
        if (error !== null && typeof error === 'object') {
            const record = error;
            const message = typeof record.message === 'string' ? record.message : 'LSP error response';
            pending.reject(new LspRpcError(message, typeof record.code === 'number' ? record.code : -32603));
            return;
        }
        pending.resolve(frame.result);
    }
    write(message) {
        if (this.closeReason !== undefined)
            return Promise.reject(this.closeReason);
        return new Promise((resolve, reject) => {
            const done = (error) => {
                if (error === undefined || error === null) {
                    resolve();
                    return;
                }
                this.fail(error);
                reject(error);
            };
            try {
                writeConnectionMessage(this.stdin, message, done);
            }
            catch (error) {
                const failure = asError(error);
                this.fail(failure);
                reject(failure);
            }
        });
    }
    /** The exit-close error message, appending the retained stderr tail when the server wrote any. */
    exitMessage() {
        const tail = this.stderrTail.trim();
        return tail === '' ? 'language server exited' : `language server exited; stderr: ${tail}`;
    }
    fail(error) {
        if (this.closeReason === undefined)
            this.closeReason = error;
        this.failAll(error);
    }
    failAll(error) {
        const waiting = [...this.pending.values()];
        this.pending.clear();
        for (const pending of waiting)
            pending.reject(error);
    }
}
/** Coerce an unknown thrown value to an `Error`. */
function asError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
//# sourceMappingURL=connection.js.map
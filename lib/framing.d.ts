/**
 * LSP stdio framing: `Content-Length`-prefixed JSON messages, encode side and incremental decode
 * side. The decoder retains only one incomplete message plus a bounded header window and rejects
 * oversize, malformed, or unterminated frames — the stream position is then unrecoverable, so the
 * connection fails fast instead of guessing.
 * @module dsh-lsp-actions/framing
 */
import { Buffer } from 'node:buffer';
/**
 * Encode one JSON-RPC message as a Content-Length framed buffer.
 * @param message - the JSON-serializable message.
 * @returns the framed bytes (header + UTF-8 body).
 */
export declare function encodeMessage(message: unknown): Buffer;
/**
 * Incremental LSP message decoder over an incoming byte stream.
 */
export declare class MessageDecoder {
    private readonly maxMessageBytes;
    private buffer;
    /**
     * @param maxMessageBytes - largest single framed message accepted; exceeding it is fatal.
     */
    constructor(maxMessageBytes: number);
    /**
     * Feed a chunk of bytes and drain every complete message.
     * @param chunk - newly received bytes.
     * @returns the decoded messages in delivery order.
     * @throws Error on an oversized frame, a missing Content-Length header, or invalid JSON.
     */
    push(chunk: Buffer): unknown[];
}
//# sourceMappingURL=framing.d.ts.map
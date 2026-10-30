/**
 * Pure protocol translation for the LSP action client: method names, capability gating, position
 * encoding negotiation, and the strict normalizers that turn untrusted wire payloads into the
 * action vocabulary. No I/O or process state — every function is a pure transform.
 * @module dsh-lsp-actions/translate
 */
import type { LspActionOperation, LspCodeActionItem, LspCompletionItem, LspDiagnostic, LspInlayHint, LspPosition, LspRange, LspSignature, LspSymbol, LspTextEdit } from './vocabulary.js';
/** The position encodings this client can serve; `utf-16` is the protocol default. */
export type WirePositionEncoding = 'utf-16' | 'utf-8' | 'utf-32';
/** Loose wire shape of a server's initialize capabilities; accessed by key. */
export type WireServerCapabilities = Record<string, unknown>;
/**
 * A position decoder for result normalizers: rewrites a server-side position into utf-16. Absent
 * for servers speaking utf-16 (the overwhelming default, and the encoding this client prefers).
 */
export type PositionDecoder = (position: LspPosition) => LspPosition;
/**
 * The `textDocument/*` request method for one action request.
 * @param request - operation plus the optional formatting range that selects rangeFormatting.
 * @returns the LSP request method name.
 */
export declare function requestMethod(request: {
    operation: LspActionOperation;
    range?: LspRange;
}): string;
/**
 * Whether the server advertises the requested action. Diagnostics is always servable: pull when the
 * server advertises a diagnostic provider, otherwise the open→push→settle path.
 * @param capabilities - the server's initialize capabilities.
 * @param operation - the action to check.
 * @param hasRange - whether a formatDocument request carries a range (selects the range provider).
 * @returns true when the capability is advertised.
 */
export declare function supportsAction(capabilities: WireServerCapabilities, operation: LspActionOperation, hasRange: boolean): boolean;
/**
 * Whether the server advertises pull diagnostics (`diagnosticProvider`), selecting the pull request
 * over the open→push→settle path.
 * @param capabilities - the server's initialize capabilities.
 * @returns true when `diagnosticProvider` is present.
 */
export declare function supportsPullDiagnostics(capabilities: WireServerCapabilities): boolean;
/**
 * Whether a `textDocumentSync` value permits the transient `didOpen`/`didClose` this client relies
 * on. The legacy enum form implies open/close for `Full` (1)/`Incremental` (2); the options form
 * requires an explicit `openClose: true`.
 * @param sync - the server's advertised `textDocumentSync`.
 * @returns true when transient open/close is supported.
 */
export declare function supportsTransientOpen(sync: unknown): boolean;
/**
 * Normalize the negotiated position encoding. An omitted encoding defaults to `utf-16`; the
 * client also serves `utf-8` and `utf-32` servers by converting positions through
 * {@link PositionCodec}. Anything else is a protocol error.
 * @param encoding - the server's advertised `positionEncoding`, if any.
 * @returns the negotiated encoding.
 * @throws Error for an encoding outside the supported set.
 */
export declare function negotiatePositionEncoding(encoding: unknown): WirePositionEncoding;
/**
 * Converts zero-based cursor coordinates between position encodings for one document. Line
 * numbers are encoding-independent (newlines are one unit in every encoding); only the character
 * offset INSIDE the line is converted, so the tables map each utf-16 code unit index to its
 * absolute byte (utf-8) or code-point (utf-32) offset, and conversions subtract the line's own
 * base offset on both sides.
 */
export declare class PositionCodec {
    private readonly utf8;
    private readonly utf32;
    private readonly lineStarts;
    private readonly length;
    /**
     * @param text - the document text positions are converted against.
     */
    constructor(text: string);
    /**
     * Convert a utf-16 position to the server's encoding. A character offset inside a surrogate
     * pair (never legal in any encoding) maps to the code point's own offset.
     * @param position - the utf-16 position.
     * @param encoding - the server's position encoding.
     * @returns the converted position (identical for `utf-16`).
     */
    encode(position: LspPosition, encoding: WirePositionEncoding): LspPosition;
    /**
     * Convert a server-side position back to utf-16. An offset inside a multi-unit code point
     * (illegal per protocol) maps to the code point's first utf-16 unit.
     * @param position - the position in the server's encoding.
     * @param encoding - the server's position encoding.
     * @returns the utf-16 position (identical for `utf-16`).
     */
    decode(position: LspPosition, encoding: WirePositionEncoding): LspPosition;
}
/**
 * Normalize a `textDocument/diagnostic` pull report (`{ kind, items }`) or a pushed `Diagnostic[]`
 * into the action vocabulary. `null`/`undefined` items normalize to an empty list.
 * @param payload - the raw diagnostic payload.
 * @param decode - optional server-side position decoder (utf-8/utf-32 servers).
 * @returns the normalized diagnostics.
 * @throws LspActionError LSP_ACTION_MALFORMED_RESPONSE for structurally invalid entries.
 */
export declare function normalizeDiagnostics(payload: unknown, decode?: PositionDecoder): LspDiagnostic[];
/**
 * Normalize a formatting result (`TextEdit[]` or `null`) into the action vocabulary.
 * @param payload - the raw `textDocument/formatting|rangeFormatting` result.
 * @param decode - optional server-side position decoder (utf-8/utf-32 servers).
 * @returns the normalized edits (empty for `null`).
 * @throws LspActionError LSP_ACTION_MALFORMED_RESPONSE for structurally invalid entries.
 */
export declare function normalizeEdits(payload: unknown, decode?: PositionDecoder): LspTextEdit[];
/**
 * Normalize a completion result (`CompletionItem[]`, a `CompletionList`, or `null`) into the action
 * vocabulary.
 * @param payload - the raw `textDocument/completion` result.
 * @param decode - optional server-side position decoder (utf-8/utf-32 servers).
 * @returns the normalized items (empty for `null`).
 * @throws LspActionError LSP_ACTION_MALFORMED_RESPONSE for structurally invalid entries.
 */
export declare function normalizeCompletionItems(payload: unknown, decode?: PositionDecoder): LspCompletionItem[];
/**
 * Normalize a `textDocument/codeAction` result (`(Command | CodeAction)[]` or `null`) into the
 * action vocabulary. Edits are grouped by target document URI; a `Command` form is reported
 * verbatim and never executed. Non-text workspace edits (create/rename/delete) are dropped —
 * applying code actions is the model's own write/edit decision.
 * @param payload - the raw code action result.
 * @param decode - optional server-side position decoder (utf-8/utf-32 servers).
 * @returns the normalized actions (empty for `null`).
 * @throws LspActionError LSP_ACTION_MALFORMED_RESPONSE for structurally invalid entries.
 */
export declare function normalizeCodeActions(payload: unknown, decode?: PositionDecoder): LspCodeActionItem[];
/**
 * Normalize a `textDocument/rename` result (`WorkspaceEdit` or `null`) into the raw grouped edit
 * record. Positions stay in the server's encoding — each document's edits are decoded per
 * document by the caller, which owns that document's text. Resource operations (create/rename/
 * delete) are refused: this client only applies text edits.
 * @param payload - the raw WorkspaceEdit payload.
 * @returns the grouped wire edits (empty for `null`).
 * @throws LspActionError LSP_ACTION_MALFORMED_RESPONSE for structurally invalid entries, and
 *   LSP_ACTION_UNSUPPORTED for resource operations.
 */
export declare function normalizeWorkspaceEdit(payload: unknown): Record<string, LspTextEdit[]>;
/**
 * Decode one document's wire edits from the server's position encoding to utf-16.
 * @param edits - the edits in the server's encoding.
 * @param codec - the document's position codec (undefined for utf-16 servers).
 * @param encoding - the negotiated position encoding.
 * @returns the decoded edits.
 */
export declare function decodeTextEdits(edits: readonly LspTextEdit[], codec: PositionCodec | undefined, encoding: WirePositionEncoding): LspTextEdit[];
/**
 * Normalize a `workspace/symbol` or `textDocument/documentSymbol` result into the action
 * vocabulary. DocumentSymbol hierarchies are flattened depth-first, each node carrying its own
 * range; SymbolInformation locations pass through verbatim.
 * @param payload - the raw symbol result.
 * @param documentUri - the URI DocumentSymbol entries belong to.
 * @param decode - optional server-side position decoder (utf-8/utf-32 servers).
 * @returns the normalized symbols (empty for `null`).
 * @throws LspActionError LSP_ACTION_MALFORMED_RESPONSE for structurally invalid entries.
 */
export declare function normalizeSymbols(payload: unknown, documentUri: string | undefined, decode?: PositionDecoder): LspSymbol[];
/**
 * Normalize a `textDocument/signatureHelp` result into the action vocabulary. Documentation is
 * normalized from MarkupContent to plain text; tuple parameter labels are sliced out of the
 * signature label.
 * @param payload - the raw signature help result.
 * @returns the normalized signatures, or `{ signatures: [] }`-equivalent null result.
 * @throws LspActionError LSP_ACTION_MALFORMED_RESPONSE for structurally invalid entries.
 */
export declare function normalizeSignatures(payload: unknown): {
    signatures: LspSignature[];
    activeSignature?: number;
    activeParameter?: number;
};
/**
 * Normalize a `textDocument/inlayHint` result into the action vocabulary. Multi-part labels are
 * joined into plain text.
 * @param payload - the raw inlay hint result.
 * @param decode - optional server-side position decoder (utf-8/utf-32 servers).
 * @returns the normalized hints (empty for `null`).
 * @throws LspActionError LSP_ACTION_MALFORMED_RESPONSE for structurally invalid entries.
 */
export declare function normalizeInlayHints(payload: unknown, decode?: PositionDecoder): LspInlayHint[];
//# sourceMappingURL=translate.d.ts.map
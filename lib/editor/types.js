/**
 * Editor action protocol v1 — the wire vocabulary editors consume over ACP-style JSON-RPC. The
 * protocol is intentionally additive and versioned: v1 fields and event kinds are frozen, clients
 * must ignore unknown fields and unknown event kinds, and a breaking change is always published
 * under a new `protocol` version string (never by editing v1). Full spec: `docs/editor-protocol.md`.
 *
 * Positions and ranges on this wire use the LSP convention (zero-based, half-open UTF-16), because
 * editors already speak it; the model-facing tools keep their one-based cursor convention.
 * @module dsh-lsp-actions/editor/types
 */
/** The protocol version string servers advertise in `lsp.actions.list`. */
export const EDITOR_PROTOCOL = 'lsp-actions/v1';
//# sourceMappingURL=types.js.map
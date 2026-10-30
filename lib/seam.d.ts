/**
 * The official-seam consumer (path one): run each action through the extended `ctx.lsp` seam when
 * it is mounted and serves the operation, and classify failures so the runner can fall back to
 * the plugin's own client only where that is the right call. The seam vocabulary is consumed
 * structurally, never by import, so the plugin keeps working against every seam vintage.
 * @module dsh-lsp-actions/seam
 */
import type { LspActionOperation, LspActionResult, LspPosition, LspRange } from './vocabulary.js';
/** The structural surface the extended `ctx.lsp` seam exposes (see the upstream PR proposal). */
export interface SeamService {
    query(request: {
        readonly operation: LspActionOperation;
        readonly filePath: string;
        readonly position?: LspPosition;
        readonly range?: LspRange;
        readonly workspaceRoot: string;
        /** The symbol-name query, for workspace symbol search. */
        readonly query?: string;
        /** CodeActionKind filters, for code actions. */
        readonly onlyKinds?: readonly string[];
        /** The new symbol name, for rename. */
        readonly newName?: string;
    }, signal?: AbortSignal): Promise<LspActionResult>;
}
/** Operation-specific extras a seam query may carry (`query`, `onlyKinds`, `newName`). */
export interface SeamExtras {
    readonly query?: string;
    readonly onlyKinds?: readonly string[];
    readonly newName?: string;
}
/** The classification of one seam attempt, deciding whether the runner falls back or fails. */
export type SeamAttempt = {
    readonly ok: true;
    readonly result: LspActionResult;
} | {
    readonly ok: false;
    readonly reason: 'absent';
} | {
    readonly ok: false;
    readonly reason: 'legacy';
} | {
    readonly ok: false;
    readonly reason: 'unavailable';
} | {
    readonly ok: false;
    readonly reason: 'unsupported';
} | {
    readonly ok: false;
    readonly reason: 'error';
    readonly error: unknown;
};
/**
 * Which vintage of the `ctx.lsp` seam is mounted:
 * - `absent` — no seam at all (path two serves every call);
 * - `legacy` — a seam that predates the action vocabulary: it rejects an action operation with a
 *   code-less error, so it can NEVER serve an action and the runner must not pay a failed round
 *   trip per call;
 * - `unsupported` — a seam that knows the vocabulary but has no provider advertising the
 *   operation (the runner fails loud for that call);
 * - `actions` — a seam that speaks the action vocabulary.
 *
 * This is the asserted form of the classification `trySeamAction` documents: the bare-error
 * fallback is a capability fact about the mounted seam, not a per-call accident, so it is probed
 * once (see `probeSeamVintage`) and cached per seam instance by the runner. An abort is the
 * caller's own cancellation and is rethrown, never cached as a vintage.
 */
export type SeamVintage = 'absent' | 'legacy' | 'unsupported' | 'actions';
/**
 * Classify one seam attempt into the vintage it proves. `absent` needs no attempt (the seam is
 * missing); every other vintage is a property of the seam, so the runner records it once per seam
 * instance instead of re-deriving it from every call.
 * @param attempt - the classified attempt `trySeamAction` returned.
 * @returns the vintage the attempt proves (`absent` is never returned here).
 */
export declare function classifySeamAttempt(attempt: SeamAttempt): Exclude<SeamVintage, 'absent'>;
/**
 * Probe the mounted seam's vintage with one benign action query — for callers that need the
 * classification before running a real action.
 *
 * `documentSymbol` needs only a path, so the probe neither demands a position/range nor costs a
 * workspace walk; on the published seam (four operations, no action vocabulary) it rejects with a
 * code-less error and yields `legacy`. The bundled runner does not spend this extra query: it
 * classifies its first real attempt through {@link classifySeamAttempt} (same mapping, no probe).
 * @param seam - the mounted `ctx.lsp` service, when present.
 * @param filePath - a source file to probe with.
 * @param workspaceRoot - the workspace root the query resolves against.
 * @param signal - optional cancellation; an abort is rethrown so the caller never caches it.
 * @returns the classified vintage.
 */
export declare function probeSeamVintage(seam: SeamService | undefined, filePath: string, workspaceRoot: string, signal?: AbortSignal): Promise<SeamVintage>;
/**
 * Run one action through the seam and classify the outcome. Success returns the result; the
 * fallback reasons (`absent`, `legacy`, `unavailable`) let the runner serve the call through the
 * plugin's own client, while `unsupported` and `error` fail loud.
 * @param seam - the mounted `ctx.lsp` service, when present.
 * @param operation - the action to run.
 * @param filePath - the source file.
 * @param workspaceRoot - the workspace root.
 * @param position - the cursor position, for completion, signature help, and rename.
 * @param range - the formatting/code-action/inlay-hint range.
 * @param signal - optional cancellation.
 * @param extras - operation-specific extras (`query`, `onlyKinds`, `newName`) the operation carries.
 * @returns the classified attempt.
 */
export declare function trySeamAction(seam: SeamService | undefined, operation: LspActionOperation, filePath: string, workspaceRoot: string, position: LspPosition | undefined, range: LspRange | undefined, signal: AbortSignal | undefined, extras?: SeamExtras): Promise<SeamAttempt>;
//# sourceMappingURL=seam.d.ts.map
/**
 * The official-seam consumer (path one): run each action through the extended `ctx.lsp` seam when
 * it is mounted and serves the operation, and classify failures so the runner can fall back to
 * the plugin's own client only where that is the right call. The seam vocabulary is consumed
 * structurally, never by import, so the plugin keeps working against every seam vintage.
 * @module dsh-lsp-actions/seam
 */
/**
 * Classify one seam attempt into the vintage it proves. `absent` needs no attempt (the seam is
 * missing); every other vintage is a property of the seam, so the runner records it once per seam
 * instance instead of re-deriving it from every call.
 * @param attempt - the classified attempt `trySeamAction` returned.
 * @returns the vintage the attempt proves (`absent` is never returned here).
 */
export function classifySeamAttempt(attempt) {
    if (attempt.ok)
        return 'actions';
    if (attempt.reason === 'legacy')
        return 'legacy';
    if (attempt.reason === 'unsupported')
        return 'unsupported';
    // `unavailable` / `error`: the seam understood the action vocabulary and answered about this
    // file — only a code-less rejection proves the pre-action surface.
    return 'actions';
}
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
export async function probeSeamVintage(seam, filePath, workspaceRoot, signal) {
    if (seam === undefined)
        return 'absent';
    const attempt = await trySeamAction(seam, 'documentSymbol', filePath, workspaceRoot, undefined, undefined, signal, {});
    return classifySeamAttempt(attempt);
}
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
export async function trySeamAction(seam, operation, filePath, workspaceRoot, position, range, signal, extras = {}) {
    if (seam === undefined)
        return { ok: false, reason: 'absent' };
    try {
        const result = await seam.query({
            operation,
            filePath,
            workspaceRoot,
            ...position === undefined ? {} : { position },
            ...range === undefined ? {} : { range },
            ...extras.query === undefined ? {} : { query: extras.query },
            ...extras.onlyKinds === undefined ? {} : { onlyKinds: extras.onlyKinds },
            ...extras.newName === undefined ? {} : { newName: extras.newName },
        }, signal);
        return { ok: true, result };
    }
    catch (error) {
        // An abort is the caller's own cancellation (timeout policy), not a seam capability fact:
        // surface the signal's reason, never the seam's unrelated error or a fallback classification.
        if (signal?.aborted)
            throw signal.reason;
        const code = errorCodeOf(error);
        if (code === 'LSP_UNAVAILABLE')
            return { ok: false, reason: 'unavailable' };
        if (code === 'LSP_UNSUPPORTED_OPERATION')
            return { ok: false, reason: 'unsupported' };
        // A code-less failure is the pre-action seam (or its provider) rejecting an unknown operation:
        // it can never serve actions, so the runner falls back to the plugin's own client.
        if (code === undefined)
            return { ok: false, reason: 'legacy' };
        return { ok: false, reason: 'error', error };
    }
}
/** Extract a stable error code from an unknown thrown value, without instanceof across copies. */
function errorCodeOf(error) {
    if (error === null || typeof error !== 'object')
        return undefined;
    const code = error.code;
    return typeof code === 'string' ? code : undefined;
}
//# sourceMappingURL=seam.js.map
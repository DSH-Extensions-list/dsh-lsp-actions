/**
 * The editor-protocol service: the transport-agnostic `lsp.actions.list` / `lsp.actions.run` /
 * `lsp.events` surface editors consume. It owns the action dispatch, the per-run timeout, the
 * version check, the bounded diagnostics cache (invalidated by filesystem observations and by the
 * plugin's own writes), and the event stream; the JSON-RPC transport in `server.ts` is one thin
 * consumer of it. Everything the service registers (listeners, cache, event subscriptions) is
 * effect-scoped through the plugin's `ctx.effect`, so stopping the plugin reverses it all.
 * @module dsh-lsp-actions/editor/service
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ActionRunner } from '../runner.js';
import type { FormatSandboxController } from '../sandbox.js';
import type { ResolvedConfig } from '../servers.js';
import { LruDiagnosticsCache } from './cache.js';
import type { EditorEvent, EditorListResult, EditorRunRequest, EditorRunResult } from './types.js';
/** The listener contract of the event stream. */
export type EditorEventListener = (event: EditorEvent) => void;
/**
 * The editor action surface for one plugin instance. Construction registers nothing; call
 * {@link EditorActionService.start} (inside the plugin's effect) to attach listeners.
 */
export declare class EditorActionService {
    private readonly ctx;
    private readonly runner;
    private readonly sandbox;
    private readonly config;
    private readonly cache;
    private readonly listeners;
    private started;
    /** Serial source for request ids of runs that did not supply one (instance-owned, so a plugin reload never shares it). */
    private serial;
    constructor(ctx: Context, runner: ActionRunner, sandbox: FormatSandboxController, config: ResolvedConfig, cache: LruDiagnosticsCache);
    /**
     * Attach the reversible listeners: filesystem observations invalidate cached diagnostics (and
     * announce `file.changed`), and session creation/disposal re-announce the session list. Safe to
     * call once; the returned disposer detaches everything.
     * @returns the disposal function for this service's listeners.
     */
    start(): () => void;
    /**
     * The `lsp.actions.list` result: the protocol identity, the v1 action catalog, and the
     * addressable DSH sessions (live sessions from the optional `sessions` service).
     * @returns the list payload.
     */
    list(): EditorListResult;
    /**
     * Run one editor action: version-check, validate, bind the addressed session's live agent (for
     * the official permission-preset and approval choreography), enforce the configured per-run
     * timeout, emit `action.status` lifecycle events, and always answer with the structured success
     * or failure envelope.
     * @param request - the raw `lsp.actions.run` parameters.
     * @param signal - optional caller cancellation, raced with the configured timeout.
     * @returns the unified run envelope.
     */
    run(request: EditorRunRequest, signal?: AbortSignal): Promise<EditorRunResult>;
    /** Subscribe to the event stream. Returns a disposer for the subscription. */
    subscribe(listener: EditorEventListener): () => void;
    /** The current live-session snapshot. */
    private sessionSnapshot;
    /** The live agent of the addressed session, when one exists. */
    private liveAgentOf;
    private sessionsService;
    private announce;
    /** A per-service-instance unique request id for runs that did not supply one. */
    private counter;
}
//# sourceMappingURL=service.d.ts.map
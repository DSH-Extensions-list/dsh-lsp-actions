/**
 * The editor-protocol JSON-RPC server: serves `lsp.actions.list` / `lsp.actions.run` and the
 * client-controlled `lsp.events` subscription over a newline-delimited JSON-RPC stdio channel.
 * This is a thin transport consumer of {@link EditorActionService} — all protocol and permission
 * logic lives there, so any other transport (HTTP, WS, an upstream extension point) can serve the
 * same surface unchanged.
 *
 * Stdout is reserved for protocol frames: enable this only in a dedicated headless composition
 * whose stdout nothing else claims (the plugin refuses nothing at load — the deployment owns that
 * contract, exactly like the official SDK JSON-RPC server).
 * @module dsh-lsp-actions/editor/server
 */
import type { Readable, Writable } from 'node:stream';
import type { Context } from '@deepseek-ai/cordis';
import type { ActionRunner } from '../runner.js';
import type { FormatSandboxController } from '../sandbox.js';
import type { ResolvedConfig } from '../servers.js';
import { EditorActionService } from './service.js';
/** The three protocol methods, by wire name. */
export declare const EDITOR_METHOD_LIST = "lsp.actions.list";
export declare const EDITOR_METHOD_RUN = "lsp.actions.run";
export declare const EDITOR_METHOD_EVENTS = "lsp.events";
/** Runtime-only transport hooks for tests; production uses process stdio. */
export interface EditorServerOptions {
    readonly input?: Readable;
    readonly output?: Writable;
}
/** The running editor-protocol runtime: service, transport (when enabled), and disposal. */
export interface EditorProtocolRuntime {
    readonly service: EditorActionService;
    readonly server: EditorJsonRpcServer;
    dispose(): Promise<void>;
}
/**
 * Start the editor protocol for one plugin instance: the bounded diagnostics cache, the
 * transport-agnostic service (listeners attached), and the JSON-RPC stdio server. Every side
 * effect is owned by the returned {@link EditorProtocolRuntime.dispose}, so the plugin's effect
 * scope can reverse the whole surface.
 * @param ctx - the plugin context.
 * @param runner - the seam-first action runner shared with the model tools.
 * @param sandbox - the escalation controller shared with the mutation tools.
 * @param config - the resolved plugin configuration (editor bounds validated by the caller).
 * @returns the runtime to dispose with the plugin.
 */
export declare function startEditorProtocol(ctx: Context, runner: ActionRunner, sandbox: FormatSandboxController, config: ResolvedConfig): EditorProtocolRuntime;
/**
 * Serve the editor protocol over one transport. Construction subscribes to the service's event
 * stream only while a client has subscribed via the `lsp.events` notification, so idle
 * connections never accumulate listeners.
 */
export declare class EditorJsonRpcServer {
    private readonly service;
    private readonly transport;
    private eventsDisposer;
    constructor(service: EditorActionService, options?: EditorServerOptions);
    /** Attach the transport to its streams. */
    start(): void;
    /** Detach the transport and drop the event subscription. */
    close(): void;
}
//# sourceMappingURL=server.d.ts.map
/**
 * The sandbox-escalation API for the mutation tools (`lsp_format` / `lsp_rename`): per-call policy
 * resolution, the advertised escalation fields, and denial-marker mapping — delegating the
 * vocabulary and the fail-closed approval sequence to `@deepseek-ai/dsh-sandbox`, exactly as
 * `dsh-tool-fs` does for `write`/`edit`, so formatting and rename escalate identically to the
 * official mutation tools.
 * @module dsh-lsp-actions/sandbox
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
/** The two escalation arguments a mutation tool may carry (advertised only under a confining backend). */
export interface FormatEscalationArgs {
    sandbox_permissions?: string;
    justification?: string;
}
/** The schema fields for the escalation arguments, spread into the tool's `parameters`. */
export interface EscalationSchemaFields {
    sandbox_permissions: {
        type: 'string';
        enum: string[];
        description: string;
    };
    justification: {
        type: 'string';
        description: string;
    };
}
/**
 * The mutation-escalation API: advertisement gating, per-call policy resolution, the one-approved
 * wider retry, and denial-marker mapping. A pure product of `ctx` at plugin apply time.
 */
export declare class FormatSandboxController {
    private readonly ctx;
    /** The escalation targets this composition advertises (`[]` when no confining backend is mounted). */
    readonly escalationModes: readonly SandboxMode[];
    /** Shared per-session policy resolver, required by a confining backend. */
    private readonly policy;
    constructor(ctx: Context);
    /**
     * The escalation schema fields for a mutation tool's `parameters`. Call it only under a confining
     * backend (guard on {@link escalationModes}); the enum pins the closed target vocabulary, the
     * strict-wider check happens per call at execution.
     * @param actionLabel - the action named in the advertised descriptions (`formatting`, `rename`).
     * @returns the two escalation parameter specs.
     */
    schemaFields(actionLabel: string): EscalationSchemaFields;
    /**
     * The policy to stamp onto this formatting: an approved escalation grant (a strictly wider retry
     * resolved through `ctx.approval` before anything executes), else the session's standing mode.
     * The calling session's cwd is always carried as the workspace root. Validates the escalation
     * argument pairing first.
     * @param toolName - the tool's name, for the approval audit trail.
     * @param args - the call's escalation arguments.
     * @param exec - the tool-execution context (agent, callId, signal).
     * @returns the policy to pass to the write, or undefined for an unsandboxed backend.
     */
    resolvePolicy(toolName: string, args: FormatEscalationArgs, exec: ToolExecution): Promise<SandboxExecutionPolicy | undefined>;
    /**
     * Map a thrown provider error for the model: a `FS_SANDBOX_DENIED` becomes an `FsError` whose
     * text is the shared `[sandbox: …]` denial marker plus the same-turn escalation hint, so a policy
     * denial reads identically to bash's WHILE keeping the structured `FS_SANDBOX_DENIED` code.
     * @param error - the error thrown by the write.
     * @param policy - the policy stamped onto the call (names the mode in the marker).
     * @returns the error to throw — the marker `FsError` for a sandbox denial, else the original.
     */
    mapError(error: unknown, policy: SandboxExecutionPolicy | undefined): unknown;
}
//# sourceMappingURL=sandbox.d.ts.map
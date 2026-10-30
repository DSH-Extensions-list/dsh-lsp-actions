/**
 * The bounded diagnostics cache for the editor protocol: a Map-backed LRU keyed by absolute file
 * path, capped by `maxFiles`. Entries carry the freshness token of the source they were computed
 * against, so a `quickfix.apply` without an explicit range can refuse stale first-diagnostic
 * targeting instead of applying a fix to a line that moved. Every access refreshes recency; the
 * bound evicts least-recently-used entries, so memory is bounded by config, not by history.
 * @module dsh-lsp-actions/editor/cache
 */
import type { EditorDiagnostic } from './types.js';
/** One cached diagnostics snapshot for a file. */
export interface CachedDiagnostics {
    /** The absolute file path the snapshot covers. */
    readonly filePath: string;
    /** The source freshness token the diagnostics were computed against (absent when unknown). */
    readonly version?: string;
    /** The snapshot's diagnostics, already count-capped by the action. */
    readonly diagnostics: readonly EditorDiagnostic[];
    /** Whether the snapshot is truncated at the configured cap. */
    readonly truncated: boolean;
    /** The server-reported total before capping. */
    readonly total: number;
    /** Wall-clock time of the snapshot (ms epoch), for diagnostics and tests. */
    readonly updatedAt: number;
}
/**
 * A bounded LRU cache of diagnostics snapshots. `maxFiles` is validated at construction and may be
 * reduced later; entries are evicted least-recently-used first until the bound holds.
 */
export declare class LruDiagnosticsCache {
    private maxFiles;
    private readonly entries;
    constructor(maxFiles: number);
    /** The current bound. */
    get capacity(): number;
    /** The number of cached files. */
    get size(): number;
    /** The absolute file paths currently cached, most-recently-accessed last. */
    get keys(): readonly string[];
    /** Read one snapshot, refreshing its recency. */
    get(filePath: string): CachedDiagnostics | undefined;
    /** Store one snapshot, evicting least-recently-used entries beyond the bound. */
    set(entry: CachedDiagnostics): void;
    /** Drop one file's snapshot (no-op when absent). */
    delete(filePath: string): boolean;
    /** Drop every snapshot. */
    clear(): void;
    /** Change the bound, evicting immediately when it shrinks. */
    setCapacity(maxFiles: number): void;
    private evict;
}
//# sourceMappingURL=cache.d.ts.map
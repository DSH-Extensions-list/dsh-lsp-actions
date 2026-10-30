/**
 * The bounded diagnostics cache for the editor protocol: a Map-backed LRU keyed by absolute file
 * path, capped by `maxFiles`. Entries carry the freshness token of the source they were computed
 * against, so a `quickfix.apply` without an explicit range can refuse stale first-diagnostic
 * targeting instead of applying a fix to a line that moved. Every access refreshes recency; the
 * bound evicts least-recently-used entries, so memory is bounded by config, not by history.
 * @module dsh-lsp-actions/editor/cache
 */
/**
 * A bounded LRU cache of diagnostics snapshots. `maxFiles` is validated at construction and may be
 * reduced later; entries are evicted least-recently-used first until the bound holds.
 */
export class LruDiagnosticsCache {
    maxFiles;
    entries = new Map();
    constructor(maxFiles) {
        this.maxFiles = maxFiles;
        if (!Number.isInteger(maxFiles) || maxFiles <= 0) {
            throw new TypeError('editor.diagnosticsCacheMaxFiles must be a positive integer');
        }
    }
    /** The current bound. */
    get capacity() {
        return this.maxFiles;
    }
    /** The number of cached files. */
    get size() {
        return this.entries.size;
    }
    /** The absolute file paths currently cached, most-recently-accessed last. */
    get keys() {
        return [...this.entries.keys()];
    }
    /** Read one snapshot, refreshing its recency. */
    get(filePath) {
        const entry = this.entries.get(filePath);
        if (entry === undefined)
            return undefined;
        // Refresh recency: re-insertion moves the entry to the tail of the map.
        this.entries.delete(filePath);
        this.entries.set(filePath, entry);
        return entry;
    }
    /** Store one snapshot, evicting least-recently-used entries beyond the bound. */
    set(entry) {
        this.entries.delete(entry.filePath);
        this.entries.set(entry.filePath, entry);
        this.evict();
    }
    /** Drop one file's snapshot (no-op when absent). */
    delete(filePath) {
        return this.entries.delete(filePath);
    }
    /** Drop every snapshot. */
    clear() {
        this.entries.clear();
    }
    /** Change the bound, evicting immediately when it shrinks. */
    setCapacity(maxFiles) {
        if (!Number.isInteger(maxFiles) || maxFiles <= 0) {
            throw new TypeError('editor.diagnosticsCacheMaxFiles must be a positive integer');
        }
        this.maxFiles = maxFiles;
        this.evict();
    }
    evict() {
        while (this.entries.size > this.maxFiles) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined)
                break;
            this.entries.delete(oldest);
        }
    }
}
//# sourceMappingURL=cache.js.map
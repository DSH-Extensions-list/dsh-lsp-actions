/**
 * Apply a server's text edits to the document text the server saw: position→offset conversion on
 * UTF-16 code units, overlap validation, and descending application so non-overlapping edits can
 * never shift one another's offsets.
 * @module dsh-lsp-actions/edits
 */
import type { LspTextEdit } from './vocabulary.js';
/**
 * Apply a server's non-overlapping edits to the exact text the server edited, in descending
 * position order so earlier edits never invalidate later offsets.
 * @param text - the document text the server saw.
 * @param edits - the normalized edits.
 * @returns the text with every edit applied.
 * @throws LspActionError LSP_ACTION_CONFLICT for overlapping edits or edits outside the document.
 */
export declare function applyEdits(text: string, edits: readonly LspTextEdit[]): string;
//# sourceMappingURL=edits.d.ts.map
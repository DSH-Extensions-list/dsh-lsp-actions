/**
 * Action-surface vocabulary: the normalized diagnostics / edits / completion result unions the
 * three tools consume, plus the stable structured error taxonomy. Field-for-field, this mirrors
 * the proposed upstream `ctx.lsp` action vocabulary (see `docs/seam-extension-notes.md`), so the
 * plugin migrates to the official seam by swapping the runner, not the tool contracts.
 * @module dsh-lsp-actions/vocabulary
 */
import { HarnessError } from '@deepseek-ai/dsh-llm';
/**
 * Structured LSP action failure. Extends {@link HarnessError} so the tool registry surfaces
 * `{ name, code }` on error results; callers route on `code`, never on `message` text.
 */
export class LspActionError extends HarnessError {
    code;
    constructor(message, code, options) {
        super(message, code, options);
        this.code = code;
    }
}
//# sourceMappingURL=vocabulary.js.map
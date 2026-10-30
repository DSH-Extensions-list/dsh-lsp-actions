/**
 * Pure formatting and presentation for the three LSP action tools: severity-labeled diagnostic
 * text, completion listings marked as reference-only, bounded result truncation, and the pure
 * UI card presenters. No I/O — a UI may call the presenters on live streaming and on replay, so
 * they depend only on tool arguments (and persisted result metadata).
 * @module dsh-lsp-actions/render
 */
import type { GenericCallView, GenericResultView, DiffResultView, ToolResult } from '@deepseek-ai/dsh-tools';
/** The human-readable label for a numeric LSP symbol/completion kind. */
export declare function symbolKindLabel(kind: number): string;
/** Projected metadata shapes persisted with the session log (pure projections of canonical values). */
export interface DiagnosticsCardMeta {
    readonly diagnostics: readonly {
        readonly line: number;
        readonly character?: number;
        readonly severity: number;
        readonly message: string;
        readonly source?: string;
        readonly code?: string | number;
    }[];
}
export interface CompletionCardMeta {
    readonly items: readonly {
        readonly label: string;
        readonly detail?: string;
        readonly insertText?: string;
    }[];
}
export interface FormatCardMeta {
    readonly diffs: readonly {
        readonly path: string;
        readonly oldText: string | null;
        readonly newText: string;
    }[];
}
export interface CodeActionCardMeta {
    readonly items: readonly {
        readonly title: string;
        readonly kind?: string;
        readonly isPreferred?: boolean;
    }[];
}
export interface SymbolsCardMeta {
    readonly items: readonly {
        readonly name: string;
        readonly kind: number;
        readonly location: {
            readonly uri: string;
            readonly line: number;
            readonly character: number;
        };
    }[];
}
export interface SignaturesCardMeta {
    readonly signatures: readonly {
        readonly label: string;
        readonly documentation?: string;
    }[];
}
export interface InlayHintsCardMeta {
    readonly items: readonly {
        readonly line: number;
        readonly character: number;
        readonly label: string;
    }[];
}
export interface RenameCardMeta {
    readonly diffs: readonly {
        readonly path: string;
        readonly oldText: string | null;
        readonly newText: string;
    }[];
}
/**
 * Format a diagnostics result as model-facing text: one `path:line:character  [Severity] message`
 * line per diagnostic, an omission marker past `maxDiagnostics`, then the complete result cap.
 * @param filePath - the diagnosed file (all diagnostics belong to it).
 * @param diagnostics - the already count-capped diagnostics (the canonical schema's projection).
 * @param maxResultChars - the complete rendered-text cap, including truncation metadata.
 * @returns the rendered text; a distinct no-result line when there are none.
 */
export declare function formatDiagnostics(filePath: string, diagnostics: readonly {
    severity: number;
    range: {
        start: {
            line: number;
            character: number;
        };
    };
    message: string;
    source?: string;
    code?: string | number;
}[], maxResultChars: number): string;
/**
 * Format a completion result as model-facing text. The header marks the items as reference-only:
 * nothing was executed, and applying one is the model's own write/edit decision. Each item shows
 * its label and detail, plus the actual insertion text (textEdit.newText, else insertText, else
 * the label) on an indented `→` line when it adds information — the label alone is often not what
 * the server would insert.
 * @param filePath - the completed file.
 * @param line - the one-based cursor line.
 * @param character - the one-based cursor character.
 * @param items - the already count-capped items (the canonical schema's projection).
 * @param maxResultChars - the complete rendered-text cap, including truncation metadata.
 * @returns the rendered text; a distinct no-result line when there are none.
 */
export declare function formatCompletionList(filePath: string, line: number, character: number, items: readonly {
    label: string;
    detail?: string;
    insertText?: string;
    textEdit?: {
        newText: string;
    };
}[], maxResultChars: number): string;
/**
 * Format a formatting outcome as one model-facing line; the UI diff card carries the applied
 * change, so the text stays a summary and the model re-reads the file for the full result. The
 * optional one-based line span names how much of the file changed, so the model can decide whether
 * a re-read is worth the tokens.
 * @param filePath - the formatted file.
 * @param appliedEdits - how many edits were applied.
 * @param linesChanged - the one-based line span the edits touch; omitted keeps the bare summary.
 * @returns the summary text.
 */
export declare function formatAppliedEdits(filePath: string, appliedEdits: number, linesChanged?: number): string;
/**
 * Format a code action result as model-facing text: one numbered line per action, then each
 * action's edits with the replacement text. Reference-only — nothing is applied, and a command
 * form is reported but never executed.
 * @param filePath - the file actions were requested for.
 * @param items - the normalized actions (edits in the uri→list projection).
 * @param maxResultChars - the complete rendered-text cap.
 * @returns the rendered text.
 */
export declare function formatCodeActions(filePath: string, items: readonly {
    title: string;
    kind?: string;
    isPreferred?: boolean;
    edits?: readonly {
        uri: string;
        edits: readonly {
            range: {
                start: {
                    line: number;
                    character: number;
                };
            };
            newText: string;
        }[];
    }[];
    command?: {
        readonly title: string;
        readonly command: string;
    };
}[], maxResultChars: number): string;
/**
 * Format a symbol result as model-facing text: one `name [Kind] at uri:line:col` line per symbol.
 * @param items - the normalized symbols.
 * @param maxResultChars - the complete rendered-text cap.
 * @returns the rendered text.
 */
export declare function formatSymbols(items: readonly {
    name: string;
    kind: number;
    location: {
        uri: string;
        range: {
            start: {
                line: number;
                character: number;
            };
        };
    };
    containerName?: string;
}[], maxResultChars: number): string;
/**
 * Format a signature help result as model-facing text: the signatures with the active one and
 * active parameter marked, plus parameter labels and documentation.
 * @param filePath - the completed file.
 * @param signatures - the normalized signatures.
 * @param activeSignature - the server's active signature index.
 * @param activeParameter - the server's active parameter index.
 * @param maxResultChars - the complete rendered-text cap.
 * @returns the rendered text.
 */
export declare function formatSignatures(filePath: string, signatures: readonly {
    label: string;
    documentation?: string;
    parameters?: readonly {
        label: string;
        documentation?: string;
    }[];
}[], activeSignature: number | undefined, activeParameter: number | undefined, maxResultChars: number): string;
/**
 * Format an inlay hint result as model-facing text: one `line:col label` line per hint.
 * @param filePath - the hinted file.
 * @param items - the normalized hints.
 * @param maxResultChars - the complete rendered-text cap.
 * @returns the rendered text.
 */
export declare function formatInlayHints(filePath: string, items: readonly {
    position: {
        line: number;
        character: number;
    };
    label: string;
    kind?: number;
}[], maxResultChars: number): string;
/**
 * Format a rename outcome as one model-facing line; the UI diff cards carry the applied changes
 * per file, so the text stays a summary and the model re-reads the files for the full result.
 * @param filePath - the file the rename was requested in.
 * @param line - the one-based cursor line.
 * @param character - the one-based cursor character.
 * @param newName - the new symbol name.
 * @param appliedEdits - how many edits were applied across the workspace.
 * @param filesChanged - how many files changed.
 * @returns the summary text.
 */
export declare function formatRenameResult(filePath: string, line: number, character: number, newName: string, appliedEdits: number, filesChanged: number): string;
/** The raw, schema-typed argument shapes the presenters soft-validate against. */
export interface DiagnosticsToolArgs {
    readonly file_path: string;
}
export interface CompletionToolArgs {
    readonly file_path: string;
    readonly line: number;
    readonly character: number;
}
export interface FormatToolArgs {
    readonly file_path: string;
}
/**
 * Pending-state presenter for `lsp_diagnostics`: a generic search card focused on the file.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export declare function presentLspDiagnosticsCall(args: DiagnosticsToolArgs): GenericCallView;
/**
 * Completed-state presenter for `lsp_diagnostics`: severity-labeled lines rebuilt from the
 * persisted projection, with a follow-along location on the first diagnostic.
 * @param _args - the raw tool arguments (unused; the projection carries the result facts).
 * @param result - the completed tool result.
 * @returns the generic result view, or undefined to keep the fallback card.
 */
export declare function presentLspDiagnosticsResult(_args: DiagnosticsToolArgs, result: ToolResult): GenericResultView | undefined;
/**
 * Pending-state presenter for `lsp_completion`: a generic search card at the cursor.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export declare function presentLspCompletionCall(args: CompletionToolArgs): GenericCallView;
/**
 * Completed-state presenter for `lsp_completion`: the reference-only item list rebuilt from the
 * persisted projection.
 * @param args - the raw tool arguments (used for the title).
 * @param result - the completed tool result.
 * @returns the generic result view, or undefined to keep the fallback card.
 */
export declare function presentLspCompletionResult(args: CompletionToolArgs, result: ToolResult): GenericResultView | undefined;
/**
 * Pending-state presenter for `lsp_format`: the diff exists only after the server answers, so the
 * pending card is a generic edit card; the completed diff card replaces it.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export declare function presentLspFormatCall(args: FormatToolArgs): GenericCallView;
/**
 * Completed-state presenter for `lsp_format`: the applied whole-file diff rebuilt from the
 * persisted projection, so replay reproduces the card without re-reading the file.
 * @param args - the raw tool arguments (used for the title).
 * @param result - the completed tool result.
 * @returns the diff result view, or undefined to keep the fallback card.
 */
export declare function presentLspFormatResult(args: FormatToolArgs, result: ToolResult): DiffResultView | undefined;
export interface CodeActionToolArgs {
    readonly file_path: string;
}
export interface SymbolsToolArgs {
    readonly query?: string;
    readonly file_path?: string;
}
export interface SignatureToolArgs {
    readonly file_path: string;
    readonly line: number;
    readonly character: number;
}
export interface InlayHintsToolArgs {
    readonly file_path: string;
}
/**
 * Pending-state presenter for `lsp_code_action`: a generic search card on the file.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export declare function presentLspCodeActionCall(args: CodeActionToolArgs): GenericCallView;
/**
 * Completed-state presenter for `lsp_code_action`: the reference-only action list.
 * @param _args - the raw tool arguments.
 * @param result - the completed tool result.
 * @returns the generic result view, or undefined to keep the fallback card.
 */
export declare function presentLspCodeActionResult(_args: CodeActionToolArgs, result: ToolResult): GenericResultView | undefined;
/**
 * Pending-state presenter for `lsp_symbols`: a generic search card.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export declare function presentLspSymbolsCall(args: SymbolsToolArgs): GenericCallView;
/**
 * Completed-state presenter for `lsp_symbols`: name, kind, and location lines.
 * @param _args - the raw tool arguments.
 * @param result - the completed tool result.
 * @returns the generic result view, or undefined to keep the fallback card.
 */
export declare function presentLspSymbolsResult(_args: SymbolsToolArgs, result: ToolResult): GenericResultView | undefined;
/**
 * Pending-state presenter for `lsp_signature`: a generic search card at the cursor.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export declare function presentLspSignatureCall(args: SignatureToolArgs): GenericCallView;
/**
 * Completed-state presenter for `lsp_signature`: the signature labels.
 * @param _args - the raw tool arguments.
 * @param result - the completed tool result.
 * @returns the generic result view, or undefined to keep the fallback card.
 */
export declare function presentLspSignatureResult(_args: SignatureToolArgs, result: ToolResult): GenericResultView | undefined;
/**
 * Pending-state presenter for `lsp_inlay_hints`: a generic search card on the file.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export declare function presentLspInlayHintsCall(args: InlayHintsToolArgs): GenericCallView;
/**
 * Completed-state presenter for `lsp_inlay_hints`: one line per hint.
 * @param _args - the raw tool arguments.
 * @param result - the completed tool result.
 * @returns the generic result view, or undefined to keep the fallback card.
 */
export declare function presentLspInlayHintsResult(_args: InlayHintsToolArgs, result: ToolResult): GenericResultView | undefined;
export interface RenameToolArgs {
    readonly file_path: string;
    readonly line: number;
    readonly character: number;
    readonly new_name: string;
}
/**
 * Pending-state presenter for `lsp_rename`: the diffs exist only after the server answers, so the
 * pending card is a generic edit card; the completed diff cards replace it.
 * @param args - the raw tool arguments.
 * @returns the generic call view.
 */
export declare function presentLspRenameCall(args: RenameToolArgs): GenericCallView;
/**
 * Completed-state presenter for `lsp_rename`: one applied diff card per changed file, rebuilt
 * from the persisted projection so replay reproduces the cards without re-reading the files.
 * @param args - the raw tool arguments (used for the title).
 * @param result - the completed tool result.
 * @returns the diff result view, or undefined to keep the fallback card.
 */
export declare function presentLspRenameResult(args: RenameToolArgs, result: ToolResult): DiffResultView | undefined;
//# sourceMappingURL=render.d.ts.map
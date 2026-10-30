/**
 * Extract a file's final extension as a normalized, lowercase, leading-dot key (e.g. `Foo.TS` →
 * `.ts`, `foo.d.ts` → `.ts`). Returns `''` for a name with no extension or a leading-dot dotfile
 * (`.bashrc`), which no route ever matches. Splits on both `/` and `\`.
 * @param filePath - the source path to inspect.
 * @returns the normalized extension, or `''` when there is none.
 */
export declare function finalExtension(filePath: string): string;
//# sourceMappingURL=extension.d.ts.map
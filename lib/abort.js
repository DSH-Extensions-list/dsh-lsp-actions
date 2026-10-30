/**
 * Abort helpers: race any promise against a signal, and throw the signal's reason once it fires.
 * @module dsh-lsp-actions/abort
 */
/**
 * Race `promise` against `signal`; the returned promise rejects with the signal's reason the
 * moment it aborts, without disturbing the underlying promise's own settlement.
 * @param promise - the work to race.
 * @param signal - optional cancellation; undefined returns the promise unchanged.
 * @returns the raced promise.
 */
export function abortable(promise, signal) {
    if (signal === undefined)
        return promise;
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }
        const onAbort = () => { reject(signal.reason); };
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then((value) => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, (error) => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}
//# sourceMappingURL=abort.js.map
export class PromiseCompletionSource<TResult> {
    readonly #promise: Promise<TResult>;
    readonly #resolveFunc: (_: TResult) => void;
    readonly #rejectFunc: (_: unknown) => void;
    #isCompleted: boolean;

    constructor() {
        this.#isCompleted = false;

        let resFun: ((_: TResult) => void) | undefined = undefined;
        let rejFun: ((_: unknown) => void) | undefined = undefined;
        this.#promise = new Promise<TResult>((resF, rejF) => {
            resFun = resF;
            rejFun = rejF;
        });

        if (!resFun || !rejFun) {
            throw new Error("`resFun` or `rejFun` are undefined.");
        }

        this.#resolveFunc = resFun;
        this.#rejectFunc = rejFun;

        // void this.#promise.finally(() => {
        //     this.#isCompleted = true;
        // });
    }

    promise = (): Promise<TResult> => {
        return this.#promise;
    };

    isCompleted = (): boolean => {
        return this.#isCompleted;
    };

    tryResolve = (result: TResult): boolean => {
        if (this.#isCompleted) {
            return false;
        }

        this.#isCompleted = true;
        this.#resolveFunc(result);
        return true;
    };

    resolve = (result: TResult) => {
        if (!this.tryResolve(result)) {
            throw new Error("Cannot resolve this `PromiseCompletionSource` because it is already completed.");
        }
    };

    tryReject = (reason: unknown): boolean => {
        if (this.#isCompleted) {
            return false;
        }

        this.#isCompleted = true;
        this.#rejectFunc(reason);
        return true;
    };

    reject = (reason: unknown) => {
        if (!this.tryReject(reason)) {
            throw new Error("Cannot reject this `PromiseCompletionSource` because it is already completed.");
        }
    };

    tryCompleteWhen = (promise: Promise<TResult>): void => {
        this.chain(
            promise,
            (result, thisCompletionSource) => thisCompletionSource.tryResolve(result as TResult),
            (reason, thisCompletionSource) => thisCompletionSource.tryReject(reason)
        );
    };

    chain = (
        promise: Promise<unknown>,
        onResolved: (result: unknown, thisCompletionSource: PromiseCompletionSource<TResult>) => void,
        onRejected: (reason: unknown, thisCompletionSource: PromiseCompletionSource<TResult>) => void
    ): void => {
        try {
            promise.then(
                (result) => onResolved(result, this),
                (reason) => onRejected(reason, this)
            );
        } catch (err) {
            onRejected(err, this);
        }
    };
}

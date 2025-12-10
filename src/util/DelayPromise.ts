import { PromiseCompletionSource } from "./PromiseCompletionSource.js";

/**
 * A neat way to cause an asynchronous wait.
 * Usage:
 * ```
 * async function doStuff() {
 *
 *     // Awaits for 1 sec:
 *     await DelayPromise.Run(1000);
 *
 *     // Call `doSomeWork()` and await until it completes, or until 1 sec passes, whichever happens first:
 *     // (useful for timeouts):
 *     await DelayPromise.Race(1000, doSomeWork());
 *
 *     // (This assumes that `doSomeWork()` returns any kind of Promise.)
 * }
 * ```
 * See APIs for advanced usage.
 */
export class DelayPromise {
    /**
     * Returns a Promise that is resolved after the specified amount of milliseconds.
     * (The Promise can also be resolved ahead of time by calling `tryResolve()` etc. on it.)
     * @see promise For info on the resolution value of the returned Promise.
     */
    static Run(delayMSec: number): Promise<boolean> {
        const delay = new DelayPromise(delayMSec);
        return delay.start();
    }

    /**
     * Returns a Promise that is resolved after the specified amount of milliseconds,
     * or when the specified `promise`-parameter is completed.<br/>
     * The boolean resolution value of the returned Promise specifies whether the resolution occurred because
     * the delay completed, or because the passed `promise`-parameter completed.
     */
    static Race(delayMSec: number, promise: Promise<unknown>): Promise<boolean> {
        const delay = new DelayPromise(delayMSec);
        delay.tryResolveWhen(promise);
        return delay.start();
    }

    readonly #delayMSec: number;
    readonly #completion: PromiseCompletionSource<boolean>;
    #isDelayCompleted: boolean;
    #isStarted: boolean;

    constructor(delayMSec: number) {
        if (!Number.isInteger(delayMSec)) {
            throw new Error(`The specified 'delayMSec' must be an integer, but '${delayMSec}' was specified.`);
        }
        if (delayMSec < 0) {
            throw new Error(`The specified 'delayMSec' must be >= 0, but '${delayMSec}' was specified.`);
        }

        this.#delayMSec = delayMSec;
        this.#completion = new PromiseCompletionSource<boolean>();
        this.#isDelayCompleted = false;
        this.#isStarted = false;
    }

    /**
     * Returns whether this DelayPromise has already been started.
     */
    isStarted = (): boolean => {
        return this.#isStarted;
    };

    /**
     * Returns whether the delay time has completed.
     * Note that `isResolved()` may return true before `isCompleted()` returns true,
     * if the delay has been prematurely completed using `tryResolve().`
     */
    isCompleted = (): boolean => {
        return this.#isDelayCompleted;
    };

    /**
     * Returns whether the promise is completed.
     * This can occur either because the delay time has been reached or because `tryResolve()` has been called.
     */
    isResolved = (): boolean => {
        return this.#completion.isCompleted();
    };

    /**
     * The promise resolves to `true` if it is initially resolved by the delay timeout being completed,
     * or to `false`, if it was manually completed by calling `tryResolve()`.
     * Use `isResolved()` to check on the resolution status of this DelayPromise any time.
     * Use `isCompleted()` to check whether the timeout has finished, regardless of how the promise
     * was initially resolved.
     */
    promise = (): Promise<boolean> => {
        return this.#completion.promise();
    };

    /**
     * Start the timer if not yet started.
     * The returned Promise resolves with `true` then the timeout is reached,
     * and with `false` if it is resolved earlier by calling `tryResolve`.
     * This call is idempotent: if this `DelayPromise` is already started, it is not started again, and the
     * same `Promise` is returned again.
     */
    start = (): Promise<boolean> => {
        if (!this.#isStarted) {
            this.#isStarted = true;

            setTimeout(() => {
                this.#isDelayCompleted = true;
                this.#completion.tryResolve(true);
            }, this.#delayMSec);
        }

        return this.#completion.promise();
    };

    /**
     * Tries to resolve the promise regardless of the timeout.
     * Returns `true` if the promise is resolved as a result of this call, and `false` if it was resolved already.
     * On contrary, the underlying promise is resolved to `false` by this method,
     * and to `true` by the expiration of the underlying delay.
     */
    tryResolve = (): boolean => {
        return this.#completion.tryResolve(false);
    };

    /**
     * Sets up this delay promise to be resolved when the specified promise resolves.
     * (The resolution of the encapsulated delay promise will occur regardless of whether the promise specified
     * to this method completes with success or failure.)
     * The encapsulated delay promise will be resolved to `false` (not to error) if the resolution happens as a
     * result of the completion of the promise passed to this method, and to `true` if the underlying delay
     * timeout is reached first.
     * Use `isResolved()` to check if the promise is resolved for any reason and `isCompleted()` to check if the
     * actual timeout has been reached.
     */
    tryResolveWhen = (promise: Promise<unknown>): void => {
        try {
            void promise.finally(this.tryResolve);
        } catch {
            this.tryResolve();
        }
    };
}

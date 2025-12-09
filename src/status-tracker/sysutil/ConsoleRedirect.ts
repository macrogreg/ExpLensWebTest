/* eslint-disable prefer-rest-params */

/**
 * @module ConsoleRedirect
 * Functionality for redirecting the console output to custom functions.
 *
 * @fileoverview
 * Console redirection is useful, among other things, when a browser app wants to display/store/process diagnostic
 * logs directed to the console, without requiring the app to use any specific log library.
 *
 * **Scenario 1:**
 * Redirect some functionality of he built-in console to custom functions:
 *
 * Usage:
 * ```
 * const redirectHandle: ConsoleRedirectHandle = redirectConsole(
 *     (funcName: ConsoleFuncName, ...args: unknown[]) => { ... },
 *     { invokeOriginals: true }
 * );
 * // ...
 * redirectHandle.cancel();
 * ```
 * or
 * ```
 * const redirectHandle: ConsoleRedirectHandle = redirectConsole(
 *     {
 *         error: (_, ...args: unknown[]) => { ... },
 *         warn: (_, ...args: unknown[]) => { ... },
 *     },
 *     { invokeOriginals: true }
 * );
 * // ...
 * redirectHandle.cancel();
 * ```
 *
 * **Scenario 2:**
 * Wrap the built-in console into an object of the same shape, which redirects some calls to specified
 * custom functions, and invokes the original console for the rest:
 * - Only functions in `ConsoleFuncNames` (i.e. output functions) can be redirected, but _all_ console functions
 *   can be invoked on the wrapper.
 * - The wrapper captures the functions of the built-in console at the time the wrapper is created.
 *   The wrapper is not affected by subsequent redirects.
 *
 * Usage:
 * ```
 * const consoleWrapper = createVirtualConsole({
 *     log: (fn: ConsoleFuncName, ...args: unknown[]) => { ... },
 *     info: (fn: ConsoleFuncName, ...args: unknown[]) => { ... },
 * });
 *
 * // ...
 *
 * consoleWrapper.log("Some info"); // function specified above will be called
 * consoleWrapper.warn("More info"); // built-in console will be called
 * ```
 *
 */

import { errorTypeString } from "src/util/format_util";
import { ErrorAggregator } from "src/util/ErrorAggregator";

/**
 * These are the console functions supported for redirection by this library.
 */
export const ConsoleFuncNames = ["debug", "error", "info", "log", "trace", "warn"] as const;
Object.freeze(ConsoleFuncNames);

export type ConsoleFuncName = (typeof ConsoleFuncNames)[number];

export type ConsoleRedirectTarget = (funcName: ConsoleFuncName, ...args: unknown[]) => void;

export type ConsoleRedirectMap = Partial<Record<ConsoleFuncName, ConsoleRedirectTarget>>;

export type RedirectOptions = {
    /** @default false */
    readonly invokeOriginals?: boolean;
};

export type CancelRedirectOptions = {
    /** @default false */
    readonly ignoreMismatch?: boolean;
};

export type ConsoleRedirectHandle = {
    isCancelled: () => boolean;
    cancel: (options?: CancelRedirectOptions) => boolean;
    invokeOriginalFunc: (funcName: ConsoleFuncName, ...args: unknown[]) => boolean;
};

const createRedirectAllMap = (redirectTarget: ConsoleRedirectTarget): ConsoleRedirectMap =>
    Object.fromEntries(ConsoleFuncNames.map((fn) => [fn, redirectTarget]));

export function redirectConsole(
    redirectMap: ConsoleRedirectMap,

    /** @default { invokeOriginals: false } */
    options?: RedirectOptions
): ConsoleRedirectHandle;

export function redirectConsole(
    redirectTarget: ConsoleRedirectTarget,

    /** @default { invokeOriginals: false } */
    options?: RedirectOptions
): ConsoleRedirectHandle;

export function redirectConsole(
    redirectConfig: ConsoleRedirectMap | ConsoleRedirectTarget,
    options?: RedirectOptions
): ConsoleRedirectHandle {
    if (redirectConfig && typeof redirectConfig === "function") {
        const map = createRedirectAllMap(redirectConfig);
        return applyRedirectConsole(map, options);
    } else {
        return applyRedirectConsole(redirectConfig, options);
    }
}

const PRIVATE_API_KEY = Symbol(`A private API that can only be called from within the ConsoleRedirect module.`);

type ConsoleRedirectHandleWithPrivateAPIs = ConsoleRedirectHandle & {
    _privateGetRedirectMap: (apiKey: symbol) => ConsoleRedirectMap;
};

const isConsoleRedirectHandleWithPrivateAPIs = (value: object): value is ConsoleRedirectHandleWithPrivateAPIs => {
    return value && "_privateGetRedirectMap" in value && typeof value["_privateGetRedirectMap"] === "function";
};

type SystemConsoleFuncName = {
    [K in keyof typeof console]: (typeof console)[K] extends (...args: unknown[]) => unknown ? K : never;
}[keyof typeof console];

export type VirtualConsole = {
    [K in SystemConsoleFuncName]: (typeof console)[K];
};

/** Creates a Virtual Console wrapper that forwards to the specified redirection handles IFF they include
 * a redirection for the respective API, and calls the console otherwise. Instead of an actual handle,
 * just a handle configuration can be specified (i.e., a `ConsoleRedirectMap`).
 * If multiple inputs redirect the same API, then the first occurrence is preferred.
 * If no handles are specified, everything is directed to the console. The console is functions are
 * captured at the time of this call and are not affected by later redirections.
 * NOTE: The `ConsoleRedirectHandle` objects returned by `redirectConsole(..)` contain private state required for
 * the virtual console to work. `ConsoleRedirectHandle` that do not contain that private state will be ignored.*/
export function createVirtualConsole(...combineWith: (ConsoleRedirectHandle | ConsoleRedirectMap)[]): VirtualConsole {
    type SystemConsoleFuncType = VirtualConsole[SystemConsoleFuncName];

    const virtCnsl: Partial<VirtualConsole> = {};

    // Collect all redirected APIs. On clashes, prioritize first.
    combineWith?.forEach((combineTarget) => {
        const redirMap = isConsoleRedirectHandleWithPrivateAPIs(combineTarget)
            ? combineTarget._privateGetRedirectMap(PRIVATE_API_KEY)
            : (combineTarget as ConsoleRedirectMap);
        const safeRedirMap = redirMap && typeof redirMap === "object" ? redirMap : {};

        Object.entries(safeRedirMap)
            .filter(([n, v]) => ConsoleFuncNames.includes(n as ConsoleFuncName) && typeof v === "function")
            .forEach((f) => {
                const [fn, func] = f as [ConsoleFuncName, ConsoleRedirectTarget];
                if (!(fn in virtCnsl)) {
                    virtCnsl[fn] = (...args) => func(fn, ...args);
                }
            });
    });

    // Copy all functions from the console into the map, except the onces already in the map:
    Object.entries(console)
        .filter(([_, cProp]) => typeof cProp === "function")
        .forEach((cF) => {
            const [cFN, cFunc] = cF as [SystemConsoleFuncName, SystemConsoleFuncType];
            if (!(cFN in virtCnsl)) {
                virtCnsl[cFN] = cFunc;
            }
        });

    return virtCnsl as VirtualConsole;
}

function applyRedirectConsole(
    redirectMap: ConsoleRedirectMap,
    options?: RedirectOptions
): ConsoleRedirectHandle & ConsoleRedirectHandleWithPrivateAPIs {
    //
    // Grab the primitive values of the options so that they can be safely captured.
    // In the process, apply defaults to missing options.
    const invokeOriginal = options?.invokeOriginals ?? false;

    // Apply redirections and collect a list of infos describing the applied redirections,
    // so that they can be cancelled latter:
    const redirections = ConsoleFuncNames

        // For each redirectable function name:
        // If configured for redirection - apply and return info; otherwise - return null.

        .map((fn) => {
            // If no redirection configured for `fn`, skip:
            if (!(fn in redirectMap && redirectMap[fn] && typeof redirectMap[fn] === "function")) {
                return null;
            }

            // Defensive: if console does not have function `fn`, skip:
            if (!(fn in console && typeof console[fn] === "function")) {
                return null;
            }

            // Redirection target and its type:
            const targetFunc = redirectMap[fn];

            // Keep track of the original function being replaced:
            // const originalFunc = console[fn].bind(console);
            const originalFunc = console[fn];

            // Create the redirection invoker based on whether
            // the original function should be invoked after the redirect finishes:
            const redirectFunc = invokeOriginal
                ? function () {
                      const errors = new ErrorAggregator();

                      try {
                          targetFunc(fn, ...arguments);
                      } catch (err) {
                          errors.add(err);
                      }

                      try {
                          originalFunc(...arguments);
                      } catch (err) {
                          errors.add(err);
                      }

                      errors.throwIfHasErrors(
                          (errs) =>
                              "ConsoleRedirect: Errors occurred in both, the target function" +
                              ` (${errorTypeString(errs[0])}) and in the original/redirected` +
                              ` function (${errorTypeString(errs[1])}).`
                      );
                  }
                : function () {
                      targetFunc(fn, ...arguments);
                  };

            // Apply redirection:
            console[fn] = redirectFunc;

            const redirectInfo = {
                redirectName: fn,
                originalFunc,
                redirectFunc,
            };

            return redirectInfo;
        })

        // Remove nulls, leaving only the infos on the redirections that have actually been applied:
        .filter((ri) => ri !== null);

    // Will be used to gate making sure that restoreFunc cannot be called multiple times:
    let isRedirectCancelled = false;

    // The handle to control the redirection:
    const redirectHandle = {
        isCancelled: () => isRedirectCancelled,

        // Cancel Redirect Func:
        // `options.ignoreMismatch` is False, unless explicitly set to True.
        // Will return True if restoration was executed,
        // or False if it was skipped because this function was called multiple times.
        cancel: (options?: CancelRedirectOptions): boolean => {
            if (isRedirectCancelled) {
                return false;
            }

            const ignoreMismatch = options?.ignoreMismatch ?? false;
            if (!ignoreMismatch) {
                for (const redirInf of redirections) {
                    if (console[redirInf.redirectName] !== redirInf.redirectFunc) {
                        throw new Error(
                            "Cannot cancel redirection and restore original console functions, because the" +
                                ` current console[${redirInf.redirectName}] function is not the destination of` +
                                " this redirect handle. Was console redirected multiple times?" +
                                " To ignore this mismatch and replace all console functions affected by this" +
                                " handle with their originals, invoke" +
                                " ConsoleRedirectHandle.cancel({ignoreMismatch = true})."
                        );
                    }
                }
            }

            const errors = new ErrorAggregator();
            for (const redirInf of redirections) {
                try {
                    console[redirInf.redirectName] = redirInf.originalFunc;
                } catch (err) {
                    errors.add(err);
                }
            }

            isRedirectCancelled = true;
            errors.throwIfHasErrors((errs) => `${errs.length} errors while restoring console functions.`);

            return true;
        },

        invokeOriginalFunc: (funcName: ConsoleFuncName, ...args: unknown[]) => {
            if (isRedirectCancelled) {
                return false;
            }

            const redirectInfo = redirections.find((ri) => ri.redirectName === funcName);
            if (redirectInfo == undefined) {
                return false;
            }

            redirectInfo.originalFunc(...args);
            return true;
        },

        _privateGetRedirectMap: (apiKey: symbol) => {
            if (apiKey !== PRIVATE_API_KEY) {
                throw Error(PRIVATE_API_KEY.description);
            }
            return redirectMap;
        },
    };

    return redirectHandle;
}

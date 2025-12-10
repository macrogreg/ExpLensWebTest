//

import { type ConsoleFuncName, createVirtualConsole, redirectConsole } from "../sysutil/ConsoleRedirect";
import { type OperationsTracker } from "../models/OperationsTracker";
import { formatValueSimple } from "src/util/format_util";
import { EventLevelKind, formatEventLevelCaptureKind } from "../models/EventLevelKind";

export type ConsoleCaptureHandle = {
    isCancelled: () => boolean;
    /** The cancel() function may be called several times, but the cancellation can obviously occur only
     * once. It returns `true` on the first call the the capturing is actually cancelled, and `false` otherwise. */
    cancel: () => boolean;
    invokeOriginalFunc: (funcName: ConsoleFuncName, ...args: unknown[]) => boolean;
};

/** @internal */
export function formatCaptureBeginMessage(captureKindIcon: string, captureKindDescr: string) {
    return ` *-*-* 🧲${captureKindIcon} ${captureKindDescr} Capture BEGIN *-*-*`;
}

/** @internal */
export function formatCaptureEndMessage(captureKindIcon: string, captureKindDescr: string) {
    return ` *-*-* 🧲${captureKindIcon} ${captureKindDescr} Capture END *-*-*`;
}

const CapturedCallMessage = "console" as const;
const CaptureKindIcon = formatEventLevelCaptureKind(EventLevelKind.ConsoleCapture);
const BeginCaptureMessage = formatCaptureBeginMessage(CaptureKindIcon, "Console Output");
const EndCaptureMessage = formatCaptureEndMessage(CaptureKindIcon, "Console Output");

export function captureConsoleToTracker(tracker: OperationsTracker): ConsoleCaptureHandle {
    //

    // Capture the console before the redirection, so that the tracker can write to it,
    // and it's output does not get redirected circularly:
    const virtualConsole = createVirtualConsole();
    const prevVirtualConsole = tracker.config.virtualConsole;
    tracker.config.virtualConsole = virtualConsole;

    // Redirect console calls so that they form data to the tracker, but still write to the console
    const underlyingRedirHndl = redirectConsole(
        (consFN, ...args) => {
            const eventLevel = mapConsoleFuncToEventKind(consFN);
            const message = `${CapturedCallMessage}.${consFN}`;

            let info;
            if (args.length === 0) {
                info = "-no-args";
            } else {
                const argStr = formatValueSimple(args[0]);
                info = `arg1: ${argStr}; arg count: ${args.length}`;
            }

            tracker.observeEvent(eventLevel, message, info, ...args);
        },
        { invokeOriginals: true }
    );

    // Log that capturing started. Capturing is already active, so this will appear in both, console and tracker.
    console.warn(BeginCaptureMessage);

    // Create a handle that can be used to cancel the capture:
    const captureHandle = {
        isCancelled: () => underlyingRedirHndl.isCancelled(),

        cancel: (): boolean => {
            if (underlyingRedirHndl.isCancelled()) {
                return false;
            }

            // Log that capturing is ending. Capturing is still active, so this will appear in both, console and tracker.
            console.warn(EndCaptureMessage);

            // Stop redirection:
            const hasCanceled = underlyingRedirHndl.cancel();

            // Restore tracker's console to whatever it was before:
            if (hasCanceled && tracker.config.virtualConsole === virtualConsole) {
                tracker.config.virtualConsole = prevVirtualConsole;
            } else {
                const msg =
                    "ConsoleCaptureHandle.cancel(): Original `virtualConsole` of the tracker was not restored" +
                    " because the current virtualConsole is not the one installed by this ConsoleCaptureHandle." +
                    " Was the console redirected multiple times?";
                tracker.observeEvent(EventLevelKind.Wrn, msg);
                virtualConsole.warn(msg);
            }

            return hasCanceled;
        },

        invokeOriginalFunc: (funcName: ConsoleFuncName, ...args: unknown[]) => {
            return underlyingRedirHndl.invokeOriginalFunc(funcName, ...args);
        },
    };

    return captureHandle;
}

const mapConsoleFuncToEventKind = (fn: ConsoleFuncName): EventLevelKind => {
    switch (fn) {
        case "error":
            return EventLevelKind.Err | EventLevelKind.ConsoleCapture;
        case "warn":
            return EventLevelKind.Wrn | EventLevelKind.ConsoleCapture;
        case "log":
            return EventLevelKind.Suc | EventLevelKind.ConsoleCapture;
        default:
            return EventLevelKind.Inf | EventLevelKind.ConsoleCapture;
    }
};

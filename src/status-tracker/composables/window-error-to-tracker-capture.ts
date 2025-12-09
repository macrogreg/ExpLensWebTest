//

import { type OperationsTracker } from "../models/OperationsTracker";
import { errorTypeMessageString, errorTypeString, formatValueSimple } from "src/util/format_util";
import { EventLevelKind, formatEventLevelCaptureKind } from "../models/EventLevelKind";
import { formatCaptureBeginMessage, formatCaptureEndMessage } from "./console-to-tracker-capture";

export type WindowErrCaptureHandle = {
    isCancelled: () => boolean;
    /** The cancel() function may be called several times, but the cancellation can obviously occur only
     * once. It returns `true` on the first call the the capturing is actually cancelled, and `false` otherwise. */
    cancel: () => boolean;
    setSuppressHandlingResizeObserverLoopErrors: (suppress: boolean) => void;
};

const CaptureKindIcon = formatEventLevelCaptureKind(EventLevelKind.WindowErrCapture);
const BeginCaptureMessage = formatCaptureBeginMessage(CaptureKindIcon, "Window Error");
const EndCaptureMessage = formatCaptureEndMessage(CaptureKindIcon, "Window Error");

export function captureWindowErrorsToTracker(
    tracker: OperationsTracker,
    options: { errors: boolean; unhandledRejection: boolean } = { errors: true, unhandledRejection: true }
): WindowErrCaptureHandle {
    const captureOptions = { ...options };

    let suppressHandlingResizeObserverLoopErrors = false;

    const errorEventHandler = (event: ErrorEvent) => {
        const evTyp = "type" in event ? event.type : "UnknownEventType";
        const evMsg = "message" in event ? event.message : "<No Message>";
        const evDesc = `Unhandled error observed in window ('${evTyp}': '${evMsg}').`;

        const errDesc = "error" in event ? errorTypeMessageString(event.error) : undefined;
        const trackEvKind = EventLevelKind.Err | EventLevelKind.WindowErrCapture;

        if (accumulator_ResizeObserverLoopCommonError.isApplicable(event)) {
            if (suppressHandlingResizeObserverLoopErrors) {
                return;
            }

            const acc = accumulator_ResizeObserverLoopCommonError.getAccumulator(tracker);
            acc.observeEvent(trackEvKind, evDesc, errDesc, event);
            return;
        }

        tracker.observeEvent(trackEvKind, evDesc, errDesc, event);
    };

    const asyncErrorEventHandler = (event: PromiseRejectionEvent) => {
        const evTyp = "type" in event ? event.type : "UnknownEventType";

        const hasReason = "reason" in event;
        const reasonStr = hasReason ? errorTypeString(event.reason) : "<No Reason>";

        const evDesc = `Unhandled Promise rejection observed in window (${reasonStr}).`;

        tracker.observeEvent(
            EventLevelKind.Err | EventLevelKind.WindowErrCapture,
            evDesc,
            hasReason ? formatValueSimple(event.reason) : evTyp,
            {
                reasonInfo: hasReason ? event.reason : undefined,
                eventInfo: event,
            }
        );
    };

    if (captureOptions.errors) {
        window.addEventListener("error", errorEventHandler, true);
    }

    if (captureOptions.unhandledRejection) {
        window.addEventListener("unhandledrejection", asyncErrorEventHandler);
    }

    // Log that capturing started.
    console.warn(BeginCaptureMessage);

    // Create a handle that can be used to cancel the capture:
    let isCaptureCancelled = false;
    const captureHandle = {
        isCancelled: () => isCaptureCancelled,

        cancel: (): boolean => {
            if (isCaptureCancelled) {
                return false;
            }

            // Log that capturing is ending.
            console.warn(EndCaptureMessage);

            // Stop redirection:
            if (captureOptions.unhandledRejection) {
                window.removeEventListener("unhandledrejection", asyncErrorEventHandler);
            }
            if (captureOptions.errors) {
                window.removeEventListener("error", errorEventHandler, true);
            }
            isCaptureCancelled = true;

            return true;
        },

        setSuppressHandlingResizeObserverLoopErrors: (suppress: boolean) => {
            suppressHandlingResizeObserverLoopErrors = suppress;
        },
    };

    return captureHandle;
}

const accumulator_ResizeObserverLoopCommonError = {
    privates: {
        expectedMessage: "ResizeObserver loop completed with undelivered notifications." as const,
        accumulationPeriodMsec: 5000 as const,
        suppressPerPeriodThreshold: 5 as const,
        observeInitialEvent: false as const,

        currentAccumulator: null as null | ReturnType<typeof createEventAccumulator>,
    },

    isApplicable: (errorEvent: ErrorEvent) => {
        return (
            errorEvent &&
            "message" in errorEvent &&
            errorEvent.message === accumulator_ResizeObserverLoopCommonError.privates.expectedMessage
        );
    },

    getAccumulator: (tracker: OperationsTracker) => {
        const currAcc = accumulator_ResizeObserverLoopCommonError.privates.currentAccumulator;
        if (currAcc) {
            return currAcc;
        }

        const newAcc = createEventAccumulator(
            tracker,
            accumulator_ResizeObserverLoopCommonError.privates.observeInitialEvent
        );

        setTimeout(() => {
            accumulator_ResizeObserverLoopCommonError.privates.currentAccumulator = null;

            const configThreshold = accumulator_ResizeObserverLoopCommonError.privates.suppressPerPeriodThreshold;

            // If we display the 1st event immediately, then total number of events that trigger display is +1:
            const suppressionThreshold =
                configThreshold + (accumulator_ResizeObserverLoopCommonError.privates.observeInitialEvent ? 1 : 0);

            if (newAcc.countEvents <= suppressionThreshold) {
                return;
            }

            const lastEv = newAcc.lastEvent!;
            const prdStr = accumulator_ResizeObserverLoopCommonError.privates.accumulationPeriodMsec.toLocaleString();

            tracker.observeEvent(
                lastEv.kind,
                `Multiple throttled & accumulated events (${newAcc.countEvents})`,
                `${newAcc.countEvents} events of the same kind occurred and were throttled` +
                    ` over a period of approx. ${prdStr} msec. Last event is shown.`,
                { eventInfo: lastEv.eventDescr, errorInfo: lastEv.errorDescr, moreInfo: lastEv.moreInfo }
            );
        }, accumulator_ResizeObserverLoopCommonError.privates.accumulationPeriodMsec);

        accumulator_ResizeObserverLoopCommonError.privates.currentAccumulator = newAcc;
        return newAcc;
    },
};

function createEventAccumulator(tracker: OperationsTracker, observeInitialEvent: boolean) {
    const newAcc = {
        countEvents: 0,

        lastEvent: undefined as
            | undefined
            | {
                  kind: EventLevelKind;
                  eventDescr: string;
                  errorDescr: string | undefined;
                  moreInfo: unknown[];
              },

        observeEvent: (
            kind: EventLevelKind,
            eventDescr: string,
            errorDescr: string | undefined,
            ...moreInfo: unknown[]
        ) => {
            if (newAcc.countEvents === 0) {
                newAcc.countEvents = 1;
                if (observeInitialEvent) {
                    newAcc.lastEvent = undefined;
                    tracker.observeEvent(kind, eventDescr, errorDescr, ...moreInfo);
                } else {
                    newAcc.lastEvent = { kind, eventDescr, errorDescr, moreInfo };
                }
            } else {
                newAcc.countEvents++;
                newAcc.lastEvent = { kind, eventDescr, errorDescr, moreInfo };
            }
        },
    };

    return newAcc;
}

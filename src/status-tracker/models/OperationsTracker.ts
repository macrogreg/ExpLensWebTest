import { DelayPromise } from "src/util/DelayPromise";
import { TrackedOperation } from "./TrackedOperation";
import { createRandomLetters, RotatingIdGenerator } from "src/util/id_util";
import type { VirtualConsole } from "../sysutil/ConsoleRedirect";
import { EventLevelKind, formatEventLevelKind } from "./EventLevelKind";

const FLAG_AVOID_LOGGING_TO_CONSOLE_FOR_CAPTURED_CONSOLE_OUTPUT = true as const;

export interface ActiveOpsInfo {
    readonly iterator: IterableIterator<[number, TrackedOperation]>;
    readonly count: number;
}

export enum LogEntryType {
    Date = 1,
    OpStart = 2,
    OpEnd = 3,
    OpInfo = 4,
    OpErrNote = 5,
}

export type LogEntry = {
    readonly type: LogEntryType;
    readonly opId: string | null;
    readonly entry: string;
};

export interface OperationsListener {
    notifyLogEntryEmitted(entry: LogEntry): void;
    notifyLogEntriesDeleted(removedEntries: LogEntry[], replacementEntries: LogEntry[] | null): void;
    notifyLogEntriesRevised(newLog: LogEntry[]): void;
    notifyActiveOpsStackUpdated(acviteOps: ActiveOpsInfo): void;
}

export type OperationsTrackerConfig = {
    operationsListener: OperationsListener | null;
    writeToConsole: boolean;
    virtualConsole: VirtualConsole | null;
    logBufferSize: number;
    logBufferCleanStep: number;
    eventDisplayDurationMSec: number;
};

const OperationsTrackerConfigDefaults = Object.freeze({
    operationsListener: null,
    writeToConsole: true,
    virtualConsole: null,
    logBufferSize: 105_000,
    logBufferCleanStep: 10_000,
    eventDisplayDurationMSec: 3_000,
});

export const OPERATION_ID_FORMAT_MIN_DIGIT_COUNT = 4 as const;

export class OperationsTracker {
    readonly #sessionId: string = createRandomLetters(3, "upper");

    readonly #operationIdGenerator = new RotatingIdGenerator(9999999, 1).setMinFormatDigitCount(
        OPERATION_ID_FORMAT_MIN_DIGIT_COUNT
    );

    readonly #activeOps: Array<TrackedOperation> = [];
    readonly #loggedOps: Array<LogEntry> = [];
    #lastLoggedTs = new Date(2000, 1, 1);
    #trimmingLogBufferInProgress = false;

    readonly config: OperationsTrackerConfig & { Defaults: OperationsTrackerConfig } = {
        Defaults: OperationsTrackerConfigDefaults,
        operationsListener: OperationsTrackerConfigDefaults.operationsListener,
        writeToConsole: OperationsTrackerConfigDefaults.writeToConsole,
        virtualConsole: OperationsTrackerConfigDefaults.virtualConsole,
        logBufferSize: OperationsTrackerConfigDefaults.logBufferSize,
        logBufferCleanStep: OperationsTrackerConfigDefaults.logBufferCleanStep,
        eventDisplayDurationMSec: OperationsTrackerConfigDefaults.eventDisplayDurationMSec,
    };

    get sessionId(): string {
        return this.#sessionId;
    }

    get activeOps(): ActiveOpsInfo {
        return {
            iterator: this.#activeOps.entries(),
            count: this.#activeOps.length,
        };
    }

    get loggedOps(): ReadonlyArray<LogEntry> {
        return this.#loggedOps;
    }

    startOperation = (name: string | string[], ...info: unknown[]): TrackedOperation => {
        if (Array.isArray(name)) {
            name = name.join(" ");
        }

        const parent = this.getCurrentTopContainer();
        const isContainer = true;
        const opId = this.#operationIdGenerator.createAndFormatNextId();
        const icon = null;
        const avoidConsole = false;

        const op = new TrackedOperation(this, opId, name, parent, isContainer, icon, avoidConsole, info);

        return op;
    };

    observeEvent = (
        kind: EventLevelKind,
        name: string | string[],
        eventInfo: unknown = undefined,
        ...moreInfo: unknown[]
    ): EventDisplayHandle => {
        const parent = this.getCurrentTopContainer();
        const isContainer = false;
        const opId = this.#operationIdGenerator.createAndFormatNextId();
        const icon = formatEventLevelKind(kind);

        let avoidConsole = false;
        if (FLAG_AVOID_LOGGING_TO_CONSOLE_FOR_CAPTURED_CONSOLE_OUTPUT) {
            avoidConsole = EventLevelKind.is(kind, EventLevelKind.ConsoleCapture);
        }

        if (Array.isArray(name)) {
            name = name.join(" ");
        }

        const eventInfoArr =
            eventInfo === undefined ? [] : eventInfo && Array.isArray(eventInfo) ? eventInfo : [eventInfo];

        const op = new TrackedOperation(this, opId, name, parent, isContainer, icon, avoidConsole, eventInfoArr);

        if (moreInfo !== undefined && moreInfo.length > 0) {
            op.addInfo(moreInfo);
        }

        op.setSuccess();

        const hndl = new EventDisplayHandle(op, this.config.eventDisplayDurationMSec);
        return hndl;
    };

    observeError = (context: string | string[], error: unknown, ...moreInfo: unknown[]): EventDisplayHandle => {
        return this.observeEvent(EventLevelKind.Err, context, error, moreInfo);
    };

    getCurrentTopContainer = (): TrackedOperation | null => {
        let op;

        for (let i = this.#activeOps.length - 1; i >= 0; i--) {
            op = this.#activeOps[i];
            if (op && op.isContainer) {
                return op;
            }
        }

        return null;
    };

    /** Typically there is on the order of 0 - 10 active ops. A linear search will be no slower than a lookup table. */
    #indexOfActiveOps = (operation: TrackedOperation): number => {
        for (let i = this.#activeOps.length - 1; i >= 0; i--) {
            if (this.#activeOps[i] === operation) {
                return i;
            }
        }

        return -1;
    };

    /** Typically there is on the order of 0 - 10 active ops. A linear search will be no slower than a lookup table. */
    #indexOfActiveOpsByIdStr = (operationIdStr: string): number => {
        for (let i = this.#activeOps.length - 1; i >= 0; i--) {
            if (this.#activeOps[i]?.operationIdStr === operationIdStr) {
                return i;
            }
        }

        return -1;
    };

    #logDateIfChanged = (date: Date, avoidConsole: boolean) => {
        const isDateChanged =
            this.#lastLoggedTs.getFullYear() !== date.getFullYear() ||
            this.#lastLoggedTs.getMonth() !== date.getMonth() ||
            this.#lastLoggedTs.getDate() !== date.getDate();

        if (!isDateChanged) {
            return;
        }

        const dateStr = formatDateLogEntry(date);
        const logEntry = { type: LogEntryType.Date, opId: null, entry: dateStr };
        this.#lastLoggedTs = date;

        this.#loggedOps.push(logEntry);
        this.config.operationsListener?.notifyLogEntryEmitted(logEntry);

        if (this.config.writeToConsole && !avoidConsole) {
            (this.config.virtualConsole ?? console).log(logEntry.entry);
        }
    };

    // Called by `TrackedOperation`. Do not call directly.
    /** @internal */
    logLine = (entryData: string, timestamp: Date, operation: TrackedOperation, entryType: LogEntryType) => {
        this.#logDateIfChanged(timestamp, operation.avoidConsole);

        const logEntry = { type: entryType, opId: operation.operationIdStr, entry: entryData };

        this.#loggedOps.push(logEntry);
        this.config.operationsListener?.notifyLogEntryEmitted(logEntry);

        if (this.config.writeToConsole && !operation.avoidConsole) {
            (this.config.virtualConsole ?? console).log(logEntry.entry);
        }

        if (this.#loggedOps.length > this.config.logBufferSize) {
            this.#trimLogBuffer();
        }
    };

    #trimLogBuffer = () => {
        // Need to protect agains recursive calls to allow logging during trimming:
        if (this.#trimmingLogBufferInProgress) {
            return;
        }
        this.#trimmingLogBufferInProgress = true;

        const opTrimLog = this.startOperation("Trimming Log Buffer", { logEntries: this.#loggedOps.length });
        try {
            const removedEntries = this.#loggedOps.splice(0, this.config.logBufferCleanStep);

            let lastDateEntry = null;
            for (let e = removedEntries.length - 1; e >= 0; e--) {
                const entry = removedEntries[e];
                if (entry && entry.type === LogEntryType.Date) {
                    lastDateEntry = entry;
                    break;
                }
            }

            let replacementEntries = null;
            if (lastDateEntry) {
                replacementEntries = [lastDateEntry];
                this.#loggedOps.unshift(lastDateEntry);
            }

            opTrimLog.addInfo("Notifying listener.", {
                removedEntries: removedEntries.length,
                replacementEntries: replacementEntries?.length ?? "null",
            });
            this.config.operationsListener?.notifyLogEntriesDeleted(removedEntries, replacementEntries);

            this.#trimmingLogBufferInProgress = false;
            opTrimLog.setSuccess({ loggedOps: this.#loggedOps.length });
        } catch (err) {
            this.#trimmingLogBufferInProgress = false;
            opTrimLog.setFailure(err, { logEntries: this.#loggedOps.length });
        }
    };

    // Called by `TrackedOperation`. Do not call directly.
    /** @internal */
    logErrors = (operation: TrackedOperation, errors: Error[], logTimestamp: Date): void => {
        if (operation.avoidConsole) {
            return;
        }

        const noticeStr = operation.formatErrorNotice(logTimestamp, errors, this.config.writeToConsole);
        this.logLine(noticeStr, logTimestamp, operation, LogEntryType.OpErrNote);

        if (this.config.writeToConsole && !operation.avoidConsole) {
            for (const [i, err] of errors.entries()) {
                const opInfo = `(${operation.operationDescr})`;
                const errNum = `(Err ${i + 1} of ${errors.length})`;
                (this.config.virtualConsole ?? console).error(opInfo, errNum, err);
            }
        }
    };

    // Called by `TrackedOperation`. Do not call directly.
    /** @internal */
    addToActiveOpsStack = (operation: TrackedOperation): void => {
        this.#activeOps.push(operation);

        this.config.operationsListener?.notifyActiveOpsStackUpdated(this.activeOps);
    };

    // Called by `TrackedOperation`. Do not call directly.
    /** @internal */
    removeFromActiveOpsStack = (operation: TrackedOperation): void => {
        const activeOpsLen = this.#activeOps.length;

        if (activeOpsLen < 1) {
            (this.config.virtualConsole ?? console).error(
                "OperationsTracker.#removeFromActiveOpsStack(..): " +
                    `Trying to remove operation '${operation.operationIdStr}', but there are no activeOps.`
            );
            return;
        }

        const opInd = this.#indexOfActiveOps(operation);
        if (opInd < 0) {
            (this.config.virtualConsole ?? console).error(
                "OperationsTracker.#removeFromActiveOpsStack(..): " +
                    `Trying to remove operation '${operation.operationIdStr}', but it is not in activeOps` +
                    ` (length=${activeOpsLen}).`
            );
            return;
        }

        if (opInd === activeOpsLen - 1) {
            this.#activeOps.pop();
        } else {
            this.#activeOps.splice(opInd, 1);
        }

        this.config.operationsListener?.notifyActiveOpsStackUpdated(this.activeOps);
    };

    dropLogEntriesForCompletedOps = () => {
        const opRemComplOps = this.startOperation("Dropping Log Entries for Completed Operations");
        if (this.#loggedOps.length === 0) {
            opRemComplOps.setSuccess("No log entries, nothing to do.");
            return;
        }

        const isOperationComplete = (opL: LogEntry) => !opL.opId || this.#indexOfActiveOpsByIdStr(opL.opId) < 0;

        const ImpossibleOpId = "__impossible_id_";

        try {
            let totalDropCount = 0;

            // We find the first complete op and all complete ops that follow.
            // Then we drop them all and start again until we no longer find complete ops.
            let dropFrom = 0;
            while (true) {
                // Skip incomplete ops, serach for the first complete one:
                let lastCheckId = ImpossibleOpId;
                while (dropFrom < this.#loggedOps.length) {
                    const loggedOp = this.#loggedOps[dropFrom];

                    // This should never be, but if it is, drop it:
                    if (!loggedOp) {
                        break;
                    }

                    // If last check op was the same, no need to check again:
                    if (loggedOp.opId === lastCheckId) {
                        dropFrom++;
                        continue;
                    }

                    if (isOperationComplete(loggedOp)) {
                        break;
                    }

                    lastCheckId = loggedOp.opId ?? ImpossibleOpId;
                    dropFrom++;
                }

                // We reached the end and did not find any completed ops:
                if (dropFrom >= this.#loggedOps.length) {
                    break;
                }

                // Find all completed ops starting from `dropFrom`:
                let dropTo = dropFrom;
                lastCheckId = ImpossibleOpId;
                while (dropTo < this.#loggedOps.length) {
                    const loggedOp = this.#loggedOps[dropTo];

                    if (!loggedOp) {
                        dropTo++;
                        continue;
                    }

                    // If last check op was the same, no need to check again:
                    if (loggedOp.opId === lastCheckId) {
                        dropTo++;
                        continue;
                    }

                    if (!isOperationComplete(loggedOp)) {
                        break;
                    }

                    lastCheckId = loggedOp.opId ?? ImpossibleOpId;
                    dropTo++;
                }

                const dropCount = dropTo - dropFrom;

                // If there is only one entry to drop and it's a date, do not drop, we are done:
                if (dropCount === 1 && this.#loggedOps[dropFrom]?.type === LogEntryType.Date) {
                    break;
                }

                totalDropCount += dropCount;

                // Log and drop the entries:
                opRemComplOps.addInfo("Dropping a range of entries", {
                    dropFrom,
                    dropTo,
                    dropCount,
                    totalDropCount,
                });

                const droppedEntries = this.#loggedOps.splice(dropFrom, dropCount);

                // We may have deleted date entries. Restore one:
                if (dropFrom < this.#loggedOps.length && this.#loggedOps[dropFrom]?.type !== LogEntryType.Date) {
                    for (let e = droppedEntries.length - 1; e >= 0; e--) {
                        const dropped = droppedEntries[e];
                        if (dropped && dropped.type === LogEntryType.Date) {
                            this.#loggedOps.splice(dropFrom, 0, dropped);
                            break;
                        }
                    }
                }

                // Repeat the whole thing again: skip incomplete find complete, drop, repeat.
            }

            opRemComplOps.addInfo("Updating listener");
            this.config.operationsListener?.notifyLogEntriesRevised(this.#loggedOps);

            opRemComplOps.setSuccess({ totalDropCount });
        } catch (err) {
            opRemComplOps.setFailure(err);
        }
    };

    createBulkDummyOperations = async (count: number): Promise<void> => {
        const opCreateBulk = this.startOperation("Creating Bulk Dummy Operations", { count });
        await DelayPromise.Run(500);

        const lengthBreak = [1000, 1500] as const;

        const lengthPhase1 = 4500;
        const periodBreak = [1000, 3000] as const;

        let lastBreak = opCreateBulk.getDurationMSec();
        const phaseBreaks = [0, 0];

        for (let i = 1; i <= count; i++) {
            const isCheckIteration = i % 50 === 0;
            if (isCheckIteration) {
                const durNow = opCreateBulk.getDurationMSec();
                const phase = durNow <= lengthPhase1 ? 0 : 1;

                if (durNow - lastBreak > periodBreak[phase]) {
                    opCreateBulk.addInfo({ completed: i, breakType: "Long", breakLength: lengthBreak });
                    await DelayPromise.Run(lengthBreak[phase]);
                    phaseBreaks[phase] = (phaseBreaks[phase] ?? 0) + 1;

                    lastBreak = opCreateBulk.getDurationMSec();
                }
            }

            const op = this.startOperation(`Bulk Dummy operation ${i}.`, {
                d: opCreateBulk.getDurationStr(),
                c: isCheckIteration,
            });
            op.setSuccess();
        }
        opCreateBulk.setSuccess(phaseBreaks);
    };

    // createBulkDummyOperations = async (count: number): Promise<void> => {
    //     const opCreateBulk = this.startOperation("createBulkDummyOperations", { count });
    //     for (let i = 1; i <= count; i++) {
    //         const op = this.startOperation(`Bulk Dummy operation ${i}.`, opCreateBulk.getDurationStr());
    //         op.setSuccess();

    //         if (i % 6000 === 0) {
    //             opCreateBulk.addInfo({ completed: i, asyncBreak: "300ms" });
    //             await DelayPromise.Run(300);
    //         } else if (i % 3000 === 0) {
    //             opCreateBulk.addInfo({ completed: i, asyncBreak: "100ms" });
    //             await DelayPromise.Run(100);
    //         } else if (i % 1500 === 0) {
    //             opCreateBulk.addInfo({ completed: i, asyncBreak: "nextTick" });
    //             await nextTick();
    //         }
    //     }
    //     opCreateBulk.setSuccess();
    // };
}

export class EventDisplayHandle {
    readonly #operation: TrackedOperation;
    readonly #delay: DelayPromise;

    // `new EventHandle(..)` should only be called by `OperationsTracker.observeEvent(..)`. Do not call directly.
    /** @internal */
    constructor(operation: TrackedOperation, displayDurationMSec: number) {
        this.#operation = operation;
        this.#delay = new DelayPromise(displayDurationMSec);
        void this.#delay.promise().finally(this.#complete);
        void this.#delay.start();
    }

    delay = (): DelayPromise => this.#delay;
    completion = (): Promise<void> => this.#delay.promise() as unknown as Promise<void>;
    isCompleted = (): boolean => this.#delay.isCompleted();

    #complete = () => {
        this.#operation.removeFromActiveOpsStack();
    };
}

const DateLogEntryPrefix = " ## Date: ";
const DateLogEntryPostfix = " ##";

function formatDateLogEntry(date: Date) {
    const dateStr = formatDate(date);
    const logEntry = DateLogEntryPrefix + dateStr + DateLogEntryPostfix;
    return logEntry;
}

function formatDate(date: Date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");

    const wkd = date.toLocaleDateString("en-US", { weekday: "short" });

    return `${yyyy}-${mm}-${dd}, ${wkd}`;
}

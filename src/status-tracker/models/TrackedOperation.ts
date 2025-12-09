import { LogEntryType, type OperationsTracker, OPERATION_ID_FORMAT_MIN_DIGIT_COUNT } from "./OperationsTracker";
import { PromiseCompletionSource } from "src/util/PromiseCompletionSource";
import type { FormatValueOptions } from "src/util/format_util";
import { formatValue, NewLineString } from "src/util/format_util";
import { Stopwatch } from "src/util/Stopwatch";
import { countDigits } from "src/util/id_util";

export class TrackedOperation {
    readonly #tracker: OperationsTracker;
    readonly #startTimestamp: Date;
    readonly #timer: Stopwatch;
    readonly #operationIdNum: number;
    readonly #operationIdStr: string;
    readonly #extraBaseIndentSpaces: number;
    readonly #operationDescr: string;
    readonly #name: string;
    readonly #parent: TrackedOperation | null;
    readonly #nestDepth: number;
    readonly #isContainer: boolean;
    readonly #avoidConsole: boolean;
    readonly #info: Array<unknown> = [];

    #isSucceeded: boolean;
    #isFailed: boolean;
    #endTimestamp: Date | undefined;
    #completion: PromiseCompletionSource<void> | null;

    readonly #activeOpsStackEntry: string;

    // `new TrackedOperation(..)` should only be called by `OperationsTracker.startOperation(..)`. Do not call directly.
    /** @internal */
    constructor(
        tracker: OperationsTracker,
        operationId: { idNum: number; idStr: string },
        name: string,
        parent: TrackedOperation | null,
        isContainer: boolean,
        iconStr: string | null,
        avoidConsole: boolean,
        info: unknown[]
    ) {
        this.#tracker = tracker;
        this.#operationIdNum = operationId.idNum;
        this.#operationIdStr = `${tracker.sessionId}.${operationId.idStr}`;
        this.#name = formatOperationName(name);
        this.#operationDescr = `${this.operationIdStr}|'${this.name}'`;
        this.#parent = parent;
        this.#nestDepth = parent ? parent.#nestDepth + 1 : 0;
        this.#isContainer = isContainer;
        this.#avoidConsole = avoidConsole;

        this.#isSucceeded = false;
        this.#isFailed = false;
        this.#endTimestamp = undefined;
        this.#completion = null;

        this.#extraBaseIndentSpaces = Math.max(
            0,
            countDigits(this.#operationIdNum) - OPERATION_ID_FORMAT_MIN_DIGIT_COUNT
        );

        const hasInfo = hasData(info);
        if (hasInfo) {
            // Do not log undefined start status, but do log null.
            this.#info.push(info);
        }

        this.#startTimestamp = new Date();
        this.#timer = Stopwatch.Run();

        const formatted = this.#formatStartEntries(iconStr, info);
        this.#activeOpsStackEntry = formatted.activeOpsStackEntry;

        const parentInfo = {
            parentOp: this.#parent === null ? null : this.#parent.#operationDescr,
        };

        // For events, if there is no event info, lift parent info into event info:
        const liftParentInfo = !this.#isContainer && !hasData(info);
        if (liftParentInfo) {
            formatted.logEntry = this.#formatStartEntries(iconStr, [parentInfo]).logEntry;
        }

        this.#tracker.logLine(formatted.logEntry, this.#startTimestamp, this, LogEntryType.OpStart);

        if (!liftParentInfo) {
            const parentInfoLogEntry = this.#formatInfoEntry(this.#startTimestamp, [parentInfo]);
            this.#tracker.logLine(parentInfoLogEntry, this.#startTimestamp, this, LogEntryType.OpInfo);
        }

        const errors = getErrors(info);
        if (errors) {
            this.#tracker.logErrors(this, errors, this.#startTimestamp);
        }

        this.#tracker.addToActiveOpsStack(this);
    }

    get startTimestamp(): Date {
        return this.#startTimestamp;
    }

    get endTimestamp(): Date | undefined {
        return this.#endTimestamp;
    }

    get operationId(): number {
        return this.#operationIdNum;
    }

    get operationIdStr(): string {
        return this.#operationIdStr;
    }

    get name(): string {
        return this.#name;
    }

    get operationDescr(): string {
        return this.#operationDescr;
    }

    get parent(): TrackedOperation | null {
        return this.#parent;
    }

    get hasParent(): boolean {
        return this.#parent !== null;
    }

    get nestDepth(): number {
        return this.#nestDepth;
    }

    get isContainer(): boolean {
        return this.#isContainer;
    }

    get avoidConsole(): boolean {
        return this.#avoidConsole;
    }

    get isCompleted(): boolean {
        return this.#isSucceeded || this.#isFailed;
    }

    get isSucceeded(): boolean {
        return this.#isSucceeded;
    }

    get isFailed(): boolean {
        return this.#isFailed;
    }

    get completion(): Promise<void> {
        if (!this.#completion) {
            this.#completion = new PromiseCompletionSource();
            if (this.isCompleted) {
                this.#completion.tryResolve();
            }
        }

        return this.#completion.promise();
    }

    get info(): ReadonlyArray<unknown> {
        return this.#info;
    }

    get activeOpsStackEntry(): string {
        return this.#activeOpsStackEntry;
    }

    setSuccess = (...info: unknown[]): boolean => {
        return this.setCompleted(true, info);
    };

    setFailure = (...info: unknown[]): boolean => {
        return this.setCompleted(false, info);
    };

    setFailureAndRethrow = (error: unknown, ...moreInfo: unknown[]): never => {
        const errorRethrownMsg = "The error will be rethrown and will propagate up the stack." as const;
        this.setFailure(error, errorRethrownMsg, ...moreInfo);
        throw error;
    };

    setCompleted = (isSuccess: boolean, info?: unknown[]): boolean => {
        if (this.isCompleted) {
            return false;
        }

        this.#timer.stop();
        this.#endTimestamp = new Date();

        if (hasData(info)) {
            this.#info.push(info);
        }

        if (isSuccess) {
            this.#isSucceeded = true;
        } else {
            this.#isFailed = true;
        }

        const errors = getErrors(info);
        if (errors) {
            this.#tracker.logErrors(this, errors, this.#endTimestamp);
        }

        const logEntry = this.#formatEndEntry(info);
        this.#tracker.logLine(logEntry, this.#endTimestamp, this, LogEntryType.OpEnd);

        if (this.#completion) {
            this.#completion.tryResolve();
        }

        if (this.#isContainer) {
            this.#tracker.removeFromActiveOpsStack(this);
        }

        return true;
    };

    // `removeFromActiveOpsStack(..)` should only be called by `EventDisplayHandle.#complete(..)`. Do not call directly.
    /** @internal */
    removeFromActiveOpsStack = () => {
        this.#tracker.removeFromActiveOpsStack(this);
    };

    addInfo = (...data: unknown[]): void => {
        const logTimestamp = new Date();
        this.#info.push(data);

        const logEntry = this.#formatInfoEntry(logTimestamp, data);
        this.#tracker.logLine(logEntry, logTimestamp, this, LogEntryType.OpEnd);

        const errors = getErrors(data);
        if (errors) {
            this.#tracker.logErrors(this, errors, logTimestamp);
        }
    };

    getDurationMSec = (): number => this.#timer.elapsedMSec();
    getDurationStr = (): string => this.#timer.elapsedStr();
    copyTimer = (): Stopwatch => this.#timer.clone();

    /*
 ## Date: 2025-05-28, Wed ##
17:42:00.123|LOR.2117|STRT: Some Operation ("info string") {
17:42:00.236|LOR.2117|INFO:     Some Operation: 42
17:42:00.236|LOR.2117|INFO:     Some Operation: [
                                     "hello"
                                 ]
17:43:00.112|LOR.2117|INFO:     Some Operation: {
                                     prop: hello
                                 }
17:43:00.123|LOR.2117|SUCS: } Some Operation <01:06:03.123> ({
                                 info: value
                             })
    */

    #formatPrefixAndIndent(time: string, opTransition: string, indent: string): string {
        const prefixWitnIndentAndName = `${time}|${this.#operationIdStr}|${opTransition}: ${indent}`;
        return prefixWitnIndentAndName;
    }

    #formatStartEntries = (
        iconStr: string | null,
        info: unknown[]
    ): { activeOpsStackEntry: string; logEntry: string } => {
        const tsStr = formatTime(this.#startTimestamp);
        const tranMon = this.#isContainer ? OperationTransitionMonikers.Start : OperationTransitionMonikers.Event;
        const indent = formatIndent(this.#nestDepth);

        const hasInfo = hasData(info);
        let infoStr = "";
        if (hasInfo) {
            infoStr = formatInfoData(info, this.#nestDepth, {
                baseIndent: baseFormatIndent(this.#extraBaseIndentSpaces),
                levelIndent: formatIndent(1),
            });
            infoStr = ` (${infoStr})`;
        }

        const name = iconStr === null ? this.#name : iconStr + " " + this.#name;

        const trackStrs = {
            logEntry: `${this.#formatPrefixAndIndent(tsStr, tranMon, indent)}${name}${infoStr} {{`,
            activeOpsStackEntry: `${tsStr}|${name}${infoStr}`,
        };

        return trackStrs;
    };

    #formatInfoEntry = (timestamp: Date, info: unknown[]): string => {
        const tsStr = formatTime(timestamp);
        const tranMon = OperationTransitionMonikers.Info;
        const indent = formatIndent(this.#nestDepth + 1);

        const hasInfo = hasData(info);
        const infoStr = hasInfo
            ? ": " +
              formatInfoData(info, this.#nestDepth + 1, {
                  baseIndent: baseFormatIndent(this.#extraBaseIndentSpaces),
                  levelIndent: formatIndent(1),
              })
            : ".";

        const durationStr = this.getDurationStr();

        const trackStr = `${this.#formatPrefixAndIndent(tsStr, tranMon, indent)}${this.#name} <${durationStr}>${infoStr}`;
        return trackStr;
    };

    #formatEndEntry = (info: unknown[] | undefined): string => {
        if (!this.#endTimestamp) {
            throw new Error("TrackedOperation.#formatEndEntries(..): `#endTimestamp` must be set, but it wasn't.");
        }

        const tsStr = formatTime(this.#endTimestamp);
        const tranMon = this.#isContainer
            ? this.#isSucceeded
                ? OperationTransitionMonikers.Success
                : OperationTransitionMonikers.Fail
            : OperationTransitionMonikers.Event;

        const indent = formatIndent(this.#nestDepth);

        const hasInfo = hasData(info);
        const showOpDets = this.#isContainer || this.#info.length > 0 || hasInfo;

        let opDets = "";
        if (showOpDets) {
            const durationStr = this.getDurationStr();
            let infoStr = "";
            if (hasInfo) {
                infoStr = formatInfoData(info, this.#nestDepth, {
                    baseIndent: baseFormatIndent(this.#extraBaseIndentSpaces),
                    levelIndent: formatIndent(1),
                });
                infoStr = ` (${infoStr})`;
            }

            opDets = ` ${this.#name} <${durationStr}>${infoStr}`;
        }

        const trackStr = `${this.#formatPrefixAndIndent(tsStr, tranMon, indent)}}}${opDets}`;
        return trackStr;
    };

    formatErrorNotice = (timestamp: Date, errors: Error[], isConsoleEnabled: boolean): string => {
        const tsStr = formatTime(timestamp);
        const tranMon = OperationTransitionMonikers.Errors;
        const indent = formatIndent(this.#nestDepth + 1);
        const lineIndent = NewLineString + baseFormatIndent(this.#extraBaseIndentSpaces) + indent;

        const trackStr =
            `${tsStr}|${this.#operationIdStr}|${tranMon}: ${indent}${this.#name}:` +
            ` Specified Info has ${errors.length} Error objects. Data included in log.` +
            (isConsoleEnabled
                ? lineIndent + "Will dump additional details to console.error."
                : lineIndent + "Log-to-console is disabled; enable to dump additional error details.");

        return trackStr;
    };
}

enum OperationTransitionMonikers {
    Start = "STRT",
    Info = "INFO",
    Fail = "FAIL",
    Success = "SUCS",
    Event = "ATTN",
    Errors = "ERRS",
}

function hasData(data: unknown[] | undefined) {
    return data && data.length > 0;
}

//function get...info: unknown[]

function formatOperationName(name: string) {
    if (name === undefined) {
        return "UndefinedName";
    }

    if (name === null) {
        return "NullName";
    }

    name = name.trim();
    if (name.length == 0) {
        return "EmptyName";
    }

    return name;
}

function formatTime(timestamp: Date) {
    const hh = timestamp.getHours().toString().padStart(2, "0");
    const mm = timestamp.getMinutes().toString().padStart(2, "0");
    const ss = timestamp.getSeconds().toString().padStart(2, "0");
    const ms = timestamp.getMilliseconds().toString().padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
}

function formatIndent(level: number) {
    const indentOne = "    ";

    if (level < 1) {
        return "";
    }

    if (level === 1) {
        return indentOne;
    }

    return indentOne.repeat(level);
}

function getErrors(info: unknown): Error[] | null {
    // If info contains any errors in the first layer (shallow), grab them, so that we can dump them to
    // the console in a structured manner:

    if (!info) {
        return null;
    }

    if (info instanceof Error) {
        return [info];
    }

    if (Array.isArray(info)) {
        if (info.length < 1) {
            return null;
        }

        const errs = info.filter((v) => v && v instanceof Error);
        return errs.length > 0 ? errs : null;
    }

    return null;
}

function formatInfoData(info: unknown, indentLevel: number, formOptions: FormatValueOptions): string {
    // If info is an array with exactly one element at index 0, then format that element as if it was not in the array:
    if (info && Array.isArray(info) && info.length === 1 && 0 in info) {
        return formatValue(info[0], indentLevel, formOptions);
    }

    const infoStr = formatValue(info, indentLevel, formOptions);
    return infoStr;
}

function baseFormatIndent(extraSpaces: number) {
    //                        16:33:00.676|NGY.0001|STRT: Operation Name {
    //                        16:34:00.455|NGY.0001|SUCS: } Operation Name
    const BaseFormatIndent = "                            " as const;

    let indent = BaseFormatIndent;
    for (let s = 0; s < extraSpaces; s++) {
        indent = indent + " ";
    }
    return indent;
}

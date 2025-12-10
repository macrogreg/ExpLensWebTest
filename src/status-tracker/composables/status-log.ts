import { ref, shallowReadonly } from "vue";
import type { ActiveOpsInfo, LogEntry } from "../models/OperationsTracker";
import { OperationsTracker } from "../models/OperationsTracker";
import type { ConsoleCaptureHandle } from "./console-to-tracker-capture";
import { captureConsoleToTracker } from "./console-to-tracker-capture";
import { EventLevelKind } from "../models/EventLevelKind";
import type { WindowErrCaptureHandle } from "./window-error-to-tracker-capture";
import { captureWindowErrorsToTracker } from "./window-error-to-tracker-capture";
import { isNullOrWhitespace } from "src/util/string_util";

const FLAG_VALIDATE_LOG_PRUNING = true as const;

export interface StatusLogEntry {
    timestamp: Date;
    message: string;
    getLineString(): string;
}

export const StatusViewTypes = {
    CurrentState: "Current State",
    FullLog: "Full Log",
};

export type StatusViewType = keyof typeof StatusViewTypes;

export const StatusDisplayModes = {
    Always: "Always",
    Never: "Never",
    DuringImportantOperations: "During Important Operations",
};

export type StatusDisplayMode = keyof typeof StatusDisplayModes;

export function rebuildFullLogView(loggedOps: ReadonlyArray<LogEntry>) {
    const view = loggedOps.map((lo) => lo.entry).join("\n");
    return view;
}

const DefaultStatusLogSettingsLocalStorageKey = "StatusLogAndOperationsTracker.Settings" as const;

function saveStateToBrowserLocalStorage(state: typeof statusLogState, storeKey: string): boolean {
    const opStoreLogSettings = statusLogState.tracker.startOperation(
        `Store Status Log settings in Browser Local Storage key "${storeKey}"`
    );

    try {
        if (!("localStorage" in globalThis)) {
            throw new Error("Cannot store statusLogState in localStorage: Storage is not available.");
        }

        if (isNullOrWhitespace(storeKey)) {
            throw new Error(`Cannot store statusLogState in localStorage: storeKey is invalid ("${storeKey}").`);
        }

        const settingsJson = JSON.stringify(
            {
                statusViewType: state.statusViewType.value,
                captureConsole: state.captureConsole.value,
                captureWindowErr: state.captureWindowErr.value,
                writeToConsole: state.writeToConsole.value,
                displayMode: state.displayMode.value,
            },
            undefined,
            "    "
        );

        localStorage.setItem(storeKey, settingsJson);

        opStoreLogSettings.setSuccess();
        return true;
    } catch (err) {
        opStoreLogSettings.setFailure(err);
        return false;
    }
}

function loadStateFromBrowserLocalStorage(state: typeof statusLogState, storeKey: string): boolean {
    const opLoadLogSettings = statusLogState.tracker.startOperation(
        `Load Status Log settings from Browser Local Storage key "${storeKey}"`
    );

    try {
        if (!("localStorage" in globalThis)) {
            throw new Error("Cannot load statusLogState from localStorage: Storage is not available.");
        }

        if (isNullOrWhitespace(storeKey)) {
            throw new Error(`Cannot load statusLogState from localStorage: storeKey is invalid ("${storeKey}").`);
        }

        const settingsJson = localStorage.getItem(storeKey);
        if (settingsJson === null) {
            throw new Error(
                `Cannot load statusLogState from localStorage: Storage has no entry for key "${storeKey}".`
            );
        }

        const settings = JSON.parse(settingsJson);
        if (settings === null) {
            throw new Error(
                `Cannot load statusLogState from localStorage: Parser returned null (JSON="${settingsJson}").`
            );
        }
        if (typeof settings !== "object") {
            throw new Error(
                `Cannot load statusLogState from localStorage: Parser returned a on-object (JSON="${settingsJson}").`
            );
        }

        opLoadLogSettings.addInfo("Loaded settings to be applied:", settings);

        if ("statusViewType" in settings) {
            state.setStatusViewType(settings.statusViewType);
        }

        if ("captureConsole" in settings) {
            state.setCaptureConsole(settings.captureConsole);
        }

        if ("captureWindowErr" in settings) {
            state.setCaptureWindowErr(settings.captureWindowErr);
        }

        if ("writeToConsole" in settings) {
            state.setWriteToConsole(settings.writeToConsole);
        }

        if ("displayMode" in settings) {
            state.setDisplayMode(settings.displayMode);
        }

        opLoadLogSettings.setSuccess();
        return true;
    } catch (err) {
        opLoadLogSettings.setFailure(err);
        return false;
    }
}

function rebuildCurrentStateView(activeOps: ActiveOpsInfo): string {
    let activeOp = activeOps.iterator.next();
    if (activeOp.done) {
        return "";
    }

    let view: string = activeOp.value[1].activeOpsStackEntry;
    activeOp = activeOps.iterator.next();
    while (!activeOp.done) {
        view = activeOp.value[1].activeOpsStackEntry + "\n" + view;
        activeOp = activeOps.iterator.next();
    }

    return view;
}

// Initialization:

// State:

const opTracker = new OperationsTracker();

const statusView = ref<string>("");

const statusViewType = ref<StatusViewType>("CurrentState");
const captureConsole = ref<boolean>(false);
const captureWindowErr = ref<boolean>(false);
const writeToConsole = ref<boolean>(false);

const displayMode = ref<StatusDisplayMode>("DuringImportantOperations");
const isImportantOperationOngoing = ref<boolean>(false);
const isDisplayRequired = ref<boolean>(false);

const localStorageKey = ref<string | undefined>(undefined);

// Private state:

let _consoleCaptureHandle: ConsoleCaptureHandle | null = null;
let _windowErrCaptureHandle: WindowErrCaptureHandle | null = null;

// Getters:

const tracker = () => opTracker;

// Actions:

const setStatusViewType = (viewType: StatusViewType): void => {
    if (statusViewType.value === viewType) {
        return;
    }

    const view =
        viewType === "FullLog" ? rebuildFullLogView(opTracker.loggedOps) : rebuildCurrentStateView(opTracker.activeOps);

    statusViewType.value = viewType;
    statusView.value = view;
};

const setCaptureConsole = (capture: boolean): void => {
    //console.debug(`StatusLogState.setCaptureConsole(${capture}): prevVal=${captureConsole.value}`);

    if (captureConsole.value === capture) {
        return;
    }

    // If there is a stale cancel-capture func, execute it before setting up a new capture:
    if (_consoleCaptureHandle !== null) {
        _consoleCaptureHandle.cancel();
    }

    if (capture === true) {
        _consoleCaptureHandle = captureConsoleToTracker(opTracker);
    } else {
        _consoleCaptureHandle = null;
    }

    //console.debug(`StatusLogState.setCaptureConsole: setting captureConsole.value to ${capture}`);
    captureConsole.value = capture;
};

const setCaptureWindowErr = (capture: boolean): void => {
    //console.debug(`StatusLogState.setCaptureWindowErr(${capture}): prevVal=${captureWindowErr.value}`);

    if (captureWindowErr.value === capture) {
        return;
    }

    // If there is a stale cancel-capture func, execute it before setting up a new capture:
    if (_windowErrCaptureHandle !== null) {
        _windowErrCaptureHandle.cancel();
    }

    if (capture === true) {
        _windowErrCaptureHandle = captureWindowErrorsToTracker(opTracker, { errors: true, unhandledRejection: true });
    } else {
        _windowErrCaptureHandle = null;
    }

    //console.debug(`StatusLogState.setCaptureWindowErr: setting captureWindowErr.value to ${capture}`);
    captureWindowErr.value = capture;
};

const setWriteToConsole = (write: boolean): void => {
    //console.debug(`StatusLogState.setWriteToConsole(${write}): prevVal=${writeToConsole.value}`);

    if (writeToConsole.value === write) {
        return;
    }

    if (!write) {
        opTracker.observeEvent(EventLevelKind.Inf, "Disabling mirroring log to console.");
    }

    opTracker.config.writeToConsole = write;

    //console.debug(`StatusLogState.setWriteToConsole: setting writeToConsole.value to ${write}`);
    writeToConsole.value = write;

    if (write) {
        opTracker.observeEvent(EventLevelKind.Inf, "Enabled mirroring log to console.");
    }
};

const setDisplayMode = (mode: StatusDisplayMode) => {
    if (displayMode.value === mode) {
        return;
    }

    displayMode.value = mode;

    isDisplayRequired.value =
        displayMode.value === "Always" ||
        (displayMode.value === "DuringImportantOperations" && isImportantOperationOngoing.value === true);
};

const setImportantOperationOngoing = (isOngoing: boolean) => {
    if (isImportantOperationOngoing.value === isOngoing) {
        return;
    }

    isImportantOperationOngoing.value = isOngoing;

    isDisplayRequired.value =
        displayMode.value === "Always" ||
        (displayMode.value === "DuringImportantOperations" && isImportantOperationOngoing.value === true);
};

const notifyLogEntryEmitted = (emit: LogEntry): void => {
    if (statusViewType.value !== "FullLog") {
        return;
    }

    let view = statusView.value;
    view = view + (view.length > 0 ? "\n" : "") + emit.entry;
    statusView.value = view;
};

const notifyLogEntriesDeleted = (removedEntries: LogEntry[], replacementEntries: LogEntry[] | null): void => {
    if (statusViewType.value !== "FullLog") {
        return;
    }

    let view = statusView.value;

    for (let e = 0; e < removedEntries.length; e++) {
        const entry = removedEntries[e]?.entry + "\n";
        const entryLen = entry.length;

        if (FLAG_VALIDATE_LOG_PRUNING) {
            if (!view.startsWith(entry)) {
                // We want to log the error, but we will do it async, after we finished changing the logger data.
                queueMicrotask(() => {
                    opTracker.observeEvent(
                        EventLevelKind.Err,
                        `Status Log State: Error while pruning Log View Cache`,
                        `\n` +
                            ` 🛑  Cannot prune entry #${e} of ${removedEntries.length} removed entries.\n` +
                            `    Entry (len=${entryLen}) "${entry}".\n` +
                            `    But the View Cache does not start with those chars.\n` +
                            `    The first ${entryLen * 2} chars of the View Cache: "${view.slice(0, entryLen * 2)}".\n`
                    );
                });

                // No point trying to prune any more, but we will still add the replacements:
                break;
            }
        }

        view = view.slice(entryLen);
    }

    if (replacementEntries && replacementEntries.length > 0) {
        let replacement = "";
        for (const replace of replacementEntries) {
            replacement += replace.entry + "\n";
        }

        view = replacement + view;
    }

    statusView.value = view;
};

const notifyLogEntriesRevised = (newLog: LogEntry[]): void => {
    if (statusViewType.value !== "FullLog") {
        return;
    }

    const view = rebuildFullLogView(newLog);
    statusView.value = view;
};

const notifyActiveOpsStackUpdated = (activeOps: ActiveOpsInfo): void => {
    if (statusViewType.value !== "CurrentState") {
        return;
    }

    statusView.value = rebuildCurrentStateView(activeOps);
};

const saveToLocalStorage = (storeKey?: string): boolean => {
    if (storeKey === undefined) {
        storeKey = localStorageKey.value ?? DefaultStatusLogSettingsLocalStorageKey;
    }

    if (isNullOrWhitespace(storeKey)) {
        throw new Error(`The 'storeKey' is invalid ("${storeKey}").`);
    }

    const r = saveStateToBrowserLocalStorage(statusLogState, storeKey);
    if (r) {
        localStorageKey.value = storeKey;
    }
    return r;
};

const loadFromLocalStorage = (storeKey?: string): boolean => {
    if (storeKey === undefined) {
        storeKey = localStorageKey.value ?? DefaultStatusLogSettingsLocalStorageKey;
    }

    if (isNullOrWhitespace(storeKey)) {
        throw new Error(`The specified 'storeKey' is invalid ("${storeKey}").`);
    }

    const r = loadStateFromBrowserLocalStorage(statusLogState, storeKey);
    if (r) {
        localStorageKey.value = storeKey;
    }
    return r;
};

/**  An unhandled error "ResizeObserver loop completed with undelivered notifications." can be thrown a lot
 * within the browser window during resizes. This is a benign error.
 * To avoid spamming the log, we sometimes need to suppress it.
 * https://stackoverflow.com/questions/49384120/resizeobserver-loop-limit-exceeded/50387233#50387233 ;
 * https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver#observation_errors . */
function setSuppressCaptureWindowErrorResizeObserverLoop(suppress: boolean) {
    _windowErrCaptureHandle?.setSuppressHandlingResizeObserverLoopErrors(suppress);
}

const statusLogState = {
    // statusViewType: computed({
    //     get: (): StatusViewType => statusViewType.value,
    //     set: (newVal: StatusViewType) => setStatusViewType(newVal),
    // }),

    // captureConsole: computed({
    //     get: (): boolean => captureConsole.value,
    //     set: (newVal: boolean) => setCaptureConsole(newVal),
    // }),

    // writeToConsole: computed({
    //     get: (): boolean => writeToConsole.value,
    //     set: (newVal: boolean) => setWriteToConsole(newVal),
    // }),

    get tracker() {
        return tracker();
    },

    statusView: shallowReadonly(statusView),

    statusViewType: shallowReadonly(statusViewType),
    captureConsole: shallowReadonly(captureConsole),
    captureWindowErr: shallowReadonly(captureWindowErr),
    writeToConsole: shallowReadonly(writeToConsole),

    displayMode: shallowReadonly(displayMode),
    isImportantOperationOngoing: shallowReadonly(isImportantOperationOngoing),
    isDisplayRequired: shallowReadonly(isDisplayRequired),

    localStorageKey: shallowReadonly(localStorageKey),

    setStatusViewType,
    setCaptureConsole,
    setCaptureWindowErr,
    setWriteToConsole,
    setDisplayMode,
    setImportantOperationOngoing,

    notifyLogEntryEmitted,
    notifyLogEntriesDeleted,
    notifyLogEntriesRevised,
    notifyActiveOpsStackUpdated,

    saveToLocalStorage,
    loadFromLocalStorage,

    /**  An unhandled error "ResizeObserver loop completed with undelivered notifications." can be thrown a lot
     * within the browser window during resizes. This is a benign error.
     * To avoid spamming the log, we sometimes need to suppress it.
     * https://stackoverflow.com/questions/49384120/resizeobserver-loop-limit-exceeded/50387233#50387233 ;
     * https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver#observation_errors . */
    setSuppressCaptureWindowErrorResizeObserverLoop,
};

opTracker.config.operationsListener = statusLogState;

// Apply default settings:
// (must be applied after everything else is initialized, so that the setters' side effects can be executed)

// Load from browser local storage using default key:
// (if key not found, it will fail gracefully and keep default settings)
const settingsLoadedAtModuleInit = statusLogState.loadFromLocalStorage();

// If not loaded from storage, apply default values:
// (applying them will also put them into local storage)
if (!settingsLoadedAtModuleInit) {
    statusLogState.setDisplayMode("DuringImportantOperations");
    statusLogState.setStatusViewType("CurrentState");
    statusLogState.setCaptureConsole(true);
    statusLogState.setCaptureWindowErr(true);
    statusLogState.setWriteToConsole(true);
}

// Main module API entry points:

export function useStatusLog() {
    return statusLogState;
}

export function useOpTracker() {
    return useStatusLog().tracker;
}

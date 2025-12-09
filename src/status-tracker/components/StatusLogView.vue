<template>
    <div v-if="!statusLog.isDisplayRequired.value" class="status-log-show-trigger">
        <q-btn flat dense round size="sm" icon="expand_less" @click="statusLogProxy.alwaysDisplay = true" />
    </div>
    <div v-if="statusLog.isDisplayRequired.value" class="status-log-container">
        <div
            class="status-log-drawer"
            @mousedown="startDragResize"
            @touchstart.passive="startDragResize"
            @dblclick="triggerJumpResize"
        >
            <div class="status-log-drawer-handle" />
        </div>

        <div :style="{ height: statusLogAreaHeight + 'px' }">
            <q-btn-dropdown
                ref="refToolsDropdown"
                color="blue-grey-2"
                text-color="blue-grey-10"
                class="status-log-tools-button"
                content-class="status-log-dropdown-menu"
                :style="Platform.is.mobile ? 'bottom: 12px; right: 12px;' : 'bottom: 18px; right: 18px;'"
                fab-mini
                unelevated
                :ripple="false"
                transition-show="jump-up"
                transition-hide="jump-down"
                transition-duration="500"
                toggle-aria-label="Status View Tools"
                :dropdown-icon="ionBuildOutline"
                menu-anchor="bottom left"
                menu-self="bottom right"
                :menu-offset="[5, -5]"
            >
                <q-list>
                    <q-item>
                        <q-item-section><q-item-label header>Status View</q-item-label></q-item-section>
                        <q-item-section side>
                            <q-btn v-close-popup flat dense round size="sm" icon="close" />
                        </q-item-section>
                    </q-item>

                    <q-item v-close-popup clickable @click="copyLogToClipboard">
                        <q-item-section><q-item-label>Copy log to clipboard</q-item-label></q-item-section>
                    </q-item>

                    <q-item v-close-popup clickable @click="dropLogForCompletedOps">
                        <q-item-section><q-item-label>Clear completed</q-item-label></q-item-section>
                    </q-item>

                    <q-expansion-item
                        :default-opened="false"
                        label="Configure"
                        caption="Configure the status view area"
                        :expand-separator="true"
                        @after-show="forceToolsDropdownReposition"
                    >
                        <q-item
                            clickable
                            @click="statusLogProxy.alwaysDisplay = !statusLogProxy.alwaysDisplay"
                            :inset-level="0.25"
                        >
                            <q-item-section>
                                <q-item-label>Always show status</q-item-label>
                                <q-item-label caption>Show always, or during data updates only</q-item-label>
                            </q-item-section>
                            <q-item-section side top>
                                <q-toggle
                                    v-model="statusLogProxy.alwaysDisplay"
                                    color="green"
                                    checked-icon="check"
                                    unchecked-icon="clear"
                                />
                            </q-item-section>
                        </q-item>

                        <q-item
                            clickable
                            @click="
                                statusLogProxy.statusViewType =
                                    statusLogProxy.statusViewType === 'FullLog' ? 'CurrentState' : 'FullLog'
                            "
                            :inset-level="0.25"
                        >
                            <q-item-section>
                                <div class="row items-center justify-between q-mb-xs">
                                    <q-item-label>View</q-item-label>
                                    <q-btn-toggle
                                        @click.stop
                                        style="display: flex"
                                        class="text-no-wrap"
                                        size="12px"
                                        v-model="statusLogProxy.statusViewType"
                                        dense
                                        unelevated
                                        rounded
                                        no-caps
                                        color="grey-6"
                                        toggle-color="green-6"
                                        :options="[
                                            {
                                                label: StatusViewTypes.FullLog,
                                                icon: biReceipt,
                                                value: 'FullLog',
                                                style: 'margin-right: 1px; padding: 7px 2px 7px 2px; flex: 1 1 1px',
                                                class: 'no-wrap',
                                            },
                                            {
                                                label: StatusViewTypes.CurrentState,
                                                icon: biFileEarmarkCheck,
                                                value: 'CurrentState',
                                                style: 'margin-left: 1px; padding: 7px 7px 7px 2px; flex: 1 1 1px; width: 160px',
                                            },
                                        ]"
                                    />
                                </div>
                                <q-item-label caption>Choose between full log or current operation state</q-item-label>
                            </q-item-section>
                        </q-item>

                        <q-item
                            clickable
                            @click="statusLogProxy.captureConsole = !statusLogProxy.captureConsole"
                            :inset-level="0.25"
                        >
                            <q-item-section>
                                <q-item-label>Capture Console</q-item-label>
                                <q-item-label caption>Mirror console output to the status log</q-item-label>
                            </q-item-section>
                            <q-item-section side top>
                                <q-toggle
                                    v-model="statusLogProxy.captureConsole"
                                    color="green"
                                    checked-icon="check"
                                    unchecked-icon="clear"
                                />
                            </q-item-section>
                        </q-item>

                        <q-item
                            clickable
                            @click="statusLogProxy.captureWindowErr = !statusLogProxy.captureWindowErr"
                            :inset-level="0.25"
                        >
                            <q-item-section>
                                <q-item-label>Capture Window Errors</q-item-label>
                                <q-item-label caption>Show unhandled browser errors to the status log</q-item-label>
                            </q-item-section>
                            <q-item-section side top>
                                <q-toggle
                                    v-model="statusLogProxy.captureWindowErr"
                                    color="green"
                                    checked-icon="check"
                                    unchecked-icon="clear"
                                />
                            </q-item-section>
                        </q-item>

                        <q-item
                            clickable
                            @click="statusLogProxy.writeToConsole = !statusLogProxy.writeToConsole"
                            :inset-level="0.25"
                        >
                            <q-item-section>
                                <q-item-label>Mirror to Console</q-item-label>
                                <q-item-label caption>Mirror status log to the console</q-item-label>
                            </q-item-section>
                            <q-item-section side top>
                                <q-toggle
                                    v-model="statusLogProxy.writeToConsole"
                                    color="green"
                                    checked-icon="check"
                                    unchecked-icon="clear"
                                />
                            </q-item-section>
                        </q-item>
                    </q-expansion-item>

                    <q-expansion-item
                        :default-opened="false"
                        label="Advanced"
                        caption="Advanced options and developer tools"
                        :expand-separator="true"
                        @after-show="forceToolsDropdownReposition"
                    >
                        <q-item v-close-popup clickable :inset-level="0.25" @click="fillLogWithDummyData()">
                            <q-item-section><q-item-label>Fill log with dummy data</q-item-label></q-item-section>
                        </q-item>
                    </q-expansion-item>
                </q-list></q-btn-dropdown
            >
            <div class="status-log-title">
                Status:
                <q-btn flat dense round size="sm" icon="expand_more" @click="statusLogProxy.alwaysDisplay = false" />
            </div>
            <div class="status-log-textarea-div">
                <textarea
                    ref="refTextArea"
                    class="status-log-textarea textarea-scrolling"
                    name="statusLogTextArea"
                    autocapitalize="off"
                    autocorrect="off"
                    spellcheck="false"
                    autofocus="false"
                    :placeholder="
                        (statusLog.statusViewType.value === 'FullLog'
                            ? 'Operations Log will appear here.'
                            : 'Current operation status will appear here.') + ' \n(You can hide this in the Settings.)'
                    "
                    wrap="off"
                    readonly
                    v-model="statusLog.statusView.value"
                />
            </div>
        </div>
    </div>
</template>

<style lang="css">
/* Global style for dropdown menu (not scoped because it renders in a portal) */
.status-log-dropdown-menu {
    font-size: 0.85rem;
}

.status-log-dropdown-menu .q-item {
    min-height: 32px;
    padding-top: 4px;
    padding-bottom: 4px;
}

.status-log-dropdown-menu .q-item__label--caption {
    font-size: 0.7rem;
}

.status-log-dropdown-menu .q-expansion-item__content {
    padding-top: 0;
    padding-bottom: 0;
}
</style>

<style lang="css" scoped>
/* ----------- Show trigger (floating arrow when status view is hidden): ----------- */

.status-log-show-trigger {
    height: 0;
    overflow: visible;
    display: flex;
    justify-content: flex-end;
    position: relative;
}

.status-log-show-trigger .q-btn {
    position: absolute;
    bottom: 0;
    right: 5px;
    opacity: 1;
    color: #455a64;
}

.status-log-show-trigger .q-btn:hover {
    opacity: 1;
}

/* ----------- Scrolling for text areas: ----------- */

.textarea-scrolling {
    /* Firefox scroll-bar: */
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.3) rgba(0, 0, 0, 0.1);
}

/* WebKit/Blink scrollbar: */
.textarea-scrolling::-webkit-scrollbar {
    width: 7px;
}

.textarea-scrolling::-webkit-scrollbar-track {
    background-color: rgba(0, 0, 0, 0.1);
}

.textarea-scrolling::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 7px;
}

.textarea-scrolling::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.5);
}

/* ----------- Tools button: ----------- */

.status-log-tools-button {
    position: absolute;
    /* `bottom` and `right` are synamically defined in styles */
    z-index: 10;
    opacity: 0.7;
}

/* ----------- Status log area: ----------- */
.status-log-container {
    margin: 1px 5px 5px 5px;
    border: none;
    overflow: hidden;
    border-top: none;
    color: gray;
}

.status-log-drawer {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 10px;
    border-radius: 3px;
    cursor: row-resize;
    border-top: 1px solid #b0bec5;
    border-bottom: 1px solid #b0bec5;
    background-color: #b0bec5;
}

.status-log-drawer-handle {
    width: 80px;
    height: 5px;
    background: ivory;
    border-radius: 3px;
}

.status-log-title {
    font-size: 0.75rem;
    font-weight: 500;
    color: #455a64;
    padding: 5px 1px 1px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.status-log-textarea-div {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding-bottom: 30px;
}

/* Note: the font size of the status info text is not expressed in terms of `rem`,          */
/* and therefore will not scale with `$body-font-size`. It is optimized for dev-experience. */
.status-log-textarea {
    width: 100%;
    height: 100%;
    resize: none;
    outline: none;
    border: 1px solid #b0bec5;
    padding: 5px;
    font-family: monospace;
    font-size: 12px;
    overflow: auto;
    box-sizing: border-box;
}

@media (max-width: 600px) {
    .status-log-textarea {
        font-size: 11px;
    }
}

@media (max-width: 450px) {
    .status-log-textarea {
        font-size: 10px;
    }
}
</style>

<script setup lang="ts">
//import { useAppSettingsStore } from "stores/app-settings";
import { useStatusLog, rebuildFullLogView, StatusViewTypes } from "../composables/status-log";
import { ref, watch, nextTick, useTemplateRef, reactive } from "vue";
import { ionBuildOutline } from "@quasar/extras/ionicons-v7";
import { Platform } from "quasar";
import { DelayPromise } from "src/util/DelayPromise";
import { notifyInfo, notifyNegative, notifyPositive, notifyWarning } from "src/composables/notify";
import { biFileEarmarkCheck, biReceipt } from "@quasar/extras/bootstrap-icons";

export interface StatusLogViewProps {
    sizeJumpSteps?: number[] | undefined;
}

const props = defineProps<StatusLogViewProps>();

function parseSizeJumpSteps(opts: StatusLogViewProps | undefined): {
    minHeight: number;
    maxHeight: number;
    sizeJumpSteps: number[];
} {
    // Props defaults/fallbacks:
    const minHeightFallback = 70;
    const maxHeightFallback = 400;

    let minHeight = undefined,
        maxHeight = undefined;
    const sizeJumpSteps: number[] = [];

    // Copy all valid `jumpSizeSteps` values and compute min/max height in the process:
    if (opts && opts.sizeJumpSteps) {
        for (const j of opts.sizeJumpSteps) {
            if (j == undefined || typeof j != "number" || !Number.isFinite(j) || j < 1) {
                continue;
            }

            minHeight = minHeight !== undefined && minHeight < j ? minHeight : j;
            maxHeight = maxHeight !== undefined && maxHeight > j ? maxHeight : j;
            sizeJumpSteps.push(j);
        }
    }

    // If not a single valid jump size was found, use fallbacks:
    if (sizeJumpSteps.length === 0 || sizeJumpSteps[0] === undefined) {
        return {
            minHeight: minHeightFallback,
            maxHeight: maxHeightFallback,
            sizeJumpSteps: [minHeightFallback, maxHeightFallback],
        };
    }

    // If only one valid jump size was found, we have no valid range. Use fallbacks combined with the opts' value:
    if (sizeJumpSteps.length === 1) {
        return {
            minHeight: Math.min(minHeightFallback, sizeJumpSteps[0]),
            maxHeight: Math.max(maxHeightFallback, sizeJumpSteps[0]),
            sizeJumpSteps,
        };
    }

    // We found 2 or more valid jump steps. This means, we must also have min/max height.
    if (minHeight === undefined || maxHeight === undefined) {
        throw Error(
            `StatusLogView.parseSizeJumpSteps(..): Bug in the algorithm. {minHeight='${minHeight}', maxHeight='${maxHeight}'}.`
        );
    }
    return {
        minHeight,
        maxHeight,
        sizeJumpSteps,
    };
}

const heightDragSnapDistance = 15;
let nextSizeJumpStepIndex = 0;
const { minHeight, maxHeight, sizeJumpSteps } = parseSizeJumpSteps(props);

// Handling of the drawer-based resizing:

const statusLogAreaHeight = ref<number>(sizeJumpSteps[nextSizeJumpStepIndex]!);

const startDragResizeState: {
    mouseY: number | undefined;
    logAreaHeight: number | undefined;
    hasUndefined(): boolean;
} = {
    mouseY: undefined,
    logAreaHeight: undefined,
    hasUndefined(): boolean {
        return this.mouseY === undefined || this.logAreaHeight === undefined;
    },
};

function setSuppressCaptureWindowErrorResizeObserverLoop(params: { suppress: boolean; useDelay: boolean }) {
    const { suppress, useDelay } = params;
    if (useDelay) {
        setTimeout(() => {
            void nextTick(() => {
                statusLog.setSuppressCaptureWindowErrorResizeObserverLoop(suppress);
            });
        }, 100);
    } else {
        statusLog.setSuppressCaptureWindowErrorResizeObserverLoop(suppress);
    }
}

function startDragResize(ev: MouseEvent | TouchEvent) {
    const getMouseY = (ev: MouseEvent | TouchEvent): number | undefined => {
        if ("touches" in ev) {
            if (ev.touches[0]) {
                return ev.touches[0].clientY;
            } else {
                console.warn("Expected data not found in touch event (ev.touches[0]).");
                return undefined;
            }
        } else {
            return ev.clientY;
        }
    };

    startDragResizeState.mouseY = getMouseY(ev);
    startDragResizeState.logAreaHeight = statusLogAreaHeight.value;
    if (startDragResizeState.hasUndefined()) {
        return;
    }

    const upHandler = () => {
        document.removeEventListener("mousemove", moveHandler);
        document.removeEventListener("touchmove", moveHandler);
        document.removeEventListener("mouseup", upHandler);
        document.removeEventListener("touchend", upHandler);

        setSuppressCaptureWindowErrorResizeObserverLoop({ suppress: false, useDelay: true });
    };

    const moveHandler = (ev: MouseEvent | TouchEvent) => {
        if (startDragResizeState.hasUndefined()) {
            upHandler();
            return;
        }

        const clientY = getMouseY(ev) ?? startDragResizeState.mouseY!;
        const delta = startDragResizeState.mouseY! - clientY;
        const newAreaHeight = startDragResizeState.logAreaHeight! + delta;

        let adjustedAreaHeight = newAreaHeight;
        for (const j of sizeJumpSteps) {
            if (Math.abs(adjustedAreaHeight - j) <= heightDragSnapDistance) {
                adjustedAreaHeight = j;
                //console.debug(`LogView.startDragResize.moveHandler: Snapped to height ${j}.`);
                break;
            }
        }

        adjustedAreaHeight = Math.min(maxHeight, Math.max(minHeight, adjustedAreaHeight));
        statusLogAreaHeight.value = adjustedAreaHeight;
        //console.debug(`LogView.startDragResize.moveHandler: height=${statusLogAreaHeight.value}.`);
    };

    setSuppressCaptureWindowErrorResizeObserverLoop({ suppress: true, useDelay: false });

    document.addEventListener("mousemove", moveHandler);
    document.addEventListener("touchmove", moveHandler);
    document.addEventListener("mouseup", upHandler);
    document.addEventListener("touchend", upHandler);
}

const jumpResizeConfig_DurationMs = 500;
const jumpResizeConfig_TotalSteps = 15;

let isJumpResizeInProgress = false;
function triggerJumpResize() {
    if (isJumpResizeInProgress) {
        // console.debug("'LogView.triggerJumpResize(): isJumpResizeInProgress' is true. Will not jump again.");
        return;
    }

    const jumpTarget = sizeJumpSteps[nextSizeJumpStepIndex++]!;
    nextSizeJumpStepIndex = nextSizeJumpStepIndex < sizeJumpSteps.length ? nextSizeJumpStepIndex : 0;

    isJumpResizeInProgress = true;

    const totalDistance = jumpTarget - statusLogAreaHeight.value;
    const stepDistance = totalDistance / jumpResizeConfig_TotalSteps;
    const targetMs = Date.now() + jumpResizeConfig_DurationMs;

    let remainSteps = jumpResizeConfig_TotalSteps;

    // Debugging:

    // console.debug(
    //     `LogView.triggerJumpResize():\n` +
    //         ` HEIGHT { target=${jumpTarget}, current=${statusLogAreaHeight.value}, totalDistance=${totalDistance} }\n` +
    //         ` STEP { remain=${remainSteps}, firstMs=${jumpResizeConfig_DurationMs / remainSteps}, distance=${stepDistance} }`
    // );

    // const firstTs = Date.now();
    // let prevTs = firstTs;

    const stepFrameFunction = () => {
        if (remainSteps === 0 || Math.abs(statusLogAreaHeight.value - jumpTarget) < Math.abs(stepDistance)) {
            statusLogAreaHeight.value = jumpTarget;

            // Debugging:
            // const ts = Date.now();
            // console.debug("LogView.triggerJumpResize.stepFrameFunction: TotalTime=", ts - firstTs);

            // Wait for 100ms and for one tick after that, then stop the ResizeObserverLoop error suppression:
            setSuppressCaptureWindowErrorResizeObserverLoop({ suppress: false, useDelay: true });

            isJumpResizeInProgress = false;
            return;
        }

        statusLogAreaHeight.value += stepDistance;

        const now = Date.now();
        const remainMs = targetMs - now;
        let nextDurationMs = remainMs / --remainSteps;
        if (!nextDurationMs || nextDurationMs < 0) {
            nextDurationMs = 0;
        }

        // Debugging:
        // console.debug(
        //     "LogView.triggerJumpResize.stepFrameFunction:" +
        //         ` madeStep: ${now - prevTs}ms, nextDuration: ${nextDurationMs}ms, remainSteps: ${remainSteps}`
        // );
        // prevTs = now;

        setTimeout(stepFrameFunction, nextDurationMs);
    };

    setSuppressCaptureWindowErrorResizeObserverLoop({ suppress: true, useDelay: false });
    setTimeout(stepFrameFunction, jumpResizeConfig_DurationMs / remainSteps);
}

const statusLog = useStatusLog();
// console.debug(`StatusLogView:", " statusLog:`, statusLog);

// Local refs for statusLog - needed for proper reactivity in dropdown portal
const statusLogProxy = reactive({
    alwaysDisplay: statusLog.displayMode.value === "Always",
    statusViewType: statusLog.statusViewType.value,
    captureConsole: statusLog.captureConsole.value,
    captureWindowErr: statusLog.captureWindowErr.value,
    writeToConsole: statusLog.writeToConsole.value,
});

watch(
    () => statusLogProxy.alwaysDisplay,
    (newVal: boolean) => {
        setSuppressCaptureWindowErrorResizeObserverLoop({ suppress: true, useDelay: false });
        statusLog.setDisplayMode(newVal ? "Always" : "DuringImportantOperations");
        statusLog.saveToLocalStorage();
        setSuppressCaptureWindowErrorResizeObserverLoop({ suppress: false, useDelay: true });
    }
);
watch(
    () => statusLogProxy.statusViewType,
    (newVal) => {
        statusLog.setStatusViewType(newVal);
        statusLog.saveToLocalStorage();
    }
);
watch(
    () => statusLogProxy.captureConsole,
    (newVal) => {
        statusLog.setCaptureConsole(newVal);
        statusLog.saveToLocalStorage();
    }
);
watch(
    () => statusLogProxy.captureWindowErr,
    (newVal) => {
        statusLog.setCaptureWindowErr(newVal);
        statusLog.saveToLocalStorage();
    }
);
watch(
    () => statusLogProxy.writeToConsole,
    (newVal) => {
        statusLog.setWriteToConsole(newVal);
        statusLog.saveToLocalStorage();
    }
);

watch(statusLog.displayMode, (newVal) => {
    statusLogProxy.alwaysDisplay = newVal === "Always";
});
watch(statusLog.statusViewType, (newVal) => {
    statusLogProxy.statusViewType = newVal;
});
watch(statusLog.captureConsole, (newVal) => {
    statusLogProxy.captureConsole = newVal;
});
watch(statusLog.captureWindowErr, (newVal) => {
    statusLogProxy.captureWindowErr = newVal;
});
watch(statusLog.writeToConsole, (newVal) => {
    statusLogProxy.writeToConsole = newVal;
});

// {
//     // Hooking app App Settings and Status Store settings:
//
//     const appSettingsStore = useAppSettingsStore();
//     const {
//         statusViewType: statusViewTypeConfig,
//         statusViewCaptureConsole: statusViewCaptureConsoleConfig,
//         statusViewWriteToConsole: statusViewWriteToConsoleConfig,
//     } = storeToRefs(appSettingsStore);
//
//     watch(
//         statusViewTypeConfig,
//         (viewType) => {
//             //console.debug(`LogView: SettingsStore.ViewType => ${viewType} => LogStore.ViewType`);
//             statusLog.setStatusViewType(viewType);
//             statusLog.saveToLocalStorage();
//         },
//         { immediate: true }
//     );
//
//     watch(
//         statusViewCaptureConsoleConfig,
//         (captureConsole) => {
//             //console.debug(`LogView: SettingsStore.CaptureConsole => ${captureConsole} => LogStore.CaptureConsole`);
//             statusLog.setCaptureConsole(captureConsole);
//             statusLog.saveToLocalStorage();
//         },
//         { immediate: true }
//     );
//
//     watch(
//         statusViewWriteToConsoleConfig,
//         (writeToConsole) => {
//             //console.debug(`LogView: SettingsStore.WriteToConsole => ${writeToConsole} => LogStore.WriteToConsole`);
//             statusLog.setWriteToConsole(writeToConsole);
//             statusLog.saveToLocalStorage();
//         },
//         { immediate: true }
//     );
// }

// Auto-scroll text area:

const refTextArea = useTemplateRef<HTMLTextAreaElement>("refTextArea");

watch(statusLog.statusView, async () => {
    // Wait for DOM update
    await nextTick();

    const textarea = refTextArea.value;
    if (!textarea) {
        return;
    }

    let scrollTopDest;
    switch (statusLog.statusViewType.value) {
        case "FullLog":
            scrollTopDest = textarea.scrollHeight;
            break;

        case "CurrentState":
            scrollTopDest = 0;
            break;

        default:
            return;
    }

    textarea.scrollTo({
        top: scrollTopDest,
        behavior: "smooth",
    });
});

// Tools button actions:

async function copyLogToClipboard(): Promise<void> {
    const res = await execCopyViewContent();
    switch (res) {
        case "clipboard":
            notifyPositive("The entire Log was copied to clipboard.");
            return;
        case "legacy":
            if (statusLog.statusViewType.value === "CurrentState") {
                notifyInfo(
                    "Current State displayed in Status View was copied to clipboard." +
                        " Switch to *Full Log* to copy the entire log."
                );
            } else {
                notifyPositive("Content of the Status View was copied to clipboard.");
            }
            return;
        case "error":
            notifyNegative("Problem copying logged operations to clipboard. Check Log for details.");
            return;
        default:
            notifyWarning("Attempted to copy Status Info to clipboard. Try to paste to check results.");
    }
}

async function execCopyViewContent(): Promise<"clipboard" | "legacy" | "error"> {
    const opCopyStatusView = statusLog.tracker.startOperation("Copying Status Info to Clipboard");
    await DelayPromise.Run(500);

    const isSecureContext = window.isSecureContext;
    if (!isSecureContext) {
        opCopyStatusView.addInfo("Running in an non-secure context. Falling back to legacy Copy API.");
    } else {
        try {
            if (navigator.clipboard) {
                const logText = rebuildFullLogView(statusLog.tracker.loggedOps);

                await navigator.clipboard.writeText(logText);
                opCopyStatusView.setSuccess("via Clipboard API");
                return "clipboard";
            } else {
                opCopyStatusView.addInfo("`navigator.clipboard` not available; falling back to legacy Copy API.");
            }
        } catch (err) {
            opCopyStatusView.addInfo("`clipboard.writeText` failed; falling back to legacy Copy API.", err);
        }
    }

    // Legacy API fallback:
    try {
        const textarea = refTextArea.value;
        if (!textarea) {
            opCopyStatusView.setFailure("textarea not found");
            return "error";
        }

        const selectStart = textarea.selectionStart;
        const selectEnd = textarea.selectionEnd;
        const scrollTop = textarea.scrollTop;
        const scrollLeft = textarea.scrollLeft;

        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length); // iOS compat fix
        const res = document.execCommand("copy");

        textarea.setSelectionRange(selectStart, selectEnd);
        textarea.scrollTop = scrollTop;
        textarea.scrollLeft = scrollLeft;

        opCopyStatusView.setCompleted(res, ["via Legacy Copy API"]);
        return res ? "legacy" : "error";
    } catch (err) {
        opCopyStatusView.setFailure(err);
        return "error";
    }
}

function dropLogForCompletedOps() {
    statusLog.tracker.dropLogEntriesForCompletedOps();
}

async function fillLogWithDummyData() {
    await statusLog.tracker.createBulkDummyOperations(75000);
}

const refToolsDropdown = useTemplateRef("refToolsDropdown");
async function forceToolsDropdownReposition() {
    await nextTick();

    if (
        refToolsDropdown.value &&
        "show" in refToolsDropdown.value &&
        typeof refToolsDropdown.value.show === "function" &&
        "hide" in refToolsDropdown.value &&
        typeof refToolsDropdown.value.hide === "function"
    ) {
        refToolsDropdown.value.hide();
        refToolsDropdown.value.show();
    }
}
</script>

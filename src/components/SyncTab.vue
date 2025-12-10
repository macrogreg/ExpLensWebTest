<template>
    <div class="text-left q-gutter-md" style="width: fit-content">
        <h2 class="q-ma-md tab-main-header">Synchronize Bank Data</h2>

        <div
            v-if="officeApiInitErrorMsg"
            class="q-pa-sm form-group-border"
            style="font-size: smaller; color: red; width: auto"
        >
            {{ officeApiInitErrorMsg }}
        </div>
        <div
            v-if="isNullOrWhitespace(officeApiInitErrorMsg) && officeApiEnvInfo === null"
            class="q-pa-sm form-group-border"
            style="font-size: smaller; width: auto"
        >
            Office Add-In environment not initialized (yet?).
        </div>

        <!-- div(API Token) { -->
        <div class="q-pa-sm form-group-border" style="width: auto">
            <q-expansion-item
                id="api-token-expansion"
                v-model="isApiTokenAreaExpanded"
                label="Lunch Money Access Token"
                :caption="isApiTokenAreaExpanded ? '\u00A0' : apiTokenExpansionCaption"
                dense
                dense-toggle
            >
                <q-input
                    v-model="apiTokenModel"
                    :disable="isDataOperationInProgress"
                    filled
                    label="API Token"
                    dense
                    :counter="false"
                    maxlength="200"
                    style="max-width: 450px; width: 100%; padding: 0 10px 20px 0"
                />

                <q-checkbox
                    v-model="hasPersistApiTokenPermissionControl"
                    :disable="isDataOperationInProgress"
                    style="font-size: smaller; line-height: normal"
                    >Store the API Token in the current document<br />
                    <span style="font-size: smaller">(Unsecure!)</span></q-checkbox
                >

                <div style="padding: 0; margin: 0px; text-align: right">
                    <q-btn
                        :label="'\u00A0Apply\u00A0'"
                        :disable="isDataOperationInProgress"
                        color="primary"
                        @click="applyAndCheckApiToken"
                        class="q-ma-sm"
                        dense
                        no-caps
                    />
                </div>
                <!-- prettier-ignore -->
                <pre
                    class="q-ma-xs"
                    :style="{
                        fontFamily: 'monospace',
                        fontSize: '10px',
                        lineHeight: 1,
                        color: (!isApiTokenValidationInProgress && !isApiTokenValid) ? 'red' : 'black'
                    }"
                >{{ apiTokenValidateResultMsg }}</pre>
            </q-expansion-item>
        </div>
        <!-- } div(API Token) -->

        <!-- div(Download Transactions) { -->
        <div class="q-pa-sm form-group-border" style="width: auto">
            <div class="text-weight-bold q-mb-xs" style="font-size: 0.9rem">Download transactions for dates:</div>
            <!-- prettier-ignore -->
            <div class="q-mb-sm">
                <div class="text-primary text-weight-bold q-mb-xs" style="font-size: 0.7rem">Quick select:</div>
                <q-btn
                    color="primary" outline no-wrap no-caps dense label="Since Last Sync" class="q-mr-xs"
                    :disable="isDataOperationInProgress || downloadDatesQuickSelectOptions.lastSync === null"
                    @click="applyDownloadDatesQuickSelect(downloadDatesQuickSelectOptions.lastSync)">
                    <q-tooltip v-if="downloadDatesQuickSelectOptions.lastSync"
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[5, 5]"
                        class="tooltip-semitransp">
                            {{downloadDatesQuickSelectOptions.lastSync?.start }} ... {{downloadDatesQuickSelectOptions.lastSync?.end }}
                    </q-tooltip>
                </q-btn>

                <q-btn
                    color="primary" outline no-wrap no-caps dense label="Recent" class="q-mr-xs"
                    :disable="isDataOperationInProgress || downloadDatesQuickSelectOptions.recent === null"
                    @click="applyDownloadDatesQuickSelect(downloadDatesQuickSelectOptions.recent)">
                    <q-tooltip v-if="downloadDatesQuickSelectOptions.recent"
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[5, 5]"
                        class="tooltip-semitransp">
                            {{downloadDatesQuickSelectOptions.recent?.start }} ... {{downloadDatesQuickSelectOptions.recent?.end }}
                    </q-tooltip>
                </q-btn>
                <q-btn
                    color="primary" outline no-wrap no-caps dense label="Last 24 months"
                    :disable="isDataOperationInProgress || downloadDatesQuickSelectOptions.last24Months === null"
                    @click="applyDownloadDatesQuickSelect(downloadDatesQuickSelectOptions.last24Months)">
                    <q-tooltip v-if="downloadDatesQuickSelectOptions.last24Months"
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[5, 5]"
                        class="tooltip-semitransp">
                            {{downloadDatesQuickSelectOptions.last24Months?.start }} ... {{downloadDatesQuickSelectOptions.last24Months?.end }}
                    </q-tooltip>
                </q-btn>
            </div>

            <div class="date-inputs" style="display: flex; gap: 16px">
                <div style="max-width: 220px; width: 100%">
                    <q-input
                        :disable="isDataOperationInProgress"
                        filled
                        label="START"
                        v-model="downloadStartDate"
                        type="date"
                        :error="!!downloadStartDateError"
                        :rules="[syncDateAgeRule]"
                        @update:model-value="downloadStartDateError = ''"
                    />
                    <div v-if="downloadStartDateError" class="text-negative q-mt-xs">
                        {{ downloadStartDateError }}
                    </div>
                </div>
                <div style="max-width: 220px; width: 100%">
                    <q-input
                        :disable="isDataOperationInProgress"
                        filled
                        label="END"
                        v-model="downloadEndDate"
                        type="date"
                        :error="!!downloadEndDateError"
                        :rules="[syncDateAgeRule]"
                        @update:model-value="downloadStartDateError = ''"
                    />
                    <div v-if="downloadEndDateError" class="text-negative q-mt-xs">{{ downloadEndDateError }}</div>
                </div>
            </div>

            <div class="text-weight-bold q-mb-xs" style="font-size: 0.9rem">Download method:</div>

            <q-btn-toggle
                v-model="downloadUpdateExistingTransactions"
                :disable="isDataOperationInProgress"
                color="indigo-3"
                toggle-color="indigo-6"
                unelevated
                no-wrap
                no-caps
                dense
                :options="[
                    { value: true, label: 'Overwrite Existing', icon: 'note_alt' },
                    { value: false, label: 'Download New Only', icon: 'note_add' },
                ]"
            >
            </q-btn-toggle>

            <q-separator class="q-ma-sm q-mt-md q-mb-md" color="grey-6" />

            <q-btn
                :icon="downloadUpdateExistingTransactions ? 'note_alt' : 'note_add'"
                label="Download"
                :loading="isDataOperationInProgress"
                :percentage="syncOperationProgressPercentage"
                color="primary"
                @click="validateAndDownload"
                class="q-ma-xs block q-mx-auto"
            />
        </div>
        <!-- } div(Download Transactions) -->

        <!-- div(Upload Transactions) { -->
        <div class="q-pa-sm form-group-border" style="width: auto">
            <div class="text-weight-bold text-grey-6 q-mb-xs" style="font-size: 0.9rem">Upload transactions:</div>
            <div class="text-weight-bold text-grey-6 q-mb-sm" style="font-size: 0.7rem">
                Only modifications to Categories and Tags will be uploaded.<br />
                (<span style="background-color: #b5e6a2; color: #4ea72e">columns with green on top</span>)
            </div>

            <div class="q-mb-md text-grey-8" style="font-size: 0.9rem">Supported in future versions.</div>

            <q-separator class="q-ma-sm q-mt-md q-mb-md" color="grey-4" />

            <q-btn
                disable
                icon="cloud_upload"
                label="Upload"
                :loading="isDataOperationInProgress"
                :percentage="syncOperationProgressPercentage"
                color="grey-6"
                class="q-ma-xs block q-mx-auto"
            />
        </div>
        <!-- } div(Upload Transactions) -->

        <!-- div(Office API status) { -->
        <div class="q-pa-sm q-mt-md q-mb-sm form-group-border" style="font-size: smaller; width: auto">
            <div v-if="officeApiEnvInfo">
                <div>
                    Connected to MS Office. Host: '{{ officeApiEnvInfo.host ?? "null" }}'; Platform: '{{
                        officeApiEnvInfo.platform ?? "null"
                    }}'.
                </div>
                <div v-if="appSettings">
                    Last sync:
                    {{
                        appSettings.lastCompletedSyncUtc.value
                            ? formatDateTimeLocalLong(appSettings.lastCompletedSyncUtc.value)
                            : "never"
                    }}
                    (#{{ appSettings.lastCompletedSyncVersion.value }}).
                </div>
            </div>
            <div v-else>Office Add-In environment not initialized (yet?).</div>
        </div>
        <!-- } div(Office API status) -->
    </div>

    <q-dialog v-model="showPersistApiTokenDialog" persistent>
        <q-card>
            <q-card-section>
                <div class="text-weight-bold q-mb-sm" style="font-size: larger">
                    Really store the API Token as clear text in this document?
                </div>
                <p class="text-weight-bold">Anybody who can access this document can also access the token.</p>
                <p class="text-justify q-mb-xs">
                    The API Token enables complete access to all your data inside of Lunch Money.<br />
                    We can store the API Token in the current document for your convenience. However, the Token is not
                    encrypted, and anybody with access to this document can theoretically also access the Token.
                </p>
                <p class="text-justify q-mb-xs">
                    If you ever suspect that an unauthorized person accessed your API Token, you must immediately delete
                    it (you can create a new one right away). To do that, go to
                    <span class="text-italic">Settings > Developers</span> in your Lunch Money app.<br />
                    (<a target="_blank" href="https://my.lunchmoney.app/developers"
                        >https://my.lunchmoney.app/developers</a
                    >).
                </p>
            </q-card-section>
            <q-card-actions align="right">
                <q-btn flat label="No" color="positive" v-close-popup @click="confirmPersistApiTokenDialog('no')" />
                <q-btn flat label="Yes" color="negative" v-close-popup @click="confirmPersistApiTokenDialog('yes')" />
            </q-card-actions>
        </q-card>
    </q-dialog>
</template>

<style scoped></style>

<style>
#api-token-expansion .q-focus-helper {
    visibility: hidden;
}

.form-group-border {
    border: 1px lightgray solid;
}
</style>

<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import { errorTypeMessageString, formatDateLocal, formatDateTimeLocalLong, formatValue } from "src/util/format_util";
import { QInput } from "quasar";
import { useOffice } from "src/composables/office-ready";
import { type AppSettings, useSettings } from "src/composables/settings";
import { downloadData } from "src/business/sync-driver";
import { useOpTracker } from "src/status-tracker/composables/status-log";
import { validateApiToken } from "src/business/validate-api-token";
import { isNullOrWhitespace } from "src/util/string_util";
import { notifyPositive, notifyWarning } from "src/composables/notify";

const officeApiInitErrorMsg = ref<string>("");
const officeApiEnvInfo = ref<null | { host: Office.HostType; platform: Office.PlatformType }>(null);

let appSettings: AppSettings;

const apiTokenModel = ref("");

const isApiTokenAreaExpanded = ref(false);
const apiTokenValidateResultMsg = ref<string>("API token not verified.");
const isApiTokenValid = ref<boolean | undefined>(undefined);
const isApiTokenValidationInProgress = ref<boolean>(false);

const apiTokenExpansionCaption = computed(() => {
    if (isApiTokenValidationInProgress.value === true) {
        return "Token is being verified...";
    }

    if (isApiTokenValid.value === undefined) {
        return "Token not verified." + (isApiTokenAreaExpanded.value ? "" : " Expand to configure.");
    }

    return isApiTokenValid.value
        ? "Token is valid"
        : "Token not valid." + (isApiTokenAreaExpanded.value ? "" : " Expand to configure.");
});

const showPersistApiTokenDialog = ref(false);
const hasPersistApiTokenPermissionData = ref(false);
const hasPersistApiTokenPermissionControl = computed({
    get: () => hasPersistApiTokenPermissionData.value,
    set: (val: boolean) => {
        if (val) {
            showPersistApiTokenDialog.value = true;
        } else {
            hasPersistApiTokenPermissionData.value = false;
        }
    },
});

async function checkApiToken(token: string): Promise<boolean> {
    isApiTokenValidationInProgress.value = true;
    try {
        apiTokenValidateResultMsg.value = "API token is being verified.";
        isApiTokenValid.value = false;

        const { isValid, info } = await validateApiToken(token);

        if (!isValid) {
            apiTokenValidateResultMsg.value = info;
        } else {
            apiTokenValidateResultMsg.value =
                "Token is valid." +
                `\n Token moniker:    ${info.api_key_label ?? "<Not Named>"}` +
                `\n Grants access to: ${info.budget_name ?? "<Unnamed Budget>"}` +
                `\n User:             ${info.user_name ?? "Unnamed User"} (${info.user_email ?? "NoEmail"})`;
        }
        isApiTokenValid.value = isValid;
        return isValid;
    } finally {
        isApiTokenValidationInProgress.value = false;
    }
}

async function applyAndCheckApiToken(): Promise<string | undefined> {
    const token = (apiTokenModel.value ?? "").trim();

    // Token is not *yet* verified:
    apiTokenValidateResultMsg.value = "API token not verified.";
    isApiTokenValid.value = false;

    // If permission to store the token is not given, we clear it from the settings store regardless of
    // the validity of the new token:
    if (!hasPersistApiTokenPermissionControl.value) {
        try {
            await appSettings.clearTokenStorage();
        } catch (err) {
            console.error("Error removing the API token from the document!", err);
        }
    }

    // Check whether the token is valid:
    // (this will also update 'isApiTokenValid' and 'apiTokenValidateResultMsg')
    const isValid = await checkApiToken(token);

    // We will store the token regardless of whether or not is is valid:
    // (updating the store may trigger reactive revalidation of the token)
    try {
        appSettings.apiToken.value = token;

        if (hasPersistApiTokenPermissionControl.value) {
            await appSettings.storeApiToken();
        }
    } catch (err) {
        console.error("Error setting or storing API token in App Settings.", err);
    }

    return isValid ? token : undefined;
}

function confirmPersistApiTokenDialog(choice: "yes" | "no") {
    if (choice === "yes") {
        hasPersistApiTokenPermissionData.value = true;
    }
    showPersistApiTokenDialog.value = false;
}

const downloadDatesQuickSelectOptions = reactive({
    lastSync: null as null | { start: string; end: string },
    recent: null as null | { start: string; end: string },
    last24Months: null as null | { start: string; end: string },
});

function getRecentSyncStartDate(today: Date): string {
    if (today.getDate() >= 1 && today.getDate() <= 19) {
        // 1st of previous month
        const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        return formatDateLocal(prevMonth);
    } else {
        // 1st of current month
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return formatDateLocal(firstOfMonth);
    }
}

function get24MonthsAgoDate(today: Date): string {
    const msecPerDay = 24 * 60 * 60 * 1000;
    const daysIn24Months = 365 * 2;

    const twoYearsAgoDate = new Date(today.getTime() - daysIn24Months * msecPerDay);
    const twoYearsAgoStr = formatDateLocal(twoYearsAgoDate);
    return twoYearsAgoStr;
}

function reinitDownloadDatesQuickSelectOptions() {
    const now = new Date();
    const nowStr = formatDateLocal(now);

    const lastSyncDate = appSettings.lastCompletedSyncUtc.value;
    downloadDatesQuickSelectOptions.lastSync =
        lastSyncDate === null ? null : { start: formatDateLocal(lastSyncDate), end: nowStr };

    downloadDatesQuickSelectOptions.recent = { start: getRecentSyncStartDate(now), end: nowStr };

    downloadDatesQuickSelectOptions.last24Months = { start: get24MonthsAgoDate(now), end: nowStr };
}

function applyDownloadDatesQuickSelect(applyRange: { start: string; end: string } | null) {
    if (applyRange === null) {
        return;
    }

    downloadStartDate.value = applyRange.start;
    downloadEndDate.value = applyRange.end;
}

const syncDateAgeRule = (val: string) => {
    if (!val) return true;
    const d = new Date(val);
    return d.getUTCFullYear() >= 2010 || "YEAR must be 2010 or later.";
};

const syncOperationProgressPercentage = ref<number>(-1);
const isDataOperationInProgress = computed<boolean>(() => {
    const isDataSync = 0 <= syncOperationProgressPercentage.value && syncOperationProgressPercentage.value < 100;
    const isTokenValidation = isApiTokenValidationInProgress.value === true;
    return isDataSync || isTokenValidation;
});

const downloadUpdateExistingTransactions = ref<boolean>(false);
const downloadStartDate = ref("");
const downloadEndDate = ref("");
const downloadStartDateError = ref("");
const downloadEndDateError = ref("");

async function validateAndDownload() {
    // Date validation:
    downloadStartDateError.value = "";
    downloadEndDateError.value = "";

    let downloadStartDateStr = downloadStartDate.value;
    let downloadEndDateStr = downloadEndDate.value;

    if (isNullOrWhitespace(downloadStartDateStr)) {
        downloadStartDateError.value = "Please select a START date.";
    } else {
        const ageCheck = syncDateAgeRule(downloadStartDateStr);
        downloadStartDateError.value = ageCheck === true ? "" : "date too old";
    }

    if (isNullOrWhitespace(downloadEndDateStr)) {
        downloadEndDateError.value = "Please select an END date.";
    } else {
        const ageCheck = syncDateAgeRule(downloadEndDateStr);
        downloadEndDateError.value = ageCheck === true ? "" : "date too old";
    }

    if (!isNullOrWhitespace(downloadStartDateError.value) || !isNullOrWhitespace(downloadEndDateError.value)) {
        return;
    }

    let startDate = new Date(downloadStartDateStr);
    let endDate = new Date(downloadEndDateStr);

    if (startDate > endDate) {
        const ds = downloadStartDateStr;

        downloadStartDate.value = downloadStartDateStr = downloadEndDateStr;
        downloadEndDate.value = downloadEndDateStr = ds;

        startDate = new Date(downloadStartDateStr);
        endDate = new Date(downloadEndDateStr);
    }

    if (downloadStartDateError.value || downloadEndDateError.value) {
        return;
    }

    // Validate that we have an API token:

    if ((await applyAndCheckApiToken()) === undefined) {
        isApiTokenAreaExpanded.value = true;
        return;
    }

    // Update vs new-only setting:

    const updateExistingTransactions = downloadUpdateExistingTransactions.value;

    // Execute the download:
    try {
        syncOperationProgressPercentage.value = 0;
        try {
            await downloadData(startDate, endDate, updateExistingTransactions, syncOperationProgressPercentage);
            notifyPositive("Data download complete");

            // Update dates quick-select:
            reinitDownloadDatesQuickSelectOptions();
        } catch (err) {
            notifyWarning("Error while downloading data! (see status log for details)", errorTypeMessageString(err));
        }
    } finally {
        syncOperationProgressPercentage.value = -1;
    }
}

onMounted(async () => {
    const op = useOpTracker().startOperation("ExpLens Excel-AddIn: SyncData Tab mounted. Getting Office API ready...");
    try {
        try {
            officeApiEnvInfo.value = await useOffice(true);
        } catch (err) {
            if (err instanceof Error) {
                officeApiInitErrorMsg.value = err.message;
            } else {
                officeApiInitErrorMsg.value = "Unexpected error while getting office APIs ready: " + formatValue(err);
            }
            op.setFailure("Error getting office APIs ready. AddIn will not work!", {
                message: officeApiInitErrorMsg.value,
                error: err,
            });
            console.error("Error getting office APIs ready. AddIn will not work!", {
                message: officeApiInitErrorMsg.value,
                error: err,
            });
            return;
        }

        officeApiInitErrorMsg.value = "";

        appSettings = await useSettings();

        const loadedApiToken = appSettings.apiToken.value ?? "";
        apiTokenModel.value = loadedApiToken;
        hasPersistApiTokenPermissionData.value = loadedApiToken.length > 0;

        const isLoadedTokenValid = await checkApiToken(loadedApiToken);
        isApiTokenAreaExpanded.value = !isLoadedTokenValid;

        // If token in app settings changes, update the us immediately:
        // (other direction only via apply or sync button)
        watch(appSettings.apiToken, async (newVal) => {
            const newToken = newVal ?? "";
            const prevModelVal = apiTokenModel.value;
            if (prevModelVal !== newToken) {
                apiTokenModel.value = newToken;
                await checkApiToken(newToken);
            }
        });

        reinitDownloadDatesQuickSelectOptions();
        applyDownloadDatesQuickSelect(
            downloadDatesQuickSelectOptions.lastSync ?? downloadDatesQuickSelectOptions.recent
        );

        op.setSuccess();
    } catch (err) {
        op.setFailureAndRethrow(err);
    }
});
</script>

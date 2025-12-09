/// <reference types="office-js" />

import { useSettings } from "src/composables/settings";
import { isNullOrWhitespace } from "src/util/string_util";
import type { TagInfo } from "./tags";
import { downloadTags, SheetNameTags, type TagValuesCollection } from "./tags";
import { downloadCategories, SheetNameCategories } from "./categories";
import { downloadTransactions, SheetNameTransactions } from "./transactions";
import { ensureSheetActive } from "./excel-util";
import type { Ref } from "vue";
import { IndexedMap } from "./IndexedMap";
import { useStatusLog } from "src/status-tracker/composables/status-log";

export type SyncContext = {
    excel: Excel.RequestContext;
    currentSync: { version: number; utc: Date };
    isUpdateExistingTransactions: boolean;
    progressPercentage: Ref<number>;
    sheets: {
        tags: Excel.Worksheet;
        cats: Excel.Worksheet;
        trans: Excel.Worksheet;
    };
    tags: {
        assignable: TagValuesCollection;
        groupListFormulaLocations: Map<string, string>;
        byId: Map<number, TagInfo>;
    };
    cats: {
        assignable: IndexedMap<number, string>;
        listFormulaLocation: string | null;
    };
};

let isSyncInProgress = false;

export async function downloadData(
    startDate: Date,
    endDate: Date,
    updateExistingTransactions: boolean,
    syncOperationProgressPercentage: Ref<number>
): Promise<void> {
    const statusLog = useStatusLog();

    if (isSyncInProgress === true) {
        throw new Error("Cannot start data download, because data sync is already in progress.");
    }

    const opDownloadData = statusLog.tracker.startOperation("Download Data", {
        updateExistingTransactions,
    });
    opDownloadData.addInfo({ startDate, endDate });

    // Work around a Lunch Money Bug that prevents downloads for only one day.
    // ToDo: This bug has been reported. Depending on their response, we need to either remove
    // this hack, or filter transactions after fetching to respect the set dates.
    if (
        startDate.getFullYear() === endDate.getFullYear() &&
        startDate.getMonth() === endDate.getMonth() &&
        startDate.getDate() === endDate.getDate()
    ) {
        endDate.setDate(endDate.getDate() + 1);
        opDownloadData.addInfo("Moved End Date one day later to work about a Lunch Money bug", { startDate, endDate });
    }

    let prevImportantOperationOngoing = true;
    try {
        isSyncInProgress = true;

        prevImportantOperationOngoing = useStatusLog().isImportantOperationOngoing.value;
        statusLog.setImportantOperationOngoing(true);

        const loadedAppSettings = await useSettings();
        const currentSync = { version: loadedAppSettings.lastCompletedSyncVersion.value + 1, utc: new Date() };

        {
            const apiToken = loadedAppSettings.apiToken.value;
            if (isNullOrWhitespace(apiToken)) {
                opDownloadData.setFailure("No API token. Cannot proceed with download");
                return;
            }

            opDownloadData.addInfo(`downloadData(..): has API token (${apiToken!.length} chars).`);
        }

        await Excel.run(async (context: Excel.RequestContext) => {
            // We need to ensure sheets creation ion the order we want them to appear in the document:
            const transSheet = await ensureSheetActive(SheetNameTransactions, context);
            const tagsSheet = await ensureSheetActive(SheetNameTags, context);
            const catsSheets = await ensureSheetActive(SheetNameCategories, context);

            const syncCtx: SyncContext = {
                excel: context,
                currentSync,
                isUpdateExistingTransactions: updateExistingTransactions,
                progressPercentage: syncOperationProgressPercentage,
                sheets: {
                    trans: transSheet,
                    tags: tagsSheet,
                    cats: catsSheets,
                },
                tags: {
                    assignable: new Map<string, Set<string>>(),
                    groupListFormulaLocations: new Map<string, string>(),
                    byId: new Map<number, TagInfo>(),
                },
                cats: {
                    assignable: new IndexedMap<number, string>(),
                    listFormulaLocation: null,
                },
            };

            await downloadTags(syncCtx);
            await downloadCategories(syncCtx);
            await downloadTransactions(startDate, endDate, syncCtx);
        });

        loadedAppSettings.lastCompletedSyncUtc.value = currentSync.utc;
        loadedAppSettings.lastCompletedSyncVersion.value = currentSync.version;

        opDownloadData.setSuccess();
    } catch (err) {
        opDownloadData.setFailureAndRethrow(err);
    } finally {
        syncOperationProgressPercentage.value = 100;
        statusLog.setImportantOperationOngoing(prevImportantOperationOngoing);
        isSyncInProgress = false;
    }
}

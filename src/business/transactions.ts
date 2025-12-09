/// <reference types="office-js" />

import { errorTypeMessageString, formatDateUtc } from "src/util/format_util";
import { datetimeToExcel, findTableByNameOnSheet, getRangeBasedOn } from "./excel-util";
import type { Transaction, TransactionColumnSpec } from "./transaction-tools";
import {
    getTransactionColumnValue,
    SpecialColumnNames,
    createTransactionColumnsSpecs,
    tryGetTagGroupFromColumnName,
    getTagColumnsPosition,
    formatTagGroupColumnHeader,
} from "./transaction-tools";
import { isNullOrWhitespace } from "src/util/string_util";
import { parseTag } from "./tags";
import { authorizedFetch } from "./fetch-tools";
import type * as Lunch from "./lunchmoney-types";
import { IndexedMap } from "./IndexedMap";
import type { SyncContext } from "./sync-driver";
import { useSheetProgressTracker } from "src/composables/sheet-progress-tracker";
import { useOpTracker } from "src/status-tracker/composables/status-log";
import { type TrackedOperation } from "src/status-tracker/models/TrackedOperation";

export const SheetNameTransactions = "EL.Transactions";
const TableNameTransactions = "EL.TransactionsTable";

async function createNewTranTable(
    tranColumnsSpecs: IndexedMap<string, TransactionColumnSpec>,
    sheet: Excel.Worksheet,
    context: Excel.RequestContext
): Promise<Excel.Table> {
    const opCreateTransTable = useOpTracker().startOperation("Create new Transactions table");
    try {
        // Table location:
        const tranTableOffs = { row: 7, col: 1 };

        // No data is loaded yet. Only use the no-tag-group column for tags initially:
        const tranSpecColNames = tranColumnsSpecs.map((col) => col.name);

        // Clear the are where we are about to create the table:
        const tableInitRange = getRangeBasedOn(sheet, tranTableOffs, 0, 0, 2, tranSpecColNames.length);

        tableInitRange.clear();
        tableInitRange.conditionalFormats.clearAll();
        await context.sync();

        // Print column headers:
        getRangeBasedOn(sheet, tranTableOffs, 0, 0, 1, tranSpecColNames.length).values = [tranSpecColNames];

        // Create table:
        const table = sheet.tables.add(tableInitRange, true);
        table.name = TableNameTransactions;
        table.style = "TableStyleMedium9"; // e.g."TableStyleMedium2", "TableStyleDark1", "TableStyleLight9" ...

        await context.sync();

        // Load frequently used properties:
        table.load(["name", "id"]);
        table.getRange().load(["address"]);
        await context.sync();

        opCreateTransTable.setSuccess(`New Transactions table '${table.name}' created.`);
        return table;
    } catch (err) {
        return opCreateTransTable.setFailureAndRethrow(err);
    }
}

// If the sync context specified columns that were not already present in the table, insert them:
async function insertMissingTagColumns(tranTable: Excel.Table, context: SyncContext) {
    tranTable.columns.load(["count", "items"]);
    tranTable.rows.load(["count"]);
    await context.excel.sync();

    // Set of all required tag columns:
    const reqTagColNames = context.tags.assignable.keys().map((gn) => formatTagGroupColumnHeader(gn));
    const missingColNames = new Set(reqTagColNames);

    // Scroll through table, remove all encountered tag columns from search set:
    let firstTagColNum: number | undefined = undefined;
    for (let c = 0; c < tranTable.columns.count; c++) {
        const col = tranTable.columns.getItemAt(c).load(["name"]);
        await context.excel.sync();

        // If no more outstanding column names, be done:
        missingColNames.delete(col.name);
        if (missingColNames.size === 0) {
            return;
        }

        if (tryGetTagGroupFromColumnName(col.name)) {
            firstTagColNum = firstTagColNum === undefined ? c : firstTagColNum;
        }
    }

    if (firstTagColNum === undefined) {
        firstTagColNum = getTagColumnsPosition();
    }

    //Add required columns:
    const colNamesToAdd = [...missingColNames].sort().reverse();
    for (const cn of colNamesToAdd) {
        tranTable.columns.add(firstTagColNum, undefined, cn);
    }

    await context.excel.sync();
}

function setEditableHintRangeFormat(range: Excel.Range, editableState: "Read-Only" | "Editable") {
    range.clear();
    range.format.horizontalAlignment = Excel.HorizontalAlignment.center;
    range.format.verticalAlignment = Excel.VerticalAlignment.center;
    range.format.font.size = 10;

    switch (editableState) {
        case "Read-Only":
            range.format.fill.color = "#f2ceef";
            range.format.font.color = "#d76dcc";
            break;
        case "Editable":
            range.format.fill.color = "#b5e6a2";
            range.format.font.color = "#4ea72e";
            break;
    }

    range.dataValidation.prompt = {
        showPrompt: true,
        title: `${editableState} column`,
        message:
            editableState === "Read-Only"
                ? "Let ExpLens manage it for you."
                : editableState === "Editable"
                  ? "Select a value from the dropdown"
                  : "",
    };
}

async function printSheetHeaders(context: SyncContext) {
    context.sheets.trans.getRange("B2").values = [["Transactions"]];
    context.sheets.trans.getRange("B2:E2").style = "Heading 1";

    const tabRdOnlyMsgRange = context.sheets.trans.getRange("B3:E3");
    tabRdOnlyMsgRange.clear();
    tabRdOnlyMsgRange.merge();
    tabRdOnlyMsgRange.format.horizontalAlignment = Excel.HorizontalAlignment.left;
    tabRdOnlyMsgRange.format.verticalAlignment = Excel.VerticalAlignment.center;
    tabRdOnlyMsgRange.format.fill.color = "#fff8dc";
    tabRdOnlyMsgRange.format.font.color = "d76dcc";
    tabRdOnlyMsgRange.format.font.size = 10;

    tabRdOnlyMsgRange.getCell(0, 0).values = [["This tab is managed by ExpLens. Only modify specific columns:"]];

    const tabRwAreasDocRange = context.sheets.trans.getRange("B4:B4");
    setEditableHintRangeFormat(tabRwAreasDocRange, "Editable");
    tabRwAreasDocRange.format.font.bold = true;
    tabRwAreasDocRange.values = [["Editable Columns"]];

    const tabRoAreasDocRange = context.sheets.trans.getRange("C4:C4");
    setEditableHintRangeFormat(tabRoAreasDocRange, "Read-Only");
    tabRoAreasDocRange.format.font.bold = true;
    tabRoAreasDocRange.values = [["Read-Only Columns"]];

    await context.excel.sync();
}

async function createEditableHintHeader(tranTable: Excel.Table, tranTableColNames: string[], context: SyncContext) {
    const opCreateHintHeader = useOpTracker().startOperation(
        "Create Read-Only vs Editable hint header row for Transactions"
    );

    try {
        // Make sure we know where the table is:
        const tranTableRange = tranTable.getRange();
        tranTableRange.load(["address", "rowIndex", "columnIndex"]);
        await context.excel.sync();

        // Build the list of editable columns:
        const editableColumnNames = new Set<string>(["Category"]);
        for (const gn of context.tags.assignable.keys()) {
            editableColumnNames.add(formatTagGroupColumnHeader(gn));
        }

        // The RO columns are the vast majority.
        // First, apply Read-Only to the entire hint header row:
        const hintRowOffs = { row: tranTableRange.rowIndex - 1, col: tranTableRange.columnIndex };
        const hintHeaderRange = getRangeBasedOn(context.sheets.trans, hintRowOffs, 0, 0, 1, tranTableColNames.length);

        setEditableHintRangeFormat(hintHeaderRange, "Read-Only");
        await context.excel.sync();

        // Now, override the hints for the Editable columns only:

        for (let c = 0; c < tranTable.columns.count; c++) {
            const colName = tranTableColNames[c];
            if (colName && editableColumnNames.has(colName)) {
                const colHintCell = getRangeBasedOn(context.sheets.trans, hintRowOffs, 0, c, 1, 1);
                setEditableHintRangeFormat(colHintCell, "Editable");
            }
        }
        await context.excel.sync();

        opCreateHintHeader.setSuccess();
    } catch (err) {
        opCreateHintHeader.setFailureAndRethrow(err);
    }
}

function isColumnNamingEquivalent(
    columnsSpecs: IndexedMap<string, TransactionColumnSpec>,
    actualColumnNames: string[]
) {
    const opCheckColNaming = useOpTracker().startOperation("Validate Transactions table Column names");

    try {
        let expC = 0,
            actC = 0;
        while (true) {
            // Skip tag columns during structural comparison:
            while (expC < columnsSpecs.length && tryGetTagGroupFromColumnName(columnsSpecs.getByIndex(expC)!.name)) {
                expC++;
            }
            while (actC < actualColumnNames.length && tryGetTagGroupFromColumnName(actualColumnNames[actC]!)) {
                actC++;
            }

            // If both comparison column lists are exhausted, they match:
            if (expC === columnsSpecs.length && actC === actualColumnNames.length) {
                opCheckColNaming.setSuccess();
                return true;
            }

            // If only of of the comparison column lists is exhausted, they do not match:
            if (expC === columnsSpecs.length || actC === actualColumnNames.length) {
                opCheckColNaming.setFailure(
                    `isColumnNamingEquivalent(..):\n` +
                        `The lengths of 'columnsSpecs' (${columnsSpecs.length}) and` +
                        ` actualColumnNames (${actualColumnNames.length}) are different after accounting` +
                        ` for dynamic tag columns.`
                );
                return false;
            }

            // If col names at current cursors are different, lists do not match:
            if (columnsSpecs.getByIndex(expC)?.name !== actualColumnNames[actC]) {
                opCheckColNaming.setFailure(
                    `isColumnNamingEquivalent(..):\n` +
                        `After accounting for dynamic tag columns, aligned headers are not the same:\n` +
                        `columnsSpecs.getByIndex(${expC})?.name !== actualColumnNames[${actC}]` +
                        ` ('${columnsSpecs.getByIndex(expC)?.name}' !=== '${actualColumnNames[actC]}').`
                );
                return false;
            }

            // Names at current positions match, move cursors forward:
            expC++;
            actC++;
        }
    } catch (err) {
        return opCheckColNaming.setFailureAndRethrow(err);
    }
}

async function readExistingTransactions(
    tranTable: Excel.Table,
    tranTableColNames: string[],
    context: SyncContext
): Promise<IndexedMap<number, Excel.Range>> {
    const opReadExistingTrans = useOpTracker().startOperation(
        `Read ${tranTable.rows.count} existing data rows from '${tranTable.name}'`
    );

    let opReadStep: null | TrackedOperation = null;

    try {
        const existingTrans = new IndexedMap<number, Excel.Range>();

        const idColInd = tranTableColNames.findIndex((cn) => cn === SpecialColumnNames.LunchId);

        const idCol = tranTable.columns.getItemAt(idColInd);
        const idColRange = idCol.getDataBodyRange();

        idColRange.load(["values"]);
        await context.excel.sync();

        for (let r = 0; r < tranTable.rows.count; r++) {
            const progressUpdateStep = 250;
            if (r % progressUpdateStep === 0) {
                opReadStep?.setSuccess();
                opReadStep = useOpTracker().startOperation(
                    `Read rows ${r}...${r + progressUpdateStep},` +
                        ` out of ${tranTable.rows.count} from '${tranTable.name}'`
                );
            }

            // Range for this row:
            const rowRange = tranTable.rows.getItemAt(r).getRange();

            // Look up the id for this row from the ID-column we loaded earlier:
            const idRowVal = idColRange.values[r];

            if (idRowVal === undefined) {
                throw new Error(
                    `readExistingTransactions: idColRange.values[${r}] should be a one element` +
                        ` array containing the id, but it is undefined.`
                );
            }
            const lunchIdStr = idRowVal[0];
            if (lunchIdStr === undefined) {
                throw new Error(
                    `readExistingTransactions: lunchId (=idColRange.values[${r}][0]) should be a` +
                        ` number (the ID), but it is undefined.`
                );
            }
            const lunchId = Number(lunchIdStr);
            if (!Number.isInteger(lunchId)) {
                throw new Error(`Invalid ${SpecialColumnNames.LunchId}-value ('${lunchIdStr}') for item on row ${r}.`);
            }

            existingTrans.tryAdd(lunchId, rowRange);
        }

        opReadStep?.setSuccess();
        opReadExistingTrans.setSuccess(
            `Done reading ${existingTrans.length} existing data rows from table '${tranTable.name}'.`
        );
        return existingTrans;
    } catch (err) {
        opReadStep?.setFailure(err);
        return opReadExistingTrans.setFailureAndRethrow(err);
    }
}

async function fetchAndParseTransactions(startDate: Date, endDate: Date): Promise<IndexedMap<number, Transaction>> {
    // Make sure start and end are in the right order:
    if (startDate > endDate) {
        const d = startDate;
        startDate = endDate;
        endDate = d;
    }

    const opFetchAndParse = useOpTracker().startOperation(
        `Retrieve transactions from Lunch Money (${formatDateUtc(startDate)}...${formatDateUtc(endDate)})`
    );

    try {
        // Fetch the data in steps, one month at a time:
        const allFetchedTrans = [] as Lunch.Transaction[];

        let fetchStepStart = startDate;
        while (fetchStepStart <= endDate) {
            // Compute the boundaries of the fetch step (a month):
            const fetchStepMonthEnd = new Date(
                Date.UTC(fetchStepStart.getUTCFullYear(), fetchStepStart.getUTCMonth() + 1, 0)
            );

            const fetchStepEnd = fetchStepMonthEnd < endDate ? fetchStepMonthEnd : endDate;

            const fetchStepStartStr = formatDateUtc(fetchStepStart);
            const fetchStepEndStr = formatDateUtc(fetchStepEnd);

            // Fetch the data:
            const fetchedResponseText = await authorizedFetch(
                "GET",
                `transactions?start_date=${fetchStepStartStr}&end_date=${fetchStepEndStr}`,
                `get all transactions ${fetchStepStartStr}...${fetchStepEndStr}`
            );

            // Parse the data with a few defensive checks:
            const opParseStep = useOpTracker().startOperation(
                `Parse fetched transactions ${fetchStepStartStr}...${fetchStepEndStr}`
            );
            try {
                const fetched: { transactions: Lunch.Transaction[]; has_more: boolean } =
                    JSON.parse(fetchedResponseText);

                if (fetched.has_more) {
                    throw new Error(
                        "The LunchMoney 'v1/transactions' API returned 'true' in the 'has_more' field." +
                            "\n This was previously not supported by the backend, but it has apparently changed." +
                            " This is a breaking change in the backend API. The ExpLense needs to be updated" +
                            " and tested to account for this.\n Please reach out to the developers on GitHub."
                    );
                }

                // Defensive against some undocumented Lunch Money behavior:
                if (fetched.transactions === undefined) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const errorField = (fetched as any).error;
                    if (errorField) {
                        throw new Error(
                            `LunchMoney returned a non-error-code response,` +
                                ` but the payload contains an error message instead of data:` +
                                `\n "${errorField}"`
                        );
                    } else {
                        throw new Error(
                            `LunchMoney returned a non-error-code response,` +
                                ` but the payload contains does not contain expected data.`
                        );
                    }
                }

                const countFetched = fetched.transactions.length;
                for (let t = 0; t < countFetched; t++) {
                    const tran = fetched.transactions[t];
                    if (tran === undefined) {
                        throw new Error(
                            `fetched.transactions[${t}] is undefined, but fetched.transactions.length=${countFetched}`
                        );
                    }
                    allFetchedTrans.push(tran);
                }

                opParseStep.setSuccess({ countFetched: fetched.transactions.length });
            } catch (err) {
                opParseStep.setFailureAndRethrow(err);
            }

            // Next fetch step starts the day after fetchStepEnd:
            fetchStepStart = new Date(
                Date.UTC(fetchStepEnd.getUTCFullYear(), fetchStepEnd.getUTCMonth(), fetchStepEnd.getUTCDate() + 1)
            );
        }

        // All transactions are fetched. Build lookup table by ID, and also parse the Plaid metadata:

        const opHydrateTrans = useOpTracker().startOperation(
            `Parse Tags, Plaid & other metadata, and hydrate ${allFetchedTrans.length} transactions`
        );

        const receivedTrans = new IndexedMap<number, Transaction>();

        try {
            // Parse additional data for each transaction:
            let countPlaidMetadataObjectsParsed = 0;
            for (let t = 0; t < allFetchedTrans.length; t++) {
                const fetchedTran = allFetchedTrans[t];
                if (!fetchedTran) {
                    continue;
                }

                // Check for valid Lunch transaction ID:
                const fetchedTranId = fetchedTran.id;
                if (!Number.isInteger(fetchedTranId)) {
                    throw new Error(
                        `Cannot parse ID of fetched transaction #${t}. Integer ID expected. (Actual id='${fetchedTranId}'.)`
                    );
                }

                // Create transaction data structure and add it to the list:
                const tran: Transaction = {
                    trn: fetchedTran,
                    pld: null,
                    tag: new Map<string, Set<string>>(),
                    id: fetchedTranId,
                };

                receivedTrans.tryAdd(tran.id, tran);

                // If Plaid metadata is present, parse it and add to the data:
                const plaidDataStr = fetchedTran.plaid_metadata;
                const hasPlaid =
                    plaidDataStr !== undefined && plaidDataStr !== null && typeof plaidDataStr === "string";

                if (hasPlaid) {
                    const plaidMetadata: Lunch.PlaidMetadata = JSON.parse(plaidDataStr);
                    tran.pld = plaidMetadata;
                    countPlaidMetadataObjectsParsed++;
                }

                // For each tag of this transaction, and add it to the tag values collections:
                const receivedTags: { name: string; id: number }[] = tran.trn.tags ?? [];
                for (const tag of receivedTags) {
                    // Parse the tag:
                    const tagInfo = parseTag(tag.name);
                    //console.debug(`Transaction '${tran.trn.id}'. tagInfo:`, tagInfo);

                    // Add the tag to the list of this transaction:
                    let groupTags = tran.tag.get(tagInfo.group);
                    if (groupTags === undefined) {
                        groupTags = new Set<string>();
                        tran.tag.set(tagInfo.group, groupTags);
                    }
                    groupTags.add(tagInfo.value);
                }

                // opHydrateTrans.addInfo({
                //     t,
                //     fetchedTranId,
                //     hasPlaid,
                //     countTags: receivedTags.length,
                //     countTagGroups: tran.tag.size,
                // });
            }
            opHydrateTrans.setSuccess({
                countAllFetchedTrans: allFetchedTrans.length,
                countPlaidMetadataObjectsParsed,
                note:
                    "(Not all transactions have Plaid Metadata, e.g., groups, split transactions, transactions" +
                    " imported form sources other than Plaid...)",
            });
        } catch (err) {
            opHydrateTrans.setFailureAndRethrow(err);
        }

        opFetchAndParse.setSuccess();
        return receivedTrans;
    } catch (err) {
        return opFetchAndParse.setFailureAndRethrow(err);
    }
}

async function applyColumnFormatting(
    tranTable: Excel.Table,
    tranTableColNames: string[],
    tranColumnsSpecs: IndexedMap<string, TransactionColumnSpec>,
    context: SyncContext
) {
    const opApplyColsFormat = useOpTracker().startOperation("Apply formatting to table columns");
    let opColsFormatBatch: null | TrackedOperation = null;
    try {
        for (let c = 0; c < tranTableColNames.length; c++) {
            const progressApplyFormatBatchSize = 30;
            if (c % progressApplyFormatBatchSize === 0) {
                opColsFormatBatch?.setSuccess();
                opColsFormatBatch = useOpTracker().startOperation(
                    `Format table columns ${c}...${c + progressApplyFormatBatchSize},` +
                        ` out of ${tranTableColNames.length}`
                );
            }

            const colName = tranTableColNames[c]!;
            const tabCol = tranTable.columns.getItemAt(c);
            const colSpec = tranColumnsSpecs.getByKey(colName);
            if (colSpec === undefined) {
                continue;
            }

            const numFormat = colSpec.numberFormat;
            const formatFn = colSpec.formatFn;

            if (numFormat === null && formatFn === null) {
                continue;
            }

            const tabColRange = tabCol.getDataBodyRange();

            if (numFormat) {
                tabColRange.numberFormat = [[numFormat]];
            }

            if (formatFn) {
                try {
                    const formatFnRes = formatFn(tabColRange.format, tabColRange.dataValidation, context);
                    await formatFnRes;
                    await context.excel.sync();
                } catch (err) {
                    const errMsg =
                        `The formatFn of the column spec for '${colName}' threw an error` +
                        `\n(${errorTypeMessageString(err)})` +
                        `\nWe will skip over this and continue, but this needs to be corrected.`;
                    opColsFormatBatch?.addInfo(errMsg, err);
                    opApplyColsFormat.addInfo(errMsg, err);
                }
            }
        }

        await context.excel.sync();

        opColsFormatBatch?.setSuccess();
        opApplyColsFormat.setSuccess();
    } catch (err) {
        opColsFormatBatch?.setFailure(err);
        opApplyColsFormat.setFailureAndRethrow(err);
    }
}

async function createInfoRow(tranTable: Excel.Table, context: SyncContext) {
    const tranTableRange = tranTable.getRange();
    tranTableRange.load(["address", "rowIndex", "columnIndex", "name"]);
    await context.excel.sync();

    const infoRowOffs = { row: tranTableRange.rowIndex - 2, col: tranTableRange.columnIndex };

    // Count:
    const countTransLabelRange = getRangeBasedOn(context.sheets.trans, infoRowOffs, 0, 0, 1, 1);
    countTransLabelRange.format.fill.clear();
    countTransLabelRange.format.font.color = "#7e350e";
    countTransLabelRange.format.font.bold = true;
    countTransLabelRange.format.horizontalAlignment = "Right";
    countTransLabelRange.values = [["Count:"]];

    const countTransFormulaRange = getRangeBasedOn(context.sheets.trans, infoRowOffs, 0, 1, 1, 1);
    countTransFormulaRange.format.fill.color = "#f2f2f2";
    countTransFormulaRange.format.font.color = "#7e350e";
    countTransFormulaRange.format.font.bold = true;
    countTransFormulaRange.format.horizontalAlignment = "Left";
    countTransFormulaRange.formulas = [[`="  " & COUNTA(${tranTable.name}[${SpecialColumnNames.LunchId}])`]];

    // Last successful sync:
    const lastCompletedSyncLabelRange = getRangeBasedOn(context.sheets.trans, infoRowOffs, 0, 3, 1, 1);
    lastCompletedSyncLabelRange.format.fill.clear();
    lastCompletedSyncLabelRange.format.font.color = "#7e350e";
    lastCompletedSyncLabelRange.format.font.bold = true;
    lastCompletedSyncLabelRange.format.horizontalAlignment = "Right";
    lastCompletedSyncLabelRange.values = [["Last completed download data version / time:"]];

    const lastCompletedSyncVersionRange = getRangeBasedOn(context.sheets.trans, infoRowOffs, 0, 4, 1, 1);
    lastCompletedSyncVersionRange.format.fill.color = "#f2f2f2";
    lastCompletedSyncVersionRange.format.font.color = "#7e350e";
    lastCompletedSyncVersionRange.format.font.bold = true;
    lastCompletedSyncVersionRange.format.horizontalAlignment = "Left";
    lastCompletedSyncVersionRange.formulas = [[`="  " & "${context.currentSync.version}"`]];

    const lastCompletedSyncTimeRange = getRangeBasedOn(context.sheets.trans, infoRowOffs, 0, 5, 1, 1);
    lastCompletedSyncTimeRange.format.fill.color = "#f2f2f2";
    lastCompletedSyncTimeRange.format.font.color = "#7e350e";
    lastCompletedSyncTimeRange.format.font.bold = true;
    lastCompletedSyncTimeRange.format.horizontalAlignment = "Left";
    lastCompletedSyncTimeRange.values = [[datetimeToExcel(context.currentSync.utc, true)]];
    lastCompletedSyncTimeRange.numberFormat = [["  yyyy-mm-dd  HH:mm:ss"]];

    await context.excel.sync();
}

export async function downloadTransactions(startDate: Date, endDate: Date, context: SyncContext) {
    const transSheetProgressTracker = useSheetProgressTracker(31, 90, context);
    transSheetProgressTracker.setPercentage(0);

    // Activate the sheet:
    context.sheets.trans.activate();
    await context.excel.sync();

    // Clear and prepare the location for printing potential errors:
    const errorMsgBackgroundRange = context.sheets.trans.getRange("B5:F5");
    errorMsgBackgroundRange.clear();
    // errorMsgBackgroundRange.merge();
    // errorMsgBackgroundRange.format.horizontalAlignment = Excel.HorizontalAlignment.left;
    const errorMsgRange = errorMsgBackgroundRange.getCell(0, 0);
    await context.excel.sync();

    const opDownloadTrans = useOpTracker().startOperation("Download Transactions");
    try {
        transSheetProgressTracker.setPercentage(5);
        await printSheetHeaders(context);

        const tranColumnsSpecs: IndexedMap<string, TransactionColumnSpec> = createTransactionColumnsSpecs(context);

        // Make first (empty) column slim:
        context.sheets.trans.getRange("A:A").format.columnWidth = 15;
        await context.excel.sync();

        // if ("Testing errors".length < 100) {
        //     throw new Error("A test error was thrown. A detailed description of this error should be displayed.");
        // }

        // Is there an existing Transactions table?
        const prevTranTableInfo = await findTableByNameOnSheet(
            TableNameTransactions,
            context.sheets.trans,
            context.excel
        );

        // If there is no existing table, create an empty one:
        const tranTable =
            prevTranTableInfo === null
                ? await createNewTranTable(tranColumnsSpecs, context.sheets.trans, context.excel)
                : prevTranTableInfo.table;

        // If the sync context specified columns that were not already present in the table, insert them:
        await insertMissingTagColumns(tranTable, context);

        // Freeze table head:
        {
            context.sheets.trans.freezePanes.unfreeze();
            await context.excel.sync();

            const tranTableHeaderRange = tranTable.getHeaderRowRange();
            tranTableHeaderRange.load(["rowIndex"]);
            await context.excel.sync();

            context.sheets.trans.freezePanes.freezeRows(tranTableHeaderRange.rowIndex + 1);
            await context.excel.sync();
        }

        // Load the column names actually present in the table:
        const opLoadColNames = useOpTracker().startOperation("Load Transactions table column names");
        try {
            tranTable.columns.load(["count", "items"]);
            await context.excel.sync();
            for (const col of tranTable.columns.items) {
                col.load("name");
            }
            await context.excel.sync();

            opLoadColNames.setSuccess();
        } catch (err) {
            opLoadColNames.setFailureAndRethrow(err);
        }

        // Cache the actually present Transactions table Column Names:
        const tranTableColNames: string[] = tranTable.columns.items.map((col) => col.name.trim());

        // Create the RO/RW hints header above the table:
        await createEditableHintHeader(tranTable, tranTableColNames, context);

        // Ensure the ID column exists:
        if (!tranTableColNames.includes(SpecialColumnNames.LunchId)) {
            throw new Error(
                `Table '${tranTable.name}' (${prevTranTableInfo === null ? "newly created" : "pre-existing"})` +
                    ` does not contain the expected column '${SpecialColumnNames.LunchId}'.`
            );
        }

        // Validate that the actual column names match the spec (this ignores Tag columns):
        if (!isColumnNamingEquivalent(tranColumnsSpecs, tranTableColNames)) {
            throw new Error(
                `Columns in table '${TableNameTransactions}' do not match expected transaction` +
                    ` header structure. Try deleting the entire table.`
            );
        }

        transSheetProgressTracker.setPercentage(10);

        const opDeleteEmptyRows = useOpTracker().startOperation("Delete empty rows from the Transactions table");
        try {
            // Load the values from the table so that empty rows can be found and deleted:
            const tranTableBodyRange = tranTable.getDataBodyRange();
            tranTable.rows.load(["count"]);
            tranTableBodyRange.load("values");
            await context.excel.sync();

            const tranTableRowCount = tranTable.rows.count;
            const tranTableValues = tranTableBodyRange.values;

            // Delete empty rows (start from bottom to avoid index shift):
            let countEmptyRowsDeleted = 0;
            for (let r = tranTableValues.length - 1; r >= 0; r--) {
                // If we are at top row and all rows so far were deleted, skip.
                // This is because tables may never have zero rows.
                if (r === 0 && countEmptyRowsDeleted === tranTableRowCount - 1) {
                    continue;
                }
                const tranTableValueRow = tranTableValues[r]!;
                const isRowEmpty = tranTableValueRow.every((val) => isNullOrWhitespace(val));
                if (isRowEmpty) {
                    tranTable.rows.getItemAt(r).delete();
                    countEmptyRowsDeleted++;
                }
            }
            tranTable.rows.load(["count", "items"]);
            await context.excel.sync();

            opDeleteEmptyRows.setSuccess({ countEmptyRowsDeleted });
        } catch (err) {
            opDeleteEmptyRows.setFailureAndRethrow(err);
        }

        transSheetProgressTracker.setPercentage(15);

        // Load data from the table:
        const existingTrans = await readExistingTransactions(tranTable, tranTableColNames, context);

        transSheetProgressTracker.setPercentage(30);

        // Fetch transactions from the remote endpoint and parse the data:
        const receivedTrans: IndexedMap<number, Transaction> = await fetchAndParseTransactions(startDate, endDate);

        transSheetProgressTracker.setPercentage(60);

        // Merge: Go over downloaded transactions and decide what to do with Each:
        // - Existing transitions:
        //   - In No-Update mode: Just Skip;
        //   - In Update mode:
        //     Loop over each property of Existing, compare with Received; If different - track for update;
        //     If any differences found: Update table right away;
        // - New transactions:
        //   Create new data row for insertion;
        // Finally, insert all newly create rows into the table.

        const tranRowsToAdd: (string | boolean | number)[][] = [];

        const opMergeTrans = useOpTracker().startOperation("Merge received and existing transactions");
        let opMergeTransStep: null | TrackedOperation = null;

        try {
            const colIndexLastSyncVersion = tranTableColNames.findIndex(
                (cn) => cn === SpecialColumnNames.LastSyncVersion
            );
            const countExistingTransFound = {
                sameAsReceived: 0,
                differentFromReceived: 0,
                notComparedWithReceived: 0,
            };

            for (let t = 0; t < receivedTrans.length; t++) {
                const mergeProgressUpdateStep = 250;
                if (t % mergeProgressUpdateStep === 0) {
                    opMergeTransStep?.setSuccess();
                    opMergeTransStep = useOpTracker().startOperation(
                        `Merge transactions ${t}...${t + mergeProgressUpdateStep}, out of ${receivedTrans.length}`
                    );
                }

                const tran = receivedTrans.getByIndex(t);
                if (tran === undefined) {
                    continue;
                }

                // If Transaction already in table (existing):
                const exTranRange = existingTrans.getByKey(tran.id);
                if (exTranRange !== undefined) {
                    // If replacing existing transitions is NOT required, just skip it:
                    if (!context.isUpdateExistingTransactions) {
                        countExistingTransFound.notComparedWithReceived++;
                        continue;
                    }

                    // Replacing the existing transitions is IS required. So:
                    // Loop over the existing data and compare it with received data:
                    exTranRange.load(["values", "formulas"]);
                    await context.excel.sync();
                    const tranDataVals = exTranRange.values[0]!;
                    const tranFormulas = exTranRange.formulas[0]!;
                    let needsUpdating = false;
                    for (let c = 0; c < tranDataVals.length; c++) {
                        // Skip the sync version column, as it is always different:
                        if (c === colIndexLastSyncVersion) {
                            continue;
                        }

                        // Check whether received data is different, and if so - track for update:
                        const colName = tranTableColNames[c]!;
                        const existingColVal = tranDataVals[c];
                        const receivedColVal = getTransactionColumnValue(tran, colName, tranColumnsSpecs);
                        if (existingColVal !== receivedColVal) {
                            if (
                                typeof existingColVal === "number" &&
                                typeof receivedColVal === "string" &&
                                Number(receivedColVal.trim()) === existingColVal
                            ) {
                                // Excel eagerly converts strings to numbers.
                                // If after that conversions, values match, we consider them Equal.
                            } else if (tranFormulas[c] === receivedColVal) {
                                // The existing value doesn't match, but the formula does.
                                // No need to update, but we still copy the formula
                                // in case we detect the need to update based on another column:
                                tranDataVals[c] = tranFormulas[c];
                            } else {
                                // NO match for either column or formula. Track for UPDATE:
                                tranDataVals[c] = receivedColVal;
                                needsUpdating = true;
                            }
                        }
                    }

                    // If the received data is different, update the transaction row:
                    if (needsUpdating) {
                        tranDataVals[colIndexLastSyncVersion] = context.currentSync.version;
                        exTranRange.values = [tranDataVals];
                        countExistingTransFound.differentFromReceived++;
                        await context.excel.sync();
                    } else {
                        countExistingTransFound.sameAsReceived++;
                    }
                } else {
                    // The `exTran` is undefined, i.e. received `tran` is new.
                    // Initialize a new data row based on the received transaction:
                    const rowToAdd: (string | boolean | number)[] = [];

                    for (const colName of tranTableColNames) {
                        if (colName === SpecialColumnNames.LastSyncVersion) {
                            rowToAdd.push(context.currentSync.version);
                        } else {
                            rowToAdd.push(getTransactionColumnValue(tran, colName, tranColumnsSpecs));
                        }
                    }

                    // Add the transaction data row to the list of rows to add:
                    tranRowsToAdd.push(rowToAdd);
                }
            }

            opMergeTransStep?.setSuccess();
            opMergeTrans.setSuccess({
                countReceivedTrans: receivedTrans.length,
                isReplaceExistingTrans: context.isUpdateExistingTransactions,
                countExistingTransFound,
                countTranRowsToAdd: tranRowsToAdd.length,
            });
        } catch (err) {
            opMergeTransStep?.setFailure(err);
            opMergeTrans.setFailureAndRethrow(err);
        }

        transSheetProgressTracker.setPercentage(67);

        // Insert new transaction rows:

        const opInsertRows = useOpTracker().startOperation("Insert rows into Transactions table", {
            rowCount: tranRowsToAdd.length,
        });
        try {
            const addChunkSize = 250;
            let addChungStart = 0;
            while (addChungStart < tranRowsToAdd.length) {
                const opInsertRowsChunk = useOpTracker().startOperation(
                    `Insert rows ${addChungStart}...${addChungStart + addChunkSize} of ${tranRowsToAdd.length}`
                );
                try {
                    const tranRowsToAddChunk = tranRowsToAdd.slice(addChungStart, addChungStart + addChunkSize);
                    tranTable.rows.add(0, tranRowsToAddChunk);
                    await context.excel.sync();
                    addChungStart += addChunkSize;
                    opInsertRowsChunk.setSuccess();
                } catch (err) {
                    opInsertRowsChunk.setFailureAndRethrow(err);
                }
            }
            opInsertRows.setSuccess();
        } catch (err) {
            opInsertRows.setFailureAndRethrow(err);
        }

        transSheetProgressTracker.setPercentage(75);

        // Sort the table:
        const opSortTranTable = useOpTracker().startOperation("Sort the Transactions table");
        try {
            const sortFields: Excel.SortField[] = [
                {
                    key: tranTableColNames.findIndex((cn) => cn === "date"),
                    sortOn: Excel.SortOn.value,
                    ascending: false,
                },
                {
                    key: tranTableColNames.findIndex((cn) => cn === "plaid:authorized_datetime"),
                    sortOn: Excel.SortOn.value,
                    ascending: false,
                },
                {
                    key: tranTableColNames.findIndex((cn) => cn === "Account"),
                    sortOn: Excel.SortOn.value,
                    ascending: true,
                },
                {
                    key: tranTableColNames.findIndex((cn) => cn === "Payer"),
                    sortOn: Excel.SortOn.value,
                    ascending: true,
                },
                {
                    key: tranTableColNames.findIndex((cn) => cn === "payee"),
                    sortOn: Excel.SortOn.value,
                    ascending: true,
                },
                {
                    key: tranTableColNames.findIndex((cn) => cn === "plaid:datetime"),
                    sortOn: Excel.SortOn.value,
                    ascending: false,
                },
                {
                    key: tranTableColNames.findIndex((cn) => cn === SpecialColumnNames.LunchId),
                    sortOn: Excel.SortOn.value,
                    ascending: true,
                },
            ].filter((f) => f.key >= 0);

            tranTable.sort.apply(sortFields);
            await context.excel.sync();

            opSortTranTable.setSuccess();
        } catch (err) {
            opSortTranTable.setFailureAndRethrow(err);
        }

        transSheetProgressTracker.setPercentage(80);

        // Apply formatting to all columns and rows:
        await applyColumnFormatting(tranTable, tranTableColNames, tranColumnsSpecs, context);

        transSheetProgressTracker.setPercentage(90);

        // Add info on transactions count, and on version and time of the last successful sync:
        await createInfoRow(tranTable, context);

        // Auto-fit the table:
        tranTable.getRange().format.autofitColumns();
        await context.excel.sync();

        transSheetProgressTracker.setPercentage(100);
        opDownloadTrans.setSuccess();
    } catch (err) {
        errorMsgRange.values = [[`ERR: ${errorTypeMessageString(err)}`]];
        errorMsgRange.format.font.color = "#FF0000";
        await context.excel.sync();
        opDownloadTrans.setFailureAndRethrow(err);
    }
}

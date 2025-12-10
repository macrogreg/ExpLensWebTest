/// <reference types="office-js" />

import { errorTypeMessageString } from "src/util/format_util";
import { findTableByNameOnSheet, formatCellAddressAsAbsolute, getRangeBasedOn, timeStrToExcel } from "./excel-util";
import { authorizedFetch } from "./fetch-tools";
import type { Category } from "./lunchmoney-types";
import type { SyncContext } from "./sync-driver";
import { useSheetProgressTracker } from "src/composables/sheet-progress-tracker";
import { IndexedMap } from "./IndexedMap";
import { useOpTracker } from "src/status-tracker/composables/status-log";

export const SheetNameCategories = "EL.Categories";
const TableNameCategories = "EL.CategoriesTable";

export interface ExpenseCategory {
    LabelId: string;
    description: string;
    is_group: boolean;
    is_income: boolean;
    exclude_from_budget: boolean;
    exclude_from_totals: boolean;
    archived: boolean;
    created_at: number;
    updated_at: number;
    archived_on: number | "";
    LabelL1: string;
    LabelL2: string;
    LunchId: number;
    order: number;
    name: string;
}

const categoryHeaders = [
    "LabelId",
    "description",
    "is_group",
    "is_income",
    "exclude_from_budget",
    "exclude_from_totals",
    "archived",
    "created_at",
    "updated_at",
    "archived_on",
    "LabelL1",
    "LabelL2",
    "LunchId",
    "order",
    "name",
];

function categoryToArray(cat: ExpenseCategory): (string | boolean | number)[] {
    const arr: (string | boolean | number)[] = [];
    for (const h of categoryHeaders) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        arr.push((cat as any)[h]);
    }
    return arr;
}

function extractLevelLabel(labelId: string, level: number): string {
    labelId = labelId.trim();
    let d = 0;
    for (let p = 0; p < labelId.length; p++) {
        if (labelId[p] === "/") {
            d++;
            if (d === level) {
                return labelId.substring(0, p);
            }
        }
    }

    return labelId;
}

export async function downloadCategories(context: SyncContext) {
    const catsSheetProgressTracker = useSheetProgressTracker(16, 30, context);
    catsSheetProgressTracker.setPercentage(0);

    // Activate the sheet:
    context.sheets.cats.activate();
    await context.excel.sync();

    // Clear and prepare the location for printing potential errors:
    const errorMsgBackgroundRange = context.sheets.cats.getRange("B4:F4");
    errorMsgBackgroundRange.clear();
    // errorMsgBackgroundRange.merge();
    // errorMsgBackgroundRange.format.horizontalAlignment = Excel.HorizontalAlignment.left;
    const errorMsgRange = errorMsgBackgroundRange.getCell(0, 0);
    await context.excel.sync();

    const opDownloadCategories = useOpTracker().startOperation("Download Categories");
    try {
        catsSheetProgressTracker.setPercentage(2);

        // Fetch Categories from the Cloud:
        const fetchedResponseText = await authorizedFetch("GET", "categories?format=flattened", "get all categories");

        catsSheetProgressTracker.setPercentage(35);

        // Parse fetched Categories:
        const fetchedResponseData: { categories: Category[] } = JSON.parse(fetchedResponseText);

        catsSheetProgressTracker.setPercentage(40);

        // Build category lookup table (used for creating LabelIds):
        const fetchedCats = new Map<number, Category>();
        for (const lmCat of fetchedResponseData.categories) {
            fetchedCats.set(lmCat.id, lmCat);
        }

        // Prepare the caretory data for the table:
        const categories: ExpenseCategory[] = [];
        for (const lmCat of fetchedCats.values()) {
            // Build LabelId:
            const lookupCat = (id: number | null) => (id === null ? undefined : fetchedCats.get(id));

            let labelId = lmCat.name.trim();
            let parent = lookupCat(lmCat.group_id);
            while (parent) {
                labelId = `${parent.name.trim()}/${labelId}`;
                parent = lookupCat(parent.group_id);
            }

            // Create category data object and add it to the list:
            categories.push({
                LabelId: labelId,
                is_group: lmCat.is_group,
                is_income: lmCat.is_income,
                exclude_from_budget: lmCat.exclude_from_budget,
                exclude_from_totals: lmCat.exclude_from_totals,
                description: lmCat.description ?? "",
                updated_at: timeStrToExcel(lmCat.updated_at)!,
                archived: lmCat.archived,
                created_at: timeStrToExcel(lmCat.created_at)!,
                archived_on: lmCat.archived_on === null ? "" : timeStrToExcel(lmCat.archived_on)!,
                LabelL1: extractLevelLabel(labelId, 1),
                LabelL2: extractLevelLabel(labelId, 2),
                LunchId: lmCat.id,
                order: lmCat.order,
                name: lmCat.name,
            });
        }

        // Sort by display order:
        categories.sort((c1, c2) => c1.order - c2.order);

        // Initialize list of assignable categories (in the correct order):
        context.cats.assignable = new IndexedMap<number, string>();
        for (const cat of categories) {
            if (cat.is_group !== true && cat.archived !== true) {
                context.cats.assignable.tryAdd(cat.LunchId, cat.LabelId);
            }
        }

        catsSheetProgressTracker.setPercentage(55);

        // Data ready. Now refresh the view.

        // If there an existing Categories table on the WRONG sheet - throw an error:
        await findTableByNameOnSheet(TableNameCategories, context.sheets.cats, context.excel);

        // Location of Categ tables:
        const catTableOffs = { row: 7, col: 3 };
        const catAssignableListOffs = { row: 7, col: 1 };

        // !! Must NOT sync until tables are rebuilt to avoid breaking references
        {
            context.excel.workbook.application.suspendApiCalculationUntilNextSync();
            context.excel.workbook.application.suspendScreenUpdatingUntilNextSync();

            // Delete everything:
            const prevUsedRange = context.sheets.cats.getUsedRange();
            prevUsedRange.clear();
            prevUsedRange.conditionalFormats.clearAll();

            // Print Categ headers:
            getRangeBasedOn(context.sheets.cats, catTableOffs, 0, 0, 1, categoryHeaders.length).values = [
                categoryHeaders,
            ];

            // Print Categ data:
            const categTableData = categories.map((c) => categoryToArray(c));

            getRangeBasedOn(context.sheets.cats, catTableOffs, 1, 0, categories.length, categoryHeaders.length).values =
                categTableData;

            // Frame Categ table:
            const categTable = context.sheets.cats.tables.add(
                getRangeBasedOn(context.sheets.cats, catTableOffs, 0, 0, categories.length + 1, categoryHeaders.length),
                true
            );
            categTable.name = TableNameCategories;
            categTable.style = "TableStyleMedium12"; // e.g."TableStyleMedium2", "TableStyleDark1", "TableStyleLight9" ...

            // Set time columns format:
            for (let h = 0; h < categoryHeaders.length; h++) {
                const catName = categoryHeaders[h]!;
                if (catName.endsWith("_on") || catName.endsWith("_at")) {
                    getRangeBasedOn(context.sheets.cats, catTableOffs, 1, h, categories.length, 1).numberFormat = [
                        ["yyyy-mm-dd hh:mm"],
                    ];
                }
            }
        }
        // !! Cleared tables are now recreated. Can sync again.

        await context.excel.sync();

        // Auto-fit the table:
        getRangeBasedOn(context.sheets.cats, catTableOffs, 0, 0, 1, categoryHeaders.length).format.autofitColumns();
        await context.excel.sync();

        catsSheetProgressTracker.setPercentage(80);

        // Assignable categories:

        // Print Assignable Categories Table Header:
        const assCatsHeadRange = getRangeBasedOn(context.sheets.cats, catAssignableListOffs, 0, 0, 1, 1);
        assCatsHeadRange.values = [["LabelId"]];
        assCatsHeadRange.format.fill.color = "#0f9ed5";
        assCatsHeadRange.format.font.color = "#FFFFFF";

        // Print the formula that extracts the Assignable Categories from the table:
        const assCatsFormulaRange = getRangeBasedOn(context.sheets.cats, catAssignableListOffs, 1, 0, 1, 1);
        assCatsFormulaRange.load("address");
        await context.excel.sync();

        context.cats.listFormulaLocation = formatCellAddressAsAbsolute(assCatsFormulaRange.address);
        assCatsFormulaRange.formulas = [
            [
                `= LET(
    LabelIdValues, ${TableNameCategories}[LabelId],
    OrderValues, ${TableNameCategories}[order],
    Filter, (${TableNameCategories}[is_group] = FALSE) * (${TableNameCategories}[archived] = FALSE),

    FilteredValues, FILTER(
        HSTACK(LabelIdValues, OrderValues),
        Filter
    ),
    SortedValues, SORTBY(FilteredValues, INDEX(FilteredValues,,2), 1),
    SortedAndFilteredLabelIds, INDEX(SortedValues,,1),
    SortedAndFilteredLabelIds
)`,
            ],
        ];

        // Print borders around the assignable categories list:
        const countAssCat = context.cats.assignable.length;
        const assCatsBodyRange = getRangeBasedOn(context.sheets.cats, catAssignableListOffs, 0, 0, countAssCat + 1, 1);
        assCatsBodyRange.format.font.bold = true;

        const assCatsBorderTop = assCatsBodyRange.format.borders.getItem("EdgeTop");
        assCatsBorderTop.color = "#0f9ed5";
        assCatsBorderTop.weight = "Thick";
        assCatsBorderTop.style = "Continuous";
        const assCatsBorderLeft = assCatsBodyRange.format.borders.getItem("EdgeLeft");
        assCatsBorderLeft.color = "#0f9ed5";
        assCatsBorderLeft.weight = "Thick";
        assCatsBorderLeft.style = "Continuous";
        const assCatsBorderRight = assCatsBodyRange.format.borders.getItem("EdgeRight");
        assCatsBorderRight.color = "#0f9ed5";
        assCatsBorderRight.weight = "Thick";
        assCatsBorderRight.style = "Continuous";
        const assCatsBorderBottom = assCatsBodyRange.format.borders.getItem("EdgeBottom");
        assCatsBorderBottom.color = "#0f9ed5";
        assCatsBorderBottom.weight = "Thick";
        assCatsBorderBottom.style = "Continuous";
        await context.excel.sync();

        // Auto-fit the data column:
        assCatsFormulaRange.format.autofitColumns();
        await context.excel.sync();

        catsSheetProgressTracker.setPercentage(90);

        // Counts header:
        const countsLabelRange = getRangeBasedOn(context.sheets.cats, catTableOffs, -1, -1, 1, 1);
        countsLabelRange.values = [["← counts →"]];
        countsLabelRange.format.horizontalAlignment = "Center";
        countsLabelRange.format.font.color = "#074f69";
        countsLabelRange.format.font.bold = true;

        // Formula to count all categories int he table:
        const allCatsCountRange = getRangeBasedOn(context.sheets.cats, catTableOffs, -1, 0, 1, 1);
        allCatsCountRange.format.horizontalAlignment = "Left";
        allCatsCountRange.format.fill.color = "#f2f2f2";
        allCatsCountRange.format.font.color = "#074f69";
        allCatsCountRange.format.font.bold = true;

        allCatsCountRange.formulas = [[`="  " & COUNTA(${TableNameCategories}[labelId])`]];

        // Formula to count the assignable categories (previously selected by respective formula):
        const assCatsCountRange = getRangeBasedOn(context.sheets.cats, catAssignableListOffs, -1, 0, 1, 1);
        assCatsCountRange.format.horizontalAlignment = "Left";
        assCatsCountRange.format.fill.color = "#f2f2f2";
        assCatsCountRange.format.font.color = "#074f69";
        assCatsCountRange.format.font.bold = true;

        assCatsCountRange.formulas = [[`="  " & COUNTA(${context.cats.listFormulaLocation}#)`]];

        await context.excel.sync();

        catsSheetProgressTracker.setPercentage(95);

        // Headings:
        {
            // Sheet header:
            context.sheets.cats.getRange("B2").values = [["Categories"]];
            context.sheets.cats.getRange("B2:E2").style = "Heading 1";

            const tabRdOnlyMsgRange = context.sheets.cats.getRange("B3:E3");
            tabRdOnlyMsgRange.clear();
            tabRdOnlyMsgRange.merge();
            tabRdOnlyMsgRange.format.horizontalAlignment = Excel.HorizontalAlignment.left;
            tabRdOnlyMsgRange.format.verticalAlignment = Excel.VerticalAlignment.center;
            tabRdOnlyMsgRange.format.fill.color = "#fff8dc";
            tabRdOnlyMsgRange.format.font.color = "d76dcc";
            tabRdOnlyMsgRange.format.font.size = 10;

            tabRdOnlyMsgRange.getCell(0, 0).values = [["This tab is managed by ExpLens. Do not modify."]];
        }

        // Sub headers:
        context.sheets.cats.getRange("B5").values = [["Assignable Categories"]];
        context.sheets.cats.getRange("B5:B5").style = "Heading 2";

        context.sheets.cats.getRange("D5").values = [["All Categories"]];
        getRangeBasedOn(context.sheets.cats, { row: 4, col: 3 }, 0, 0, 1, categoryHeaders.length).style = "Heading 2";

        await context.excel.sync();

        catsSheetProgressTracker.setPercentage(100);
        opDownloadCategories.setSuccess();
    } catch (err) {
        errorMsgRange.values = [[`ERR: ${errorTypeMessageString(err)}`]];
        errorMsgRange.format.font.color = "#FF0000";
        await context.excel.sync();
        opDownloadCategories.setFailureAndRethrow(err);
    }
}

import type * as Lunch from "./lunchmoney-types";
import { timeStrToExcel } from "./excel-util";
import { isNotNullOrWhitespaceStr, isNullOrWhitespace } from "src/util/string_util";
import { getTagGroups, getTagValues, TagGroupSeparator, type TagValuesCollection } from "./tags";
import type { SyncContext } from "./sync-driver";
import { IndexedMap } from "./IndexedMap";
import { useStatusLog } from "src/status-tracker/composables/status-log";
import { EventLevelKind } from "src/status-tracker/models/EventLevelKind";

const ApplyReadOnlyCellValidationOptions = { usePrompt: false, useRule: false } as const;

export interface Transaction {
    trn: Lunch.Transaction;
    pld: Lunch.PlaidMetadata | null;
    tag: TagValuesCollection;
    id: number;
}

const TagColumnsPlaceholder = "<Tag Groups Columns>";
const TagGroupColumnNamePrefix = `Tag${TagGroupSeparator}`;

export const SpecialColumnNames = {
    LunchId: "LunchId" as const,
    LastSyncVersion: "LastSyncVersion" as const,
};

const AccountingWithMinusFormatStr = `_($* #,##0.00_);_($* -#,##0.00_);_($* "-"??_);_(@_)` as const;

type ValueExtractor = (trans: Transaction) => string | boolean | number | null | undefined;

type TransactionColumnFormatter = (
    format: Excel.RangeFormat,
    validation: Excel.DataValidation,
    context: SyncContext
) => Promise<void> | void;

export interface TransactionColumnSpec {
    name: string;
    valueFn: ValueExtractor;
    numberFormat: null | string;
    formatFn: null | TransactionColumnFormatter;
}

const transactionColumnsSpecs: TransactionColumnSpec[] = [
    transColumn("date", (t) => timeStrToExcel(t.trn.date), "yyyy-mm-dd"),

    transColumn("Account", (t) => t.trn.account_display_name),
    transColumn(
        "Payer",
        (t) => {
            const own = t.pld?.account_owner ?? "";
            const norm = own
                .replace(/[.,?!:_]/g, " ") // replace punctuation with space
                .replace(/\s+/g, " ") // collapse consecutive whitespace
                .trim();
            const lowTl = norm.replace(/\b(\w)(\w*)/g, (_, first, tail) => first + tail.toLowerCase());
            return lowTl;
        },
        null,
        async (format, validation, context) => {
            format.font.load(["size"]);
            await context.excel.sync();
            format.font.size = Math.max(format.font.size - 2, 9);
            format.horizontalAlignment = "Left";

            const stdRoValFn = getApplyReadOnlyCellValidationFn();
            await stdRoValFn?.(format, validation, context);
        }
    ),

    transColumn("payee", (t) => t.trn.payee),
    transColumn("Amount", (t) => t.trn.to_base, AccountingWithMinusFormatStr),

    transColumn(
        "Category",
        (t) => JJ(t.trn.category_group_name, t.trn.category_name),
        null,
        async (_: Excel.RangeFormat, validation: Excel.DataValidation, context: SyncContext) => {
            validation.clear();
            await context.excel.sync();
            validation.ignoreBlanks = true;

            if (isNotNullOrWhitespaceStr(context.cats.listFormulaLocation)) {
                validation.rule = { list: { inCellDropDown: true, source: `=${context.cats.listFormulaLocation}#` } };
            } else {
                validation.prompt = {
                    showPrompt: true,
                    title: "",
                    message: "Failed to determine valid options for Category",
                };
            }
        }
    ),

    transColumn(TagColumnsPlaceholder, (_) => null),

    transColumn("Plaid:MerchantCategory", (t) => J(t.pld?.category)),
    transColumn("Plaid:TransactionCategory", (t) => {
        const p = t.pld?.personal_finance_category?.primary?.replaceAll("_", " ").trim() ?? "";
        const d = t.pld?.personal_finance_category?.detailed?.replaceAll("_", " ").trim() ?? "";

        const s = d.startsWith(p) ? d.slice(p.length).trim() : d;

        const regEx = /\b(\w)(\w*)/g;
        const lowerTail = (_: unknown, first: string, tail: string) => first + tail.toLowerCase();
        const pl = p.replace(regEx, lowerTail);
        const sl = s.replace(regEx, lowerTail);

        return JJ(pl, sl);
    }),

    transColumn("status", (t) => t.trn.status),

    transColumn("recurring_description", (t) => t.trn.recurring_description),

    transColumn(
        "ContainerMoniker",
        (_) =>
            `=LET(
    ContainerId, IFS(
        [@[group_id]] <> "", [@[group_id]],
        [@[parent_id]] <> "", [@[parent_id]],
        TRUE, ""
    ),
    ContainerPayee, XLOOKUP(ContainerId, [LunchId], [payee], ""),
    ContainerMoniker, IF(ContainerPayee <> "",
        ContainerPayee,
        IFS(
            AND(--[@[is_group]], --[@[has_children]]), "[_IS_GROUP_HAS_CHILDREN_]",
            [@[is_group]], "[_IS_GROUP_]",
            [@[has_children]], "[_HAS_CHILDREN_]",
            TRUE, ""
        )
    ),
    ContainerMoniker
)`
    ),

    transColumn("is_income", (t) => t.trn.is_income),
    transColumn("exclude_from_budget", (t) => t.trn.exclude_from_budget),
    transColumn("exclude_from_totals", (t) => t.trn.exclude_from_totals),

    transColumn("has_children", (t) => t.trn.has_children),
    transColumn("is_group", (t) => t.trn.is_group),
    transColumn("is_pending", (t) => t.trn.is_pending),

    transColumn("display_notes", (t) => t.trn.display_notes),

    transColumn("currency", (t) => t.trn.currency),
    transColumn("to_base", (t) => t.trn.to_base, AccountingWithMinusFormatStr),

    transColumn("category_id", (t) => t.trn.category_id),
    transColumn("category_name", (t) => t.trn.category_name),
    transColumn("category_group_id", (t) => t.trn.category_group_id),
    transColumn("category_group_name", (t) => t.trn.category_group_name),

    transColumn("created_at", (t) => t.trn.created_at),
    transColumn("updated_at", (t) => t.trn.updated_at),

    transColumn("notes", (t) => t.trn.notes),
    transColumn("original_name", (t) => t.trn.original_name),
    transColumn("recurring_id", (t) => t.trn.recurring_id),
    transColumn("recurring_payee", (t) => t.trn.recurring_payee),

    transColumn("recurring_cadence", (t) => t.trn.recurring_cadence),
    transColumn("recurring_granularity", (t) => t.trn.recurring_granularity),
    transColumn("recurring_quantity", (t) => t.trn.recurring_quantity),
    transColumn("recurring_type", (t) => t.trn.recurring_type),
    transColumn("recurring_amount", (t) => t.trn.recurring_amount, AccountingWithMinusFormatStr),
    transColumn("recurring_currency", (t) => t.trn.recurring_currency),
    transColumn("parent_id", (t) => t.trn.parent_id),

    transColumn("group_id", (t) => t.trn.group_id),

    transColumn("_amount", (t) => t.trn.amount, AccountingWithMinusFormatStr),
    transColumn("AccountWithOwner", (t) => JJ(t.trn.account_display_name, t.pld?.account_owner)),

    transColumn("asset_id", (t) => t.trn.asset_id),
    transColumn("asset_institution_name", (t) => t.trn.asset_institution_name),
    transColumn("asset_name", (t) => t.trn.asset_name),
    transColumn("asset_display_name", (t) => t.trn.asset_display_name),
    transColumn("asset_status", (t) => t.trn.asset_status),

    transColumn("plaid_account_id", (t) => t.trn.plaid_account_id),
    transColumn("plaid_account_name", (t) => t.trn.plaid_account_name),
    transColumn("plaid_account_mask", (t) => t.trn.plaid_account_mask),
    transColumn("institution_name", (t) => t.trn.institution_name),
    transColumn("plaid_account_display_name", (t) => t.trn.plaid_account_display_name),
    //plaid_metadata,
    transColumn("plaid_category", (t) => t.trn.plaid_category ?? ""),
    transColumn("source", (t) => t.trn.source),
    transColumn("display_name", (t) => t.trn.display_name),

    transColumn("account_display_name", (t) => t.trn.account_display_name),
    transColumn("original_tags", (t) =>
        J(
            t.trn.tags?.map((t) => t.name),
            TagListSeparator
        )
    ),
    transColumn("external_id", (t) => t.trn.external_id),

    transColumn("plaid:account_id", (t) => t.pld?.account_id),
    transColumn("plaid:account_owner", (t) => t.pld?.account_owner),
    transColumn("plaid:amount", (t) => t.pld?.amount, AccountingWithMinusFormatStr),
    transColumn("plaid:authorized_date", (t) => timeStrToExcel(t.pld?.authorized_date), "yyyy-mm-dd"),
    transColumn("plaid:authorized_datetime", (t) => timeStrToExcel(t.pld?.authorized_datetime), "yyyy-mm-dd hh:mm:ss"),
    transColumn("plaid:category,l1", (t) => t.pld?.category?.[0]),
    transColumn("plaid:category,l2", (t) => J([t.pld?.category?.[0], t.pld?.category?.[1]])),
    transColumn("plaid:category,l3", (t) => J([t.pld?.category?.[0], t.pld?.category?.[1], t.pld?.category?.[2]])),
    transColumn("plaid:category_id", (t) => t.pld?.category_id),
    transColumn("plaid:check_number", (t) => t.pld?.check_number),
    transColumn("plaid:counterparties.count", (t) => t.pld?.counterparties?.length),
    transColumn("plaid:counterparty#01.confidence_level", (t) => t.pld?.counterparties?.[0]?.confidence_level),
    transColumn("plaid:counterparty#01.entity_id", (t) => t.pld?.counterparties?.[0]?.entity_id),
    transColumn("plaid:counterparty#01.logo_url", (t) => t.pld?.counterparties?.[0]?.logo_url),
    transColumn("plaid:counterparty#01.name", (t) => t.pld?.counterparties?.[0]?.name),
    transColumn("plaid:counterparty#01.phone_number", (t) => t.pld?.counterparties?.[0]?.phone_number),
    transColumn("plaid:counterparty#01.type", (t) => t.pld?.counterparties?.[0]?.type),
    transColumn("plaid:counterparty#01.website", (t) => t.pld?.counterparties?.[0]?.website),
    transColumn("plaid:date", (t) => timeStrToExcel(t.pld?.date), "yyyy-mm-dd"),
    transColumn("plaid:datetime", (t) => timeStrToExcel(t.pld?.datetime), "yyyy-mm-dd hh:mm:ss"),
    transColumn("plaid:iso_currency_code", (t) => t.pld?.iso_currency_code),
    transColumn("plaid:location.address", (t) => t.pld?.location?.address),
    transColumn("plaid:location.city", (t) => t.pld?.location?.city),
    transColumn("plaid:location.country", (t) => t.pld?.location?.country),
    transColumn("plaid:location.lat", (t) => t.pld?.location?.lat),
    transColumn("plaid:location.lon", (t) => t.pld?.location?.lon),
    transColumn("plaid:location.postal_code", (t) => t.pld?.location?.postal_code),
    transColumn("plaid:location.region", (t) => t.pld?.location?.region),
    transColumn("plaid:location.store_number", (t) => t.pld?.location?.store_number),
    transColumn("plaid:logo_url", (t) => t.pld?.logo_url),
    transColumn("plaid:merchant_entity_id", (t) => t.pld?.merchant_entity_id),
    transColumn("plaid:merchant_name", (t) => t.pld?.merchant_name),
    transColumn("plaid:name", (t) => t.pld?.name),
    transColumn("plaid:payment_channel", (t) => t.pld?.payment_channel),
    transColumn("plaid:payment_meta.by_order_of", (t) => t.pld?.payment_meta?.by_order_of),
    transColumn("plaid:payment_meta.payee", (t) => t.pld?.payment_meta?.payee),
    transColumn("plaid:payment_meta.payer", (t) => t.pld?.payment_meta?.payer),
    transColumn("plaid:payment_meta.payment_method", (t) => t.pld?.payment_meta?.payment_method),
    transColumn("plaid:payment_meta.payment_processor", (t) => t.pld?.payment_meta?.payment_processor),
    transColumn("plaid:payment_meta.ppd_id", (t) => t.pld?.payment_meta?.ppd_id),
    transColumn("plaid:payment_meta.reason", (t) => t.pld?.payment_meta?.reason),
    transColumn("plaid:payment_meta.reference_number", (t) => t.pld?.payment_meta?.reference_number),
    transColumn("plaid:pending", (t) => t.pld?.pending),
    transColumn("plaid:pending_transaction_id", (t) => t.pld?.pending_transaction_id),
    transColumn(
        "plaid:personal_finance_category.confidence_level",
        (t) => t.pld?.personal_finance_category?.confidence_level
    ),
    transColumn("plaid:personal_finance_category.detailed", (t) => t.pld?.personal_finance_category?.detailed),
    transColumn("plaid:personal_finance_category.primary", (t) => t.pld?.personal_finance_category?.primary),
    transColumn("plaid:personal_finance_category.version", (t) => t.pld?.personal_finance_category?.version),
    transColumn("plaid:personal_finance_category_icon_url", (t) => t.pld?.personal_finance_category_icon_url),
    transColumn("plaid:transaction_code", (t) => t.pld?.transaction_code),
    transColumn("plaid:transaction_id", (t) => t.pld?.transaction_id),
    transColumn("plaid:transaction_type", (t) => t.pld?.transaction_type),
    transColumn("plaid:unofficial_currency_code", (t) => t.pld?.unofficial_currency_code),
    transColumn("plaid:website", (t) => t.pld?.website),

    transColumn(
        SpecialColumnNames.LunchId,
        (t) => t.trn.id,
        null,
        (format) => {
            format.font.size = 6;
            format.verticalAlignment = "Center";
            format.horizontalAlignment = "Right";
        }
    ),

    transColumn("plaid:website", (t) => t.pld?.website),

    transColumn(SpecialColumnNames.LastSyncVersion, (_) => null),
];

function transColumn(
    name: string,
    valueFn: ValueExtractor,
    numberFormat: null | string = null,
    formatFn: null | TransactionColumnFormatter = null
): TransactionColumnSpec {
    return {
        name: name.trim(),
        valueFn,
        numberFormat,
        formatFn: formatFn ?? getApplyReadOnlyCellValidationFn(),
    };
}

function transTagColumn(tagGroupName: string, context?: SyncContext): TransactionColumnSpec {
    const validationListLocation = context?.tags.groupListFormulaLocations.get(tagGroupName);

    const selectTagValidator: TransactionColumnFormatter = async (
        _: Excel.RangeFormat,
        validation: Excel.DataValidation,
        context: SyncContext
    ) => {
        validation.clear();
        await context.excel.sync();
        validation.ignoreBlanks = true;

        if (validationListLocation) {
            validation.rule = { list: { inCellDropDown: true, source: `=${validationListLocation}#` } };
        } else {
            validation.prompt = {
                showPrompt: true,
                title: "",
                message: `Failed to determine valid options for '${formatTagGroupColumnHeader(tagGroupName)}'`,
            };
        }
    };

    return {
        name: formatTagGroupColumnHeader(tagGroupName),
        valueFn: (t: Transaction) => getTransactionTagsByGroup(t, tagGroupName),
        numberFormat: null,
        formatFn: selectTagValidator,
    };
}

export function createTransactionColumnsSpecs(context: SyncContext): IndexedMap<string, TransactionColumnSpec> {
    const tagColsSpecs = getTagGroups(context.tags.assignable).map((grNm) => transTagColumn(grNm, context));

    const allColsSpecs = transactionColumnsSpecs.flatMap((col) =>
        col.name === TagColumnsPlaceholder ? tagColsSpecs : col
    );

    const specs = new IndexedMap<string, TransactionColumnSpec>();
    for (const cs of allColsSpecs) {
        specs.tryAdd(cs.name, cs);
    }

    return specs;
}

export function getTagColumnsPosition() {
    let p = transactionColumnsSpecs.findIndex((cs) => cs.name === TagColumnsPlaceholder);
    if (p >= 0) {
        return p;
    }

    useStatusLog().tracker.observeEvent(
        EventLevelKind.Wrn,
        `The 'transactionColumnsSpecs' should contain '${TagColumnsPlaceholder}',` +
            ` but it does not. A graceful fallback will be used, but this should be addressed!`
    );

    p = transactionColumnsSpecs.findIndex((cs) => cs.name.toUpperCase() === "CATEGORY");
    if (p < 0) p = transactionColumnsSpecs.findIndex((cs) => cs.name.toUpperCase() === "PAYEE");
    if (p < 0) p = 0;
    return p;
}

function getTransactionTagsByGroup(tran: Transaction, tagGroupName: string) {
    const groupTagsList = getTagValues(tran.tag, tagGroupName);
    const tagsStr = J(groupTagsList, TagListSeparator) as string;
    return tagsStr;
}

export function formatTagGroupColumnHeader(groupName: string) {
    return `${TagGroupColumnNamePrefix}${groupName}`.trim();
}

export function tryGetTagGroupFromColumnName(columnName: string): string | undefined {
    columnName = columnName.trim();
    if (!columnName.startsWith(TagGroupColumnNamePrefix)) {
        return undefined;
    }

    return columnName.substring(TagGroupColumnNamePrefix.length);
}

export function getTransactionColumnValue(
    tran: Transaction,
    colName: string,
    columnSpecs: IndexedMap<string, TransactionColumnSpec>
): string | boolean | number {
    const colSpec = columnSpecs.getByKey(colName);

    let value;
    if (colSpec !== undefined) {
        value = colSpec.valueFn(tran);
    } else {
        const tagGroupName = tryGetTagGroupFromColumnName(colName);
        if (tagGroupName !== undefined) {
            value = getTransactionTagsByGroup(tran, tagGroupName);
        } else {
            throw new Error(`Cannot find specification for column '${colName}'.`);
        }
    }

    return value === null || value === undefined ? "" : value;
}

const StructureLevelSeparator = " / ";
const TagListSeparator = ", ";

function JJ(v1: string | null | undefined, v2: string | null | undefined, separator: string = StructureLevelSeparator) {
    const r1 = v1 === null || v1 === undefined ? "" : v1;
    const r2 = v2 === null || v2 === undefined ? "" : v2;
    return r1.length > 0 && r2.length > 0 ? r1 + separator + r2 : r1 + r2;
}

function J(vals: (string | null | undefined)[] | null | undefined, separator: string = StructureLevelSeparator) {
    if (vals === null || vals === undefined) {
        return null;
    }
    return vals.map((v) => (isNullOrWhitespace(v) ? "*" : v)).join(separator);
}

function getApplyReadOnlyCellValidationFn(): null | TransactionColumnFormatter {
    return ApplyReadOnlyCellValidationOptions.usePrompt || ApplyReadOnlyCellValidationOptions.useRule
        ? applyReadOnlyCellValidation
        : null;
}

function applyReadOnlyCellValidation(
    format: Excel.RangeFormat,
    validation: Excel.DataValidation,
    context: SyncContext
) {
    return setAllStopValidationRule(format, validation, context, ApplyReadOnlyCellValidationOptions);
}

async function setAllStopValidationRule(
    _: Excel.RangeFormat,
    validation: Excel.DataValidation,
    context: SyncContext,
    options: { usePrompt: boolean; useRule: boolean }
) {
    if (options.usePrompt || options.useRule) {
        validation.clear();
        await context.excel.sync();
    }

    if (options.usePrompt) {
        validation.prompt = {
            showPrompt: true,
            title: "Don't modify!",
            message: "ExpLens manages this cell for you.",
        };

        try {
            // This is such a treacherous bug is it happens, hard to diagnose. Be defensive.
            if (validation.prompt.message.length > 230) {
                useStatusLog().tracker.observeError(
                    "setAllStopValidationRule: validation Prompt message is too long",
                    `About to fail:\n` +
                        ` The length of 'validation.prompt.message'` +
                        ` MUST be <= 255, and SHOULD be <= 230 to leave space for Excel's postfixes.` +
                        `\n However, the length is ${validation.prompt.message.length}.`
                );
            }
        } catch {
            // If prompt was not set, length may not be loaded. Just ignore.
        }
    }

    if (options.useRule) {
        validation.rule = { custom: { formula: '=("Cell managed by ExpLens" = "Do not modify!")' } };
        validation.ignoreBlanks = false;

        validation.errorAlert = {
            showAlert: true,
            style: Excel.DataValidationAlertStyle.warning,
            title: "Cell protected by ExpLens: Do not edit!",
            message:
                "This cell is managed by ExpLens." +
                "\nModifying it MAY break data look-up for other cells." +
                "\nEven if nothing breaks, the change will NOT sync back to Lunch Money." +
                "\n" +
                "\nWe'll mark a Data Validation Error; you can clear it AT OR OWN RISK!",
        };

        try {
            if (validation.errorAlert.message.length > 230) {
                // This is such a treacherous bug is it happens, hard to diagnose. Be defensive.
                useStatusLog().tracker.observeError(
                    "setAllStopValidationRule: validation Error Alert message is too long",
                    `About to fail:\n` +
                        ` The length of 'validation.errorAlert.message'` +
                        ` MUST be <= 255, and SHOULD be <= 230 to leave space for Excel's postfixes.` +
                        `\n However, the length is ${validation.errorAlert.message.length}.`
                );
            }
        } catch {
            // If alert was not set, length may not be loaded. Just ignore.
        }
    }
}

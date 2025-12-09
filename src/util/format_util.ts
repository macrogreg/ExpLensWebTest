import { containsAtLeastNRegex, isNotNullOrWhitespaceStr } from "./string_util.js";

export const NewLineString = "\n" as const;

export function formatDateUtc(datetime: Date): string {
    if (datetime === null || datetime === undefined || !(datetime instanceof Date)) {
        throw new Error("formatDateUtc(..) expects datetime to be a valid instance of Date.");
    }

    const yyyy = pad(4, datetime.getUTCFullYear());
    const mm = pad(2, datetime.getUTCMonth() + 1);
    const dd = pad(2, datetime.getUTCDate());

    return `${yyyy}-${mm}-${dd}`;
}

export function formatDateLocal(datetime: Date): string {
    if (datetime === null || datetime === undefined || !(datetime instanceof Date)) {
        throw new Error("formatDateLocal(..) expects datetime to be a valid instance of Date.");
    }

    const yyyy = pad(4, datetime.getFullYear());
    const mm = pad(2, datetime.getMonth() + 1);
    const dd = pad(2, datetime.getDate());

    return `${yyyy}-${mm}-${dd}`;
}

export function formatDateTimeLocalLong(datetime: Date): string {
    if (datetime === null || datetime === undefined || !(datetime instanceof Date)) {
        throw new Error("formatDateTimeLocalLong(..) expects datetime to be a valid instance of Date.");
    }

    const yyyy = pad(4, datetime.getFullYear());
    //const yy = pad(3, datetime.getFullYear() % 100);
    const mm = pad(2, datetime.getMonth() + 1);
    const dd = pad(2, datetime.getDate());
    const hh = pad(2, datetime.getHours());
    const mn = pad(2, datetime.getMinutes());
    const ss = pad(2, datetime.getSeconds());
    const mil = pad(3, datetime.getMilliseconds());

    return `${yyyy}-${mm}-${dd} ${hh}:${mn}:${ss}.${mil}`;
}

function pad(minLen: number, value: number): string {
    return value.toString().padStart(minLen, "0");
}

export function errorTypeString(error: unknown): string {
    if (error === null) return "null";

    if (typeof error === "object" && error instanceof Error) {
        return error.name ?? "null";
    }

    return getClassName(error);
}

export function errorTypeMessageString(error: unknown): string {
    if (error === null) return "null";

    if (typeof error === "string") return error;

    if (typeof error === "object") {
        if (error instanceof String) {
            return error.toString();
        }

        if (error instanceof Error) {
            return `${error.name ?? "NullErrorName"}: '${error.message ?? "NullErrorMessage"}'`;
        }
    }

    return getClassName(error);
}

export function getClassName(instance: unknown): string {
    if (instance === null) {
        return "null";
    }

    if (instance === undefined) {
        return "undefined";
    }

    if (typeof instance !== "object") {
        return typeof instance;
    }

    const toString = (val: unknown) => (isNotNullOrWhitespaceStr(val) ? val : formatValueSimple(val));

    // Support "branded" instances:
    if (Symbol.toStringTag in instance) {
        const monikerTag = instance[Symbol.toStringTag];
        return toString(monikerTag);
    }

    const proto = Object.getPrototypeOf(instance);

    // Support "branded" prototypes:
    if (Symbol.toStringTag in proto) {
        const monikerTag = proto[Symbol.toStringTag];
        return toString(monikerTag);
    }

    // Instance and prototype are not "branded". Fall back to ctor name:
    const ctor = proto && proto.constructor;
    if (ctor && "name" in ctor && isNotNullOrWhitespaceStr(ctor.name)) {
        return ctor.name;
    }

    // Ctor has no name (minified?). Try printing it (e.g.: "function MyClass() { [code] }"):
    if (ctor && "toString" in ctor && typeof ctor.toString === "function") {
        try {
            const ctorStr = ctor.toString();
            // matches "function Foo" or "class Foo":
            const match = ctorStr.match(/function\s+([A-Za-z0-9_$]+)/) || ctorStr.match(/class\s+([A-Za-z0-9_$]+)/);
            if (match && isNotNullOrWhitespaceStr(match[1])) return match[1];
        } catch {
            // Type mismatch safety
        }
    }

    // Fallback for plain objects or no prototype. Expect format:
    // 012345678901234
    // [object Object]
    return Object.prototype.toString.call(instance).slice(8, -1);
}

export function formatValueSimple(value: unknown): string {
    function errorFormatSafe(err: unknown) {
        try {
            return errorTypeMessageString(err);
        } catch {
            return "FormattingError";
        }
    }

    try {
        return formatValueSimpleUnsafe(value);
    } catch (err) {
        const valueFallback = "Value-Format-Failure";
        const errorStr = errorFormatSafe(err);
        return `[(${valueFallback}), (${errorStr})]`;
    }
}

function formatValueSimpleUnsafe(value: unknown) {
    //
    // const typeofInfo: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" =
    //     typeof info;

    if (value === undefined) {
        return "<UNDEFINED>";
    }

    if (value === null) {
        return "<NULL>";
    }

    if (typeof value === "string") {
        return `"${value}"`;
    }

    if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint" ||
        typeof value === "symbol"
    ) {
        return String(value);
    }

    if (typeof value === "function") {
        const countFuncArgs = value.length;
        return `function ${value.name}(of ${countFuncArgs} ${countFuncArgs === 1 ? "arg" : "args"})`;
    }

    if (value instanceof Error) {
        return errorTypeMessageString(value);
    }

    if (Array.isArray(value)) {
        return value.length === 0 ? "[]" : `Array{length=${value.length}}`;
    }

    if (value instanceof Map) {
        return `Map{size=${value.size}}`;
    }

    if (value instanceof Set) {
        return `Set{size=${value.size}}`;
    }

    try {
        const className = getClassName(value);
        const instanceStr = `[instanceof ${className}]`;
        return instanceStr;
    } catch {
        return typeof value;
    }
}

export type FormatValueOptions = {
    readonly baseIndent?: string;
    readonly levelIndent?: string;
    readonly maxCollectionLength?: number;
};

function withDefaultFormatValueOptions(options: FormatValueOptions | undefined): Required<FormatValueOptions> {
    return {
        baseIndent: options?.baseIndent ?? "",
        levelIndent: options?.levelIndent ?? "    ",
        maxCollectionLength: options?.maxCollectionLength ?? 50,
    };
}

function formatIndent(level: number, options: Required<FormatValueOptions>): string {
    if (level < 0) {
        return "";
    }

    if (level === 0) {
        return options.baseIndent;
    }

    if (level === 1) {
        return options.baseIndent + options.levelIndent;
    }

    return options.baseIndent + options.levelIndent.repeat(level);
}

export function formatValue(value: unknown, indentLevel: number = 0, options?: FormatValueOptions): string {
    const allOptions = withDefaultFormatValueOptions(options);
    try {
        return formatValueAny(value, indentLevel, allOptions);
    } catch (err) {
        const simpleVal = formatValueSimple(value);
        const simpleErr = formatValueSimple(err);
        return `[(${simpleVal}), (${simpleErr})]`;
    }
}

function formatValueAny(value: unknown, indentLevel: number, options: Required<FormatValueOptions>): string {
    //
    // const typeofInfo: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" =
    //     typeof info;

    if (value === undefined) {
        return "<UNDEFINED>";
    }

    if (value === null) {
        return "<NULL>";
    }

    if (typeof value === "string") {
        return `"${value}"`;
    }

    if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint" ||
        typeof value === "symbol"
    ) {
        return String(value);
    }

    if (typeof value === "function") {
        const countFuncArgs = value.length;
        return `function ${value.name}(of ${countFuncArgs} ${countFuncArgs === 1 ? "arg" : "args"})`;
    }

    if (Array.isArray(value)) {
        return formatValueArray(value, indentLevel, options);
    }

    if (value instanceof Error) {
        return errorTypeMessageString(value);
    }

    if (value instanceof Set) {
        return formatValueSet(value, indentLevel, options);
    }

    if (value instanceof Map) {
        return formatValueMap(value, indentLevel, options);
    }

    return formatValueObject(value, indentLevel, options);
}

function formatValueArray(value: Array<unknown>, indentLevel: number, options: Required<FormatValueOptions>): string {
    if (!Array.isArray(value)) {
        throw new Error(`This API only formats arrays, but value is '${formatValueSimple(value)}'.`);
    }

    // Special case empty arrays:
    if (value.length === 0) {
        return "[]";
    }

    // Special case arrays with one element:
    if (value.length === 1) {
        const itemStr = formatValue(
            value.find(() => true),
            indentLevel + 1,
            options
        );
        return `[ ${itemStr} ]`;
    }

    // Display arrays with one element per line, displaying both, index and value.
    // For sparse arrays only display present items.
    // Prepend with label stating number of elements.
    const itemIndentStr = NewLineString + formatIndent(indentLevel + 1, options);
    const baseIndentStr = NewLineString + formatIndent(indentLevel, options);

    const arrInfo = isSparseArray(value);
    const arrTypeDescr = arrInfo.label;

    const elStrs = [];
    for (const [i, val] of value.entries()) {
        if (!(i in value)) {
            continue;
        }

        if (elStrs.length >= options.maxCollectionLength) {
            const remItems = arrInfo.size - elStrs.length;
            const [pref, cmp] = arrInfo.type === "MaybeSparse" ? ["at least ", ">="] : ["", "="];
            elStrs.push(
                `${itemIndentStr}[...] = ${pref}${remItems} more items (length=${value.length},size${cmp}${arrInfo.size})`
            );
            break;
        }

        elStrs.push(`${itemIndentStr}[${i}] = ${formatValue(val, indentLevel + 1, options)}`);
    }

    const joinedElStrs = elStrs.join(",");

    const arrayStr = `${arrTypeDescr}[${joinedElStrs}${baseIndentStr}]`;
    return arrayStr;
}

function formatValueSet(value: Set<unknown>, indentLevel: number, options: Required<FormatValueOptions>): string {
    if (value === null) {
        throw new Error(`This API only formats Set instances, but value is 'null'.`);
    }

    if (!(value instanceof Set)) {
        throw new Error(`This API only formats Set instances, but value is '${formatValueSimple(value)}'.`);
    }

    // Special case empty arrays:
    if (value.size === 0) {
        return "Set(0)";
    }

    // Special case arrays with one element:
    if (value.size === 1) {
        const itemStr = formatValue(value.keys().next().value, indentLevel + 1, options);
        return `Set(1){ ${itemStr} }`;
    }

    // Display arrays with one element per line, displaying both, index and value.
    // For sparse arrays only display present items.
    // Prepend with label stating number of elements.
    const itemIndentStr = NewLineString + formatIndent(indentLevel + 1, options);
    const baseIndentStr = NewLineString + formatIndent(indentLevel, options);

    const elStrs = [];
    for (const val of value) {
        if (elStrs.length >= options.maxCollectionLength) {
            const remItems = value.size - elStrs.length;
            elStrs.push(`${itemIndentStr}{...${remItems} more items} (size=${value.size})`);
            break;
        }

        elStrs.push(itemIndentStr + formatValue(val, indentLevel + 1, options));
    }

    const arrTypeDescr = `Set(${value.size})`;
    const joinedElStrs = elStrs.join(",");

    const arrayStr = `${arrTypeDescr}{${joinedElStrs}${baseIndentStr}}`;
    return arrayStr;
}

function formatValueMap(
    value: Map<unknown, unknown>,
    indentLevel: number,
    options: Required<FormatValueOptions>
): string {
    if (value === null) {
        throw new Error(`This API only formats Map instances, but value is 'null'.`);
    }

    if (!(value instanceof Map)) {
        throw new Error(`This API only formats Map instances, but value is '${formatValueSimple(value)}'.`);
    }

    // Special case empty arrays:
    if (value.size === 0) {
        return "Map(0)";
    }

    // Special case arrays with one element:
    if (value.size === 1) {
        const [key, val] = value.entries().next().value!;
        const keyStr = formatValue(key, indentLevel + 1, options);
        const valStr = formatValue(val, indentLevel + 1, options);
        return `Map(1){ [${keyStr}] => ${valStr} }`;
    }

    // Display arrays with one element per line, displaying both, index and value.
    // For sparse arrays only display present items.
    // Prepend with label stating number of elements.
    const itemIndentStr = NewLineString + formatIndent(indentLevel + 1, options);
    const baseIndentStr = NewLineString + formatIndent(indentLevel, options);

    const elStrs = [];
    for (const [key, val] of value) {
        if (elStrs.length >= options.maxCollectionLength) {
            const remItems = value.size - elStrs.length;
            elStrs.push(`${itemIndentStr}{...${remItems} more items} (size=${value.size})`);
            break;
        }

        const keyStr = formatValue(key, indentLevel + 1, options);
        const valStr = formatValue(val, indentLevel + 1, options);
        elStrs.push(`${itemIndentStr}[${keyStr}] => ${valStr}`);
    }

    const arrTypeDescr = `Map(${value.size})`;
    const joinedElStrs = elStrs.join(",");

    const arrayStr = `${arrTypeDescr}{${joinedElStrs}${baseIndentStr}}`;
    return arrayStr;
}

function formatValueObject(value: object, indentLevel: number, options: Required<FormatValueOptions>): string {
    if (value === null) {
        throw new Error(`This API only formats object instances, but value is 'null'.`);
    }

    if (typeof value !== "object") {
        throw new Error(`This API only formats objects, but value is '${typeof value}'.`);
    }

    const valueClass = getClassName(value);
    const valueClassView = valueClass === "Object" ? "" : valueClass;

    const oneIndentStr = options.levelIndent ?? "";
    const baseIndentStr = formatIndent(indentLevel, options);
    const valueStr = JSON.stringify(value, undefined, oneIndentStr);
    const typedValueStr = `${valueClassView}${valueStr}`;

    // Must escape `oneIndentStr` if it contains regex control chars,
    // but for now it is only expected to contain white spaces.
    const indentPattern = new RegExp(`(\\r\\n|\\r|\\n)${oneIndentStr}`, "g");

    // If the JSON has multiple properties, then it is already formatted to multiple lines and we need to indent it.
    // Otherwise reformat it to use a single line:
    const hasTwoOrMoreProps = containsAtLeastNRegex(typedValueStr, indentPattern, 2);
    if (hasTwoOrMoreProps) {
        const indentValStr = typedValueStr.replace(/(\r\n|\r|\n)/g, `$1${baseIndentStr}`);
        return indentValStr;
    } else {
        const nonIndentValueStr = JSON.stringify(value);
        const nonIndentTypedValueStr = `${valueClassView}${nonIndentValueStr}`;
        return nonIndentTypedValueStr;
    }
}

function isSparseArray(
    array: Array<unknown>,
    maxTestLength = 50000
): {
    readonly type: "Normal" | "Sparse" | "MaybeSparse";
    readonly length: number;
    readonly size: number; // number of actually present indices
    readonly label: string;
} {
    const testLen = Math.min(array.length, Math.max(0, maxTestLength));
    const isWithinTestLength = testLen === array.length;

    let countInds = 0;
    let isSparse = false;
    for (let i = 0; i < testLen; i++) {
        if (i in array) {
            countInds++;
        } else {
            isSparse = true;
        }
    }

    return {
        type: isWithinTestLength ? (isSparse ? "Sparse" : "Normal") : "MaybeSparse",
        length: array.length,
        size: countInds,
        label: isWithinTestLength
            ? isSparse
                ? `Sparse(l=${array.length},s=${countInds})`
                : `Array(${array.length})`
            : `MaybeSparse(l=${array.length},s>=${countInds})`,
    };
}

import { type SyncContext } from "src/business/sync-driver";

export function useSheetProgressTracker(
    sheetProgressPercentageRangeStart: number,
    sheetProgressPercentageRangeEnd: number,
    context: SyncContext
) {
    const validatePercentageValue = (value: number, valueName: string) => {
        if (value < 0 || 100 < value) {
            throw new Error(`'${valueName}' must be in range 0..100%, but it is '${value}%'.`);
        }
    };

    validatePercentageValue(sheetProgressPercentageRangeStart, "sheetProgressPercentageRangeStart");
    validatePercentageValue(sheetProgressPercentageRangeEnd, "sheetProgressPercentageRangeEnd");

    if (sheetProgressPercentageRangeEnd <= sheetProgressPercentageRangeStart) {
        throw new Error(
            `Expected sheetProgressPercentageRangeStart < sheetProgressPercentageRangeEnd, but found:` +
                ` sheetProgressPercentageRangeStart='${sheetProgressPercentageRangeStart}',` +
                ` sheetProgressPercentageRangeEnd='${sheetProgressPercentageRangeEnd}'.`
        );
    }

    const sheetProgressPercentageRange = sheetProgressPercentageRangeEnd - sheetProgressPercentageRangeStart;

    return {
        setPercentage: (relativeProgressPercentage: number) => {
            validatePercentageValue(relativeProgressPercentage, "relativeProgressPercentage");

            const totalProgress =
                sheetProgressPercentageRangeStart + (sheetProgressPercentageRange / 100.0) * relativeProgressPercentage;

            context.progressPercentage.value = totalProgress;
        },
    };
}

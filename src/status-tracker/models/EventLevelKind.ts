export enum EventLevelKind {
    Inf = 1,
    Wrn = 2,
    Err = 4,
    Suc = 8,
    ConsoleCapture = 512,
    WindowErrCapture = 1024,
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EventLevelKind {
    export function is(eventLevel: EventLevelKind, isKind: EventLevelKind): boolean {
        return (eventLevel & isKind) === (isKind as number);
    }
}

/** @internal */
export function formatEventLevelKind(level: EventLevelKind): string {
    const captureKind = formatEventLevelCaptureKind(level);
    const severityKind = formatEventLevelSeverityKind(level);
    return captureKind + severityKind;
}

/** @internal */
export function formatEventLevelCaptureKind(level: EventLevelKind): string {
    if (EventLevelKind.is(level, EventLevelKind.ConsoleCapture)) {
        return "🖥️";
    } else if (EventLevelKind.is(level, EventLevelKind.WindowErrCapture)) {
        return "📄";
    } else {
        return "";
    }
}

function formatEventLevelSeverityKind(level: EventLevelKind): string {
    if (EventLevelKind.is(level, EventLevelKind.Inf)) {
        return "ℹ️";
    } else if (EventLevelKind.is(level, EventLevelKind.Wrn)) {
        return "⚠️";
    } else if (EventLevelKind.is(level, EventLevelKind.Err)) {
        return "❌";
    } else if (EventLevelKind.is(level, EventLevelKind.Suc)) {
        return "🟢";
    } else {
        return "❔";
    }
}

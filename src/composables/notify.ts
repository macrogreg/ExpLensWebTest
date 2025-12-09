import { Notify } from "quasar";

export function notifyPositive(message: string, caption?: string, icon?: string) {
    const notifyParams = {
        type: "positive",
        textColor: "grey-10",
        closeBtn: true,
        message: message ?? " ",
    };

    if (caption && caption.trim().length > 0) {
        (notifyParams as Record<string, unknown>)["caption"] = caption;
    }

    if (icon && icon.trim().length > 0) {
        (notifyParams as Record<string, unknown>)["icon"] = icon;
    }

    Notify.create(notifyParams);
}

export function notifyNegative(message: string, caption?: string, icon?: string) {
    const notifyParams = {
        type: "negative",
        textColor: "grey-10",
        closeBtn: true,
        message: message ?? " ",
    };

    if (caption && caption.trim().length > 0) {
        (notifyParams as Record<string, unknown>)["caption"] = caption;
    }

    if (icon && icon.trim().length > 0) {
        (notifyParams as Record<string, unknown>)["icon"] = icon;
    }

    Notify.create(notifyParams);
}

export function notifyWarning(message: string, caption?: string, icon?: string) {
    const notifyParams = {
        type: "warning",
        textColor: "grey-10",
        closeBtn: true,
        message: message ?? " ",
    };

    if (caption && caption.trim().length > 0) {
        (notifyParams as Record<string, unknown>)["caption"] = caption;
    }

    if (icon && icon.trim().length > 0) {
        (notifyParams as Record<string, unknown>)["icon"] = icon;
    }

    Notify.create(notifyParams);
}

export function notifyInfo(message: string, caption?: string, icon?: string) {
    const notifyParams = {
        type: "info",
        textColor: "grey-10",
        closeBtn: true,
        message: message ?? " ",
    };

    if (caption && caption.trim().length > 0) {
        (notifyParams as Record<string, unknown>)["caption"] = caption;
    }

    if (icon && icon.trim().length > 0) {
        (notifyParams as Record<string, unknown>)["icon"] = icon;
    }

    Notify.create(notifyParams);
}

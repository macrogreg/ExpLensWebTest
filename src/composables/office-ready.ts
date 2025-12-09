/// <reference types="office-js" />

import { useStatusLog } from "src/status-tracker/composables/status-log";
import { errorTypeMessageString } from "src/util/format_util";

function errorMessage(mainMessage: string) {
    return `Cannot initialize Office APIs: ${mainMessage} \nAre you viewing this within the Excel side panel?`;
}

export async function useOffice(
    useLog: boolean = false
): Promise<{ host: Office.HostType; platform: Office.PlatformType }> {
    const opUseOffice = useLog ? useStatusLog().tracker.startOperation("Initialize Office APIs") : null;

    try {
        if (typeof Office === "undefined") {
            const errMsg = errorMessage("`Office` is not defined in any loaded module.");
            opUseOffice?.addInfo(errMsg);
            throw new Error(errMsg);
        }

        if (Office === undefined || Office === null) {
            const errMsg = errorMessage("`Office` is defined as `null` or `undefined`.");
            opUseOffice?.addInfo(errMsg, { Office: Office });
            throw new Error(errMsg);
        }

        if (!("onReady" in Office) || typeof Office.onReady !== "function") {
            const errMsg = errorMessage("`Office` does not have an `onReady` property, or it is not a function.");
            opUseOffice?.addInfo(errMsg, { Office: Office });
            throw new Error(errMsg);
        }

        let officeInfo;
        try {
            officeInfo = await Office.onReady();
        } catch (err) {
            const errMsg = errorMessage(`Error while getting Office ready: '${errorTypeMessageString(err)}'.`);
            opUseOffice?.addInfo(errMsg, { Error: err });
            throw new Error(errMsg);
        }

        if (officeInfo.host === null && officeInfo.platform === null) {
            const errMsg = errorMessage("API is loaded and ready, but no suitable environment was detected.");
            opUseOffice?.addInfo(errMsg);
            throw new Error(errMsg);
        }

        opUseOffice?.setSuccess("Office APIs are ready.", { onReadyInfo: officeInfo });
        return officeInfo;
    } catch (err) {
        if (opUseOffice) {
            return opUseOffice.setFailureAndRethrow(err);
        } else {
            throw err;
        }
    }
}

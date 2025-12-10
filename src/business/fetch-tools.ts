import { errorTypeMessageString } from "src/util/format_util";
import { isNotNullOrWhitespaceStr } from "src/util/string_util";
import { useSettings } from "src/composables/settings";
import { useStatusLog } from "src/status-tracker/composables/status-log";
import { type TrackedOperation } from "src/status-tracker/models/TrackedOperation";

async function logBadResponse(response: Response, purposeDescription: string | null, opFetch: TrackedOperation) {
    let responseText: string;
    let hasResponseText = false;
    try {
        responseText = await response.text();
        hasResponseText = true;
    } catch (err) {
        responseText = `Error getting response text (${errorTypeMessageString(err)})`;
    }

    let responseObject: unknown = { _: "Response text not available for parsing." };
    if (hasResponseText) {
        try {
            responseObject = JSON.parse(responseText);
        } catch (err) {
            responseObject = { errorParsingResponseText: errorTypeMessageString(err) };
        }
    }

    const purpDescr = purposeDescription ? `(${purposeDescription}) ` : "";
    opFetch.setFailure(`Request ${purpDescr}failed with status ${response.status} (${response.statusText}).`, {
        responseText,
        responseObject,
    });
}

export async function authorizedFetch(
    method: string,
    api: string,
    purposeDescription: string,
    apiToken?: string
): Promise<string> {
    const opFetch = useStatusLog().tracker.startOperation("Calling remote API", purposeDescription);

    try {
        opFetch.addInfo({ method, api });

        if (apiToken !== undefined) {
            opFetch.addInfo({ apiToken: `specified (${apiToken.length} chars)` });
        } else {
            apiToken = (await useSettings()).apiToken.value ?? undefined;
        }

        if (!isNotNullOrWhitespaceStr(apiToken)) {
            throw new Error(`Cannot '${purposeDescription}', because no API Token is set.`);
        }

        const headers = new Headers();
        headers.append("Authorization", `Bearer ${apiToken}`);
        const requestUrl = `https://dev.lunchmoney.app/v1/${api}`;

        const response = await fetch(requestUrl, {
            method,
            headers,
            redirect: "follow",
        });

        if (!response.ok) {
            await logBadResponse(response, purposeDescription, opFetch);
            throw new Error(`Bad response (${response.status}) during '${purposeDescription}'.`);
        }

        const responseText = await response.text();

        opFetch.setSuccess();
        return responseText;
    } catch (err) {
        return opFetch.setFailureAndRethrow(err, { method, api, purposeDescription });
    }
}

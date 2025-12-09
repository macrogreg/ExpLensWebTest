/// <reference types="office-js" />

import { isNullOrWhitespace } from "src/util/string_util";
import { useStatusLog } from "src/status-tracker/composables/status-log";
import { authorizedFetch } from "./fetch-tools";
import type { User as LunchUser } from "./lunchmoney-types";
import { errorTypeMessageString } from "src/util/format_util";

let isWorkInProgress = false;

export function getObfuscatedToken(token: string) {
    if (isNullOrWhitespace(token)) {
        return "<empty>";
    }
    const tokenLen = token.length;
    return tokenLen < 9
        ? `(${tokenLen} chars)`
        : token.substring(0, 3) + "..." + token.substring(token.length - 3) + ` (${tokenLen} chars)`;
}

export async function validateApiToken(
    tokenToValidate: string
): Promise<{ isValid: false; info: string } | { isValid: true; info: LunchUser }> {
    const statusLog = useStatusLog();

    if (isWorkInProgress === true) {
        return { isValid: false, info: "Cannot validate token:\n Validation already in progress." };
    }

    const tokenView = getObfuscatedToken(tokenToValidate);
    const opValidateToken = statusLog.tracker.startOperation("Validate API Token", tokenView);

    try {
        isWorkInProgress = true;

        if (isNullOrWhitespace(tokenToValidate)) {
            const info = "Specified API token is empty.";
            opValidateToken.setFailure(info);
            return {
                isValid: false,
                info,
            };
        }

        const headers = new Headers();
        headers.append("Authorization", `Bearer ${tokenToValidate}`);
        const requestUrl = `https://dev.lunchmoney.app/v1/me`;

        const response = await fetch(requestUrl, {
            method: "GET",
            headers,
            redirect: "follow",
        });

        // 401 is an "expected" bad response. Validation fails, but there is no exception-level error to log:
        if (response.status === 401) {
            const info = "Specified API token does not exist or is not valid.";
            opValidateToken.setFailure(info);
            return {
                isValid: false,
                info,
            };
        }

        // Other non-OK codes are "bad" errors.
        // If the response was good, just get the text;
        // If not, try again using the fetch wrapper, thus invoking its error handling and logging:

        const fetchedResponseText = response.ok
            ? await response.text()
            : await authorizedFetch("GET", "me", "get API token user info");

        const fetchedData: LunchUser = JSON.parse(fetchedResponseText);

        // Validate:

        if (fetchedData === undefined && fetchedData === null) {
            throw new Error("Cannot parse API token's user info");
        }

        const checkField = (f: string) => {
            // This should not happen, unless there was a breaking change in the remote API:
            if (!(f in fetchedData)) {
                throw new Error(`API token's user info fetched and parsed, but it does not contain '${f}'.`);
            }
        };

        checkField("user_name");
        checkField("user_email");
        checkField("user_id");
        checkField("account_id");
        checkField("budget_name");
        checkField("primary_currency");
        checkField("api_key_label");

        opValidateToken.setSuccess();
        return { isValid: true, info: fetchedData };
    } catch (err) {
        opValidateToken.setFailure(err);
        return { isValid: false, info: errorTypeMessageString(err) };
    } finally {
        isWorkInProgress = false;
    }
}

import { defineRouter } from "#q-app/wrappers";
import type { RouterHistory } from "vue-router";
import { createRouter, createMemoryHistory, createWebHistory, createWebHashHistory } from "vue-router";
import routes from "./routes";

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter(function (/* { store, ssrContext } */) {
    let createHistory: (base?: string) => RouterHistory = process.env.SERVER
        ? createMemoryHistory
        : process.env.VUE_ROUTER_MODE === "history"
          ? createWebHistory
          : createWebHashHistory;

    // There is a known issue where Office.js sets window.history.pushState and window.history.replaceState to
    // null, which then breaks Vue Router and produces the error:
    //     [Vue Router warn]: Error with push/replace State TypeError: history$1[(intermediate value)] is not a function
    //
    // either `createWebHistory` or `createWebHashHistory` is called below.
    //
    // https://stackoverflow.com/questions/42642863/office-js-nullifies-browser-history-functions-breaking-history-usage
    // https://github.com/OfficeDev/office-js/issues/429
    // https://learn.microsoft.com/en-us/office/dev/add-ins/develop/referencing-the-javascript-api-for-office-library-from-its-cdn
    //
    // A possible workaround is to grab the references to those functions before Office.js is loaded, and then to
    // restore them after Office.js is done initializing. However, we use a simple approach:
    // The remove the functions from the History altogether (rather than null-ing them).
    // As a result, Vue Router will see that pushState/replaceState are not available and will fall back
    // to location.assign/location.replace internally, avoiding the error.

    if (typeof window !== "undefined" && window.history) {
        const browserHistory = window.history as unknown as Record<string, unknown>;
        try {
            if (typeof browserHistory.pushState !== "function") {
                delete browserHistory.pushState;
            }
            if (typeof browserHistory.replaceState !== "function") {
                delete browserHistory.replaceState;
            }
        } catch {
            // Fall back to MemoryHistory, which does not interact with the browser history at all:
            createHistory = createMemoryHistory;
        }
    }

    console.debug(`Creating router. Creator function: '${createHistory.name}(..)'.`);

    const Router = createRouter({
        scrollBehavior: () => ({ left: 0, top: 0 }),
        routes,

        // Leave this as is and make changes in quasar.conf.js instead!
        // quasar.conf.js -> build -> vueRouterMode
        // quasar.conf.js -> build -> publicPath
        history: createHistory(process.env.VUE_ROUTER_BASE),
    });

    return Router;
});

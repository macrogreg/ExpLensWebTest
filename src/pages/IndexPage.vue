<template>
    <q-page class="row justify-center">
        <div class="main-content q-pa-md">
            <div class="title-bar">
                <h1 class="title-name">ExpLens</h1>
                <div class="title-version">{{ AddInAppVersion }}</div>
                <img src="/icons/favicon-32x32.png" alt="Logo" class="title-logo" />
            </div>

            <q-tabs v-model="activeTab" inline-label align="center" class="q-mb-md" indicator-color="tab-bar-active">
                <q-tab name="sync">
                    <q-icon name="currency_exchange" size="sm" />
                    <q-tooltip anchor="bottom middle" self="top middle" :offset="[5, 5]" class="tooltip-semitransp">
                        Synchronize Bank Data
                    </q-tooltip>
                </q-tab>
                <q-tab name="analyze">
                    <q-icon name="analytics" size="sm" />
                    <q-tooltip anchor="bottom middle" self="top middle" :offset="[5, 5]" class="tooltip-semitransp">
                        Analyze Transactions
                    </q-tooltip>
                </q-tab>
                <q-tab name="settings">
                    <q-icon name="settings" size="sm" />
                    <q-tooltip anchor="bottom middle" self="top middle" :offset="[5, 5]" class="tooltip-semitransp">
                        App Settings
                    </q-tooltip>
                </q-tab>
            </q-tabs>

            <q-separator class="q-mb-sm" />

            <q-tab-panels v-model="activeTab" keep-alive animated>
                <q-tab-panel name="sync" class="q-pa-none">
                    <SyncTab />
                </q-tab-panel>
                <q-tab-panel name="analyze" class="q-pa-none">
                    <AnalyzeTab />
                </q-tab-panel>
                <q-tab-panel name="settings" class="q-pa-none">
                    <SettingsTab />
                </q-tab-panel>
            </q-tab-panels>
        </div>
    </q-page>
</template>

<style scoped lang="css">
.title-bar {
    background-color: rgb(31, 105, 194);
    padding: 2px 15px 2px 15px;
    color: white;
    display: flex;
    align-items: center;
}
.title-name {
    font-family: "Gill Sans MT", Calibri, "Trebuchet MS", sans-serif;
    font-weight: 400;
    font-size: 24px;
    line-height: normal;
    margin: 0;
    padding: 5px 0 5px 0;
}
.title-version {
    font-family: "Gill Sans MT", Calibri, "Trebuchet MS", sans-serif;
    font-weight: 300;
    font-size: 11px;
    margin-left: 10px;
    align-self: flex-end;
    padding-bottom: 5px;
}
.title-logo {
    height: 32px;
    width: 32px;
    margin-left: auto;
    margin-right: 0;
}
.main-content {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    box-sizing: border-box;
}
</style>

<style lang="css">
.tooltip-semitransp {
    background-color: rgba(117, 117, 117, 0.8) !important;
    color: white;
    font-size: 0.7rem;
    white-space: nowrap;
}
.bg-tab-bar-active {
    background: #1f69c2;
}
.text-tab-bar-active {
    color: #1f69c2;
}
.tab-main-header {
    font-family: "Aptos", "Segoe UI", "Roboto", "-apple-system", "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 24px;
    font-weight: 500;
    height: 32px;
    letter-spacing: normal;
    line-height: 32px;
    margin-block-end: 16px;
    margin-block-start: 16px;
    margin-bottom: 16px;
    margin-inline-end: 16px;
    margin-inline-start: 16px;
    margin-left: 16px;
    margin-right: 16px;
    margin-top: 10px;
    margin-bottom: 20px;
    -webkit-font-smoothing: antialiased;
}
</style>

<script setup lang="ts">
import { ref, onMounted } from "vue";

console.debug("ExpLens Excel-AddIn: Loading IndexPage...");

onMounted(async () => {});
import SyncTab from "components/SyncTab.vue";
import AnalyzeTab from "components/AnalyzeTab.vue";
import SettingsTab from "components/SettingsTab.vue";
import { AddInAppVersion } from "src/composables/app-version";

const activeTab = ref("sync");
</script>

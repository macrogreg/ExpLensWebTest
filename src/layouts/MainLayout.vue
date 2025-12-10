<template>
    <q-layout view="hHh Lpr fFf">
        <q-page-container>
            <router-view />
        </q-page-container>

        <q-footer style="background-color: #f6f6f8">
            <StatusLogView :sizeJumpSteps="[130, Math.min(($q.screen.height ?? 600) - 250, 650), 70]" />
        </q-footer>
    </q-layout>
</template>

<script setup lang="ts">
import StatusLogView from "src/status-tracker/components/StatusLogView.vue";
</script>

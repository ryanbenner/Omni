<script setup lang="ts">
import { settings } from "../../composables/settings";
import SettingRow from "./SettingRow.vue";
import SettingToggle from "./SettingToggle.vue";
</script>

<template>
  <SettingRow label="Show file tree at launch" description="Applies the next time Omni starts.">
    <SettingToggle v-model="settings.general.sidebarAtLaunch" />
  </SettingRow>
  <SettingRow label="Offer to resume the last collage" description="Shows a Resume button on the empty screen.">
    <SettingToggle v-model="settings.general.offerResume" />
  </SettingRow>
</template>

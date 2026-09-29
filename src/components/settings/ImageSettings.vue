<script setup lang="ts">
import { settings, type ZoomStep } from "../../composables/settings";
import SettingRow from "./SettingRow.vue";
import SettingSelect from "./SettingSelect.vue";

const zoomOptions: { value: ZoomStep; label: string }[] = [
  { value: "fine", label: "Fine" },
  { value: "normal", label: "Normal" },
  { value: "coarse", label: "Coarse" },
];
</script>

<template>
  <SettingRow label="Zoom step" description="Scroll wheel and zoom buttons.">
    <SettingSelect v-model="settings.image.zoomStep" :options="zoomOptions" />
  </SettingRow>
</template>

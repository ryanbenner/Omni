<script setup lang="ts">
import { settings } from "../../composables/settings";
import SettingRow from "./SettingRow.vue";
import SettingNumber from "./SettingNumber.vue";
</script>

<template>
  <SettingRow label="Wall memory cap" description="Decoded pictures held in memory.">
    <SettingNumber v-model="settings.collage.memoryCapGb" range="collage.memoryCapGb" unit="GB" />
  </SettingRow>
  <SettingRow label="JPG export quality">
    <SettingNumber v-model="settings.collage.jpgQuality" range="collage.jpgQuality" unit="%" />
  </SettingRow>
</template>

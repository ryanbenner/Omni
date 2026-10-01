<script setup lang="ts">
import { draft } from "../../composables/settingsDraft";
import SettingRow from "./SettingRow.vue";
import SettingNumber from "./SettingNumber.vue";
</script>

<template>
  <SettingRow label="Wall memory cap" description="Memory used for decoded pictures on the wall.">
    <SettingNumber v-model="draft.collage.memoryCapGb" range="collage.memoryCapGb" unit="GB" />
  </SettingRow>
  <SettingRow label="JPG export quality">
    <SettingNumber v-model="draft.collage.jpgQuality" range="collage.jpgQuality" unit="%" />
  </SettingRow>
</template>

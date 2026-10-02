<script setup lang="ts">
import { type ReopenMode } from "../../composables/settings";
import { draft } from "../../composables/settingsDraft";
import SettingRow from "./SettingRow.vue";
import SettingToggle from "./SettingToggle.vue";
import SettingSelect from "./SettingSelect.vue";

const reopenOptions: { value: ReopenMode; label: string }[] = [
  { value: "off", label: "Nothing" },
  { value: "folder", label: "Last folder" },
  { value: "file", label: "Last folder and file" },
];
</script>

<template>
  <SettingRow label="Show file tree at launch" description="Applies the next time Omni starts.">
    <SettingToggle v-model="draft.general.sidebarAtLaunch" />
  </SettingRow>
  <SettingRow label="Offer to resume the last collage" description="Shows a Resume button on the empty screen.">
    <SettingToggle v-model="draft.general.offerResume" />
  </SettingRow>
  <SettingRow label="Wrap around at the end of a folder" description="Next on the last file goes back to the first.">
    <SettingToggle v-model="draft.general.wrapAround" />
  </SettingRow>
  <SettingRow label="Show hidden files" description="Includes dotfiles and Windows hidden files.">
    <SettingToggle v-model="draft.general.showHidden" />
  </SettingRow>
  <SettingRow
    label="Reopen at launch"
    description="Applies the next time Omni starts. Opening a file directly takes priority."
  >
    <SettingSelect v-model="draft.general.reopen" :options="reopenOptions" />
  </SettingRow>
  <SettingRow
    label="Open the first file when opening a pin"
    description="Videos and pictures only. The tree still scrolls to the folder."
  >
    <SettingToggle v-model="draft.general.openPinFirst" />
  </SettingRow>
  <SettingRow label="Confirm before moving to the Recycle Bin">
    <SettingToggle v-model="draft.general.confirmDelete" />
  </SettingRow>
</template>

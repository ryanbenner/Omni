import { ref } from "vue";
import GeneralSettings from "./GeneralSettings.vue";
import VideoSettings from "./VideoSettings.vue";
import ImageSettings from "./ImageSettings.vue";
import CollageSettings from "./CollageSettings.vue";
import PlaceholderSettings from "./PlaceholderSettings.vue";
import KeybindsSettings from "./KeybindsSettings.vue";

export const SECTIONS = [
  { id: "general", label: "General", icon: "ph-sliders-horizontal", page: GeneralSettings },
  { id: "keybinds", label: "Keybinds", icon: "ph-keyboard", page: KeybindsSettings },
  { id: "video", label: "Video Player", icon: "ph-film-strip", page: VideoSettings },
  { id: "image", label: "Image Viewer", icon: "ph-image", page: ImageSettings },
  { id: "pdf", label: "PDF Viewer", icon: "ph-file-pdf", page: PlaceholderSettings },
  { id: "markdown", label: "Markdown Editor", icon: "ph-markdown-logo", page: PlaceholderSettings },
  { id: "collage", label: "Collages", icon: "ph-squares-four", page: CollageSettings },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

// lives outside the modal so the choice survives closing it; never persisted
export const selectedSection = ref<SectionId>("general");

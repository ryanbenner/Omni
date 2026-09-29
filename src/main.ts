import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@phosphor-icons/web/regular";
import "@phosphor-icons/web/fill";
import "./styles/theme.css";
import { createApp } from "vue";
import App from "./App.vue";
import { loadSettings } from "./composables/settings";

loadSettings();
createApp(App).mount("#app");

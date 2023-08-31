// import './assets/main.css'
import { createApp } from "vue";
import App from "./App.vue";

// @ts-ignore
import { useAccordion } from "vue3-rich-accordion";
import "vue3-rich-accordion/accordion-library-styles.css";

import VueDatePicker from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";

import "./style.css";

createApp(App).use(useAccordion).component("VueDatePicker", VueDatePicker).mount("#app");

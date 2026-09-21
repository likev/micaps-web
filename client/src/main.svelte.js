import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/tokens.css";

const target = document.getElementById("app");
let appInstance = null;

if (target) {
  appInstance = mount(App, { target });
}

export default appInstance;

import { bezelsBeside } from "./engine/bezels";
import { mount } from "./index";
import { pin } from "./instance";

// Read as the script runs, the only time the document knows which one it is.
const script = document.currentScript;
bezelsBeside(script instanceof HTMLScriptElement ? script.src : "");

pin(window);
mount();

import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";
import { initializeServers } from "./lib/servers.js";

if (initializeServers()) createRoot(document.getElementById("root")!).render(<App />);

import React from "react";
import ReactDOM from "react-dom/client";
import { applyTheme, LoginGate } from "@billynorris/ui";
import "@billynorris/ui/theme.css";
import "./app.css";
import { App } from "./App";

applyTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LoginGate>
      <App />
    </LoginGate>
  </React.StrictMode>,
);

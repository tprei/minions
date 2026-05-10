import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

const stored = localStorage.getItem("minions-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const effective = stored === "dark" || (stored !== "light" && prefersDark);
if (effective) document.documentElement.classList.add("dark");

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

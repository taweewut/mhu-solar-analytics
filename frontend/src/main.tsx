import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { Providers } from "@/providers";
import "@/styles/modernist.css";
import "@/styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);

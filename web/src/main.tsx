import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{ style: { fontSize: 13, borderRadius: 10 } }}
    />
  </BrowserRouter>,
);

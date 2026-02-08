import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [
          [
            "babel-plugin-react-compiler",
            {
              "react-compiler/react-compiler": "error",
            },
          ],
        ],
      },
    }),
  ],
});

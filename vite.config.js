import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import handler from "./api/chat.js";

function localApiPlugin(env) {
  return {
    name: "local-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (
          req.method !== "POST" ||
          req.url?.split("?")[0] !== "/api/chat"
        ) {
          return next();
        }

        let body = "";

        for await (const chunk of req) {
          body += chunk;
        }

        try {
          req.body = body ? JSON.parse(body) : {};
        } catch {
          res.statusCode = 400;
          return res.end("잘못된 JSON 요청입니다");
        }

        process.env.GEMINI_API_KEY ||= env.GEMINI_API_KEY;

        res.status = (status) => {
          res.statusCode = status;
          return res;
        };

        res.json = (data) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(data));
        };

        await handler(req, res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),

      localApiPlugin(env),

      VitePWA({
        registerType: "autoUpdate",

        manifest: {
          name: "두리번",
          short_name: "두리번",
          description: "충남대학교 대덕캠퍼스 길안내 챗봇",

          start_url: "/",
          scope: "/",

          display: "standalone",

          background_color: "#ffffff",
          theme_color: "#ffffff",

          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png"
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png"
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable"
            }
          ]
        }
      })
    ],

    server: {
      port: 5173,
      open: true
    }
  };
});
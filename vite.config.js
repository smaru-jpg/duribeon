import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import handler from "./api/chat.js";

function localApiPlugin(env) {
  return {
    name: "local-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "POST" || req.url?.split("?")[0] !== "/api/chat") return next();

        let body = "";
        for await (const chunk of req) body += chunk;
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

export default defineConfig(({ mode }) => ({
  plugins: [react(), localApiPlugin(loadEnv(mode, process.cwd(), ""))],
  server: { port: 5173, open: true },
}));

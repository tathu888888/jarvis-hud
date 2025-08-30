import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";

dotenv.config(); // .env の OPENAI_API_KEY を読み込む

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8888",
        changeOrigin: true,
        // 必要ならパスを書き換え:
        // rewrite: (p) => p.replace(/^\/api/, "/api"),
      },
    },
  },
});
// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";
// import { fileURLToPath } from "url";
// import { dirname, resolve } from "path";
// import dotenv from "dotenv";

// dotenv.config(); // .env から OPENAI_API_KEY を読み込み

// const __dirname = dirname(fileURLToPath(import.meta.url));

// function annotateApiPlugin() {
//   return {
//     name: "annotate-api",
//     configureServer(server) {
//       server.middlewares.use("/api/annotate", async (req, res) => {
//         if (req.method !== "POST") {
//           res.statusCode = 405;
//           res.end("Method Not Allowed");
//           return;
//         }

//         // 生ボディ収集
//         let body = "";
//         req.on("data", (chunk) => (body += chunk));
//         req.on("end", async () => {
//           try {
//             const { title, meta } = JSON.parse(body || "{}");
//             if (!title) {
//               res.statusCode = 400;
//               res.setHeader("Content-Type", "application/json");
//               res.end(JSON.stringify({ error: "title is required" }));
//               return;
//             }

//             const apiKey = process.env.OPENAI_API_KEY;
//             if (!apiKey) {
//               res.statusCode = 500;
//               res.setHeader("Content-Type", "application/json");
//               res.end(JSON.stringify({ error: "OPENAI_API_KEY is missing" }));
//               return;
//             }

//             // プロンプト（必要に応じて調整OK）
//             const prompt =
//               `ヘッドライン: ${title}\n` +
//               (meta?.source ? `ソース: ${meta.source}\n` : "") +
//               (meta?.summary ? `概要: ${meta.summary}\n` : "") +
//               `日本語で1〜2文の要約を出し、最後に「— 観点: …」を1行。140文字前後。`;

//             // OpenAI Responses API
//             const oaRes = await fetch("https://api.openai.com/v1/responses", {
//               method: "POST",
//               headers: {
//                 "Authorization": `Bearer ${apiKey}`,
//                 "Content-Type": "application/json",
//               },
//               body: JSON.stringify({
//                 model: "gpt-4o-mini",
//                 input: [
//                   { role: "system", content: "You are a concise news explainer in Japanese." },
//                   { role: "user", content: prompt },
//                 ],
//                 temperature: 0.5,
//               }),
//             });

//             const data = await oaRes.json();
//             const note =
//               data?.output?.[0]?.content?.[0]?.text ??
//               data?.content?.[0]?.text ??
//               data?.response?.[0]?.content?.[0]?.text ??
//               data?.choices?.[0]?.message?.content ??
//               "（要約の抽出に失敗しました）";

//             res.statusCode = 200;
//             res.setHeader("Content-Type", "application/json");
//             res.end(JSON.stringify({ note }));
//           } catch (e) {
//             res.statusCode = 500;
//             res.setHeader("Content-Type", "application/json");
//             res.end(JSON.stringify({ error: String(e) }));
//           }
//         });
//       });
//     },
//   };
// }

// export default defineConfig({
//   plugins: [
//     react(),
//     annotateApiPlugin(), // ← ここで /api/annotate を提供
//   ],
//   resolve: {
//     alias: {
//       "@": resolve(__dirname, "src"),
//     },
//   },
// });
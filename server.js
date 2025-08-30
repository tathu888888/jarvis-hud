import express from "express";
// Node 18+ なら node-fetch不要。Node 16なら: import fetch from "node-fetch";
import "dotenv/config"; // ← npm i dotenv しておくと .env が読めます

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn("[WARN] OPENAI_API_KEY is not set. Check your .env");
}

app.post("/api/annotate", async (req, res) => {
  try {
    const { title } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const oaRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content:
              "You are a concise news explainer. Summarize a news headline in Japanese with 1-2 sentences and add one plausible angle or implication. Keep it neutral.",
          },
          {
            role: "user",
            content: `ヘッドライン: ${title}\n出力: 80〜140文字で要約し、最後に「— 観点: …」と1行追加して。`,
          },
        ],
        temperature: 0.5,
      }),
    });

    if (!oaRes.ok) {
      const t = await oaRes.text();
      return res.status(502).json({ error: "openai_error", detail: t });
    }

    const json = await oaRes.json();

    // Responses API の代表的な取り出しパターンを網羅的にフォールバック
    const note =
      json.output_text ??
      json.output?.[0]?.content?.[0]?.text ??
      json.content?.[0]?.text ??
      json.response?.[0]?.content?.[0]?.text ??
      json.message?.content?.[0]?.text ??
      JSON.stringify(json);

    return res.json({ note });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error", detail: String(e) });
  }
});

const PORT = process.env.PORT2 || 5188; // ← 5188 に合わせる
app.listen(PORT, () =>
  console.log(`API ready on http://localhost:${PORT}`)
);
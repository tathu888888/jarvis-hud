

// server.js (整理版)
import express from "express";
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";
import OpenAI from "openai";
import "dotenv/config";

const app = express();
app.use(express.json({ limit: "10mb" }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn("[WARN] OPENAI_API_KEY is not set. Check your .env");
}
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ========== /api/annotate ==========
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

// ========== RSSユーティリティ ==========
const cache = new Map(); // key: url, val: { at, body, contentType }

async function fetchFeed(url) {
  const cached = cache.get(url);
  const now = Date.now();
  if (cached && now - cached.at < 60_000) return cached;

  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (NewsHUD RSS Fetcher)",
      "accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    },
  });
  if (!r.ok) throw new Error(`fetch fail ${r.status}`);
  const body = await r.text();
  const contentType = r.headers.get("content-type") || "application/xml; charset=utf-8";

  const rec = { at: now, body, contentType };
  cache.set(url, rec);
  return rec;
}

function sniffFeedType(xml) {
  if (/<\s*rss[\s>]/i.test(xml)) return "rss";
  if (/<\s*feed[\s>]/i.test(xml)) return "atom";
  if (/<\s*rdf:RDF[\s>]/i.test(xml)) return "rdf";
  return "xml";
}

function normalizeToItems(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
    trimValues: true,
  });
  const obj = parser.parse(xml);
  const type = sniffFeedType(xml);

  const items = [];
  const strip = (s) => (s ?? "").toString();

  if (type === "rss" && obj?.rss?.channel) {
    const ch = obj.rss.channel;
    const arr = Array.isArray(ch.item) ? ch.item : (ch.item ? [ch.item] : []);
    for (const n of arr) {
      items.push({
        title: strip(n.title),
        url: strip(n.link || n.guid),
        time: strip(n.pubDate || n["dc:date"] || ""),
        summary: strip(n.description || n["content:encoded"] || ""),
        image:
          strip(n?.enclosure?.url) ||
          strip(n?.["media:thumbnail"]?.url) ||
          strip(n?.["media:content"]?.url) ||
          "",
        source: strip(ch.title || ""),
      });
    }
    return { type, title: strip(ch.title || ""), link: strip(ch.link || ""), items };
  }

  if (type === "atom" && obj?.feed) {
    const f = obj.feed;
    const arr = Array.isArray(f.entry) ? f.entry : (f.entry ? [f.entry] : []);
    for (const n of arr) {
      let href = "";
      if (n.link) {
        if (Array.isArray(n.link)) {
          const alt = n.link.find((x) => x.rel === "alternate" && x.href) || n.link.find((x) => x.href);
          href = alt?.href ?? "";
        } else {
          href = n.link.href ?? "";
        }
      }
      items.push({
        title: strip(n.title),
        url: strip(href || n.id || ""),
        time: strip(n.updated || n.published || ""),
        summary: strip(n.summary || n.content || ""),
        image: "",
        source: strip(f.title || ""),
      });
    }
    return { type, title: strip(f.title || ""), link: strip(f.link?.href || ""), items };
  }

  if (type === "rdf" && obj?.["rdf:RDF"]) {
    const r = obj["rdf:RDF"];
    const channel = Array.isArray(r.channel) ? r.channel[0] : r.channel || {};
    const arr = Array.isArray(r.item) ? r.item : (r.item ? [r.item] : []);
    for (const n of arr) {
      items.push({
        title: strip(n.title),
        url: strip(n.link || n.guid),
        time: strip(n["dc:date"] || n.date || n.pubDate || ""),
        summary: strip(n.description || ""),
        image: "",
        source: strip(channel.title || ""),
      });
    }
    return { type, title: strip(channel.title || ""), link: strip(channel.link || ""), items };
  }

  return { type: "xml", title: "", link: "", items: [] };
}

function buildRSS2({ title = "Aggregated Feed", link = "", description = "", items = [] }) {
  const esc = (s) =>
    (s ?? "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const rssItems = items
    .map((it) => {
      const dt = it.time ? new Date(it.time) : null;
      const pubDate = dt && !isNaN(dt.getTime()) ? dt.toUTCString() : "";
      const enclosure = it.image ? `\n      <enclosure url="${esc(it.image)}" type="image/jpeg" />` : "";
      return `    <item>
      <title>${esc(it.title)}</title>
      <link>${esc(it.url)}</link>
      ${pubDate ? `<pubDate>${esc(pubDate)}</pubDate>` : ""}
      <description>${esc(it.summary)}</description>${enclosure}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(title)}</title>
    <link>${esc(link)}</link>
    <description>${esc(description || title)}</description>
${rssItems}
  </channel>
</rss>`;
}

// ========== /api/rss (raw|json|rss) ==========
app.get("/api/rss", async (req, res) => {
  try {
    const url = String(req.query.url || "");
    const format = String(req.query.format || "raw"); // raw | json | rss
    if (!/^https?:\/\//i.test(url)) return res.status(400).send("bad url");

    const { body, contentType } = await fetchFeed(url);

    if (format === "raw") {
      const kind = sniffFeedType(body);
      if (kind === "rss") res.set("content-type", "application/rss+xml; charset=utf-8");
      else if (kind === "atom") res.set("content-type", "application/atom+xml; charset=utf-8");
      else res.set("content-type", contentType || "application/xml; charset=utf-8");
      return res.send(body);
    }

    const normalized = normalizeToItems(body);

    if (format === "json") {
      res.set("content-type", "application/json; charset=utf-8");
      return res.json(normalized);
    }

    if (format === "rss") {
      const rssXml = buildRSS2({
        title: normalized.title || "Converted Feed",
        link: normalized.link || url,
        description: `${normalized.title || "Feed"} via NewsHUD`,
        items: normalized.items,
      });
      res.set("content-type", "application/rss+xml; charset=utf-8");
      return res.send(rssXml);
    }

    return res.status(400).send("unknown format");
  } catch (e) {
    res.status(500).send(String(e));
  }
});

// ========== /api/aggregate ==========
app.get("/api/aggregate", async (req, res) => {
  try {
    const feeds = String(req.query.feeds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const format = String(req.query.format || "rss");

    if (!feeds.length) return res.status(400).send("feeds required");

    const all = [];
    for (const u of feeds) {
      if (!/^https?:\/\//i.test(u)) continue;
      try {
        const { body } = await fetchFeed(u);
        const norm = normalizeToItems(body);
        for (const it of norm.items) {
          if (it.source) it.title = `[${it.source}] ${it.title}`;
        }
        all.push(...norm.items);
      } catch (e) {
        console.warn("aggregate fetch fail:", u, e.message);
      }
    }

    const parsed = all.map((it) => ({ ...it, _ts: Date.parse(it.time || "") || 0 }));
    parsed.sort((a, b) => b._ts - a._ts);

    if (format === "json") {
      res.set("content-type", "application/json; charset=utf-8");
      return res.json({ title: "Aggregated Feed", items: parsed });
    }

    if (format === "rss") {
      const rssXml = buildRSS2({
        title: "Aggregated Feed",
        link: "",
        description: "Merged by NewsHUD",
        items: parsed,
      });
      res.set("content-type", "application/rss+xml; charset=utf-8");
      return res.send(rssXml);
    }

    return res.status(400).send("unknown format");
  } catch (e) {
    res.status(500).send(String(e));
  }
});





// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL_FAST = "gpt-4o-mini"; // 部分要約用（高速・安価）
const MODEL_FINAL = "gpt-4o";     // 最終統合用（精度重視）

// Responses APIを叩いて "output_text" を取り出すユーティリティ（json_object前提）
async function callResponses({ model, system, user, temperature = 0.2 }) {
  const body = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user",   content: user   },
    ],
    temperature,
    // ★指定の型式：JSONオブジェクトで返す（スキーマは緩め。最終で検証・補完）
    text: { format: { type: "json_object" } },
  };
  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await r.text();
  if (!r.ok) {
    // OpenAIのエラーをそのまま透過（デバッグしやすい）
    throw new Error(`OpenAI ${r.status}: ${raw}`);
  }

  // 代表形：{ output: [{ content: [{ type:"output_text", text:"{...}"}]}], ... }
  let data; try { data = JSON.parse(raw); } catch { throw new Error(`Non-JSON from OpenAI: ${raw}`); }
  const textOut =
    data?.output?.[0]?.content?.[0]?.type === "output_text"
      ? data.output[0].content[0].text
      : null;

  if (!textOut) throw new Error(`no_output_text: ${raw}`);
  return textOut; // ← JSON文字列（json_object指定なのでObject化は呼び出し側で）
}

// 小分け（60件/チャンク想定）
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

app.post("/api/forecast", async (req, res) => {
  try {
    const { items = [], horizonDays = 14 } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array required" });
    }

    // 送信データ（title/summary/source/time + note(ai) を含める）
    const compact = items.slice(0, 600).map(a => ({
      title:   a?.title   ?? "",
      summary: a?.summary ?? "",
      source:  a?.source  ?? "",
      time:    a?.time    ?? "",
      note:    a?.ai ?? a?.note ?? "",   // ★ 重要：noteを同梱
    }));

    // ===== 1) MAP: チャンク要約（themes & signals のみ）=====
    const CHUNK_SIZE = 60;
    const groups = chunk(compact, CHUNK_SIZE);

    const mapPromises = groups.map((group, idx) => {
      const sys = "Answer in Japanese unless the input is in another language.";
      const usr =
        [
          "You are a geopolitical analyst.",
          `Timezone: JST. Horizon: ${horizonDays} days.`,
          "Use ONLY the provided JSON items (title, summary, note, time, source).",
          "Return a JSON object with:",
          "themes: string[] (3-7 items),",
          "signals: array of { headline, why_it_matters, region?, confidence? (0-1), window_days? (int) }.",
          "Be concise and avoid duplication.",
          "",
          "ITEMS:",
          JSON.stringify(group)
        ].join("\n");

      return callResponses({ model: MODEL_FAST, system: sys, user: usr, temperature: 0.2 })
        .then(txt => {
          try { return JSON.parse(txt); }
          catch { throw new Error(`Chunk#${idx} invalid JSON: ${txt}`); }
        });
    });

    const partials = await Promise.all(mapPromises);

    // ===== 2) REDUCE: 最終統合（ホロスコープ＆ガイア理論含む完全JSON）=====
    const sysFinal = "Answer in Japanese unless the input is in another language.";
    const usrFinal =
      [
        "You are a geopolitical analyst.",
        `Timezone: JST. Horizon: ${horizonDays} days.`,
        "Merge the CHUNK_SUMMARIES JSON to produce a near-term world forecast.",
        "Return a single JSON object with keys:",
        // ★ 要件：ホロスコープ & ガイア理論 を含む
        "as_of_jst (string), coverage_count (int),",
        "top_themes (string[]),",
        "signals (array of { headline, why_it_matters, region?, confidence? (0-1), window_days? (int) }),",
        "scenarios_7_14d (array of { name, description, probability (0-1), triggers[], watchlist[] }),",
        "gaia_lens (object: { climate_signals: string[], environmental_risks: string[], note: string }),",
        "horoscope_narrative (string),",
        "caveats (string),",
        "confidence_overall (0-1 number).",
        "",
        "Rules:",
        "- Use only information implied by CHUNK_SUMMARIES.",
        "- Keep it concise and non-speculative; avoid inventing facts.",
        "- Horoscope is playful metaphor; label nothing as confirmed.",
        "",
        "CHUNK_SUMMARIES:",
        JSON.stringify(partials)
      ].join("\n");

    const finalText = await callResponses({
      model: MODEL_FINAL,
      system: sysFinal,
      user: usrFinal,
      temperature: 0.3,
    });

    // 最終JSONをパース
    let json;
    try { json = JSON.parse(finalText); }
    catch {
      // 念のため { ... } 抽出フォールバック
      const first = finalText.indexOf("{"), last = finalText.lastIndexOf("}");
      if (first >= 0 && last >= first) json = JSON.parse(finalText.slice(first, last + 1));
      else throw new Error(`invalid_final_json: ${finalText}`);
    }

    // 最低限の補完
    if (!json.as_of_jst) {
      json.as_of_jst = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    }
    json.coverage_count = compact.length;

    // 数値域の正規化（confidence系を0-1で揃える）
    if (Array.isArray(json.signals)) {
      json.signals = json.signals.map(s => ({
        ...s,
        confidence: typeof s?.confidence === "number"
          ? Math.max(0, Math.min(1, s.confidence))
          : undefined
      }));
    }
    if (typeof json.confidence_overall === "number") {
      json.confidence_overall = Math.max(0, Math.min(1, json.confidence_overall));
    }

    return res.json(json);
  } catch (e) {
    console.error("forecast error:", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = 8888; // バックエンドは 8888 に固定
app.listen(PORT, () => {
  console.log(`API ready on http://localhost:${PORT}`);
});




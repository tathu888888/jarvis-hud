// import express from "express";
// // Node 18+ なら node-fetch不要。Node 16なら: import fetch from "node-fetch";
// import "dotenv/config"; // ← npm i dotenv しておくと .env が読めます

// const app = express();
// app.use(express.json());

// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// if (!OPENAI_API_KEY) {
//   console.warn("[WARN] OPENAI_API_KEY is not set. Check your .env");
// }

// app.post("/api/annotate", async (req, res) => {
//   try {
//     const { title } = req.body || {};
//     if (!title) return res.status(400).json({ error: "title is required" });

//     const oaRes = await fetch("https://api.openai.com/v1/responses", {
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${OPENAI_API_KEY}`,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         model: "gpt-4o-mini",
//         input: [
//           {
//             role: "system",
//             content:
//               "You are a concise news explainer. Summarize a news headline in Japanese with 1-2 sentences and add one plausible angle or implication. Keep it neutral.",
//           },
//           {
//             role: "user",
//             content: `ヘッドライン: ${title}\n出力: 80〜140文字で要約し、最後に「— 観点: …」と1行追加して。`,
//           },
//         ],
//         temperature: 0.5,
//       }),
//     });

//     if (!oaRes.ok) {
//       const t = await oaRes.text();
//       return res.status(502).json({ error: "openai_error", detail: t });
//     }

//     const json = await oaRes.json();

//     // Responses API の代表的な取り出しパターンを網羅的にフォールバック
//     const note =
//       json.output_text ??
//       json.output?.[0]?.content?.[0]?.text ??
//       json.content?.[0]?.text ??
//       json.response?.[0]?.content?.[0]?.text ??
//       json.message?.content?.[0]?.text ??
//       JSON.stringify(json);

//     return res.json({ note });
//   } catch (e) {
//     console.error(e);
//     return res.status(500).json({ error: "server_error", detail: String(e) });
//   }
// });


// app.get("/api/rss", async (req, res) => {
//   try {
//     const url = String(req.query.url || "");
//     if (!/^https?:\/\//i.test(url)) return res.status(400).send("bad url");
//     const r = await fetch(url, {
//       headers: { "user-agent": "Mozilla/5.0 (NewsHUD RSS Fetcher)" },
//     });
//     if (!r.ok) return res.status(r.status).send("fetch fail");
//     res.set("content-type", "application/xml; charset=utf-8");
//     res.send(await r.text());
//   } catch (e) {
//     res.status(500).send(String(e));
//   }
// });

// const PORT = process.env.PORT2 || 5188; // ← 5188 に合わせる
// app.listen(PORT, () =>
//   console.log(`API ready on http://localhost:${PORT}`)
// );

import express from "express";
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";

const app = express();
app.use(express.json());

// 簡易キャッシュ（60秒）
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

// ---- ユーティリティ: フィード種別判定 ----
function sniffFeedType(xml) {
  // とても単純な判定（十分に強力）
  if (/<\s*rss[\s>]/i.test(xml)) return "rss";
  if (/<\s*feed[\s>]/i.test(xml)) return "atom";
  if (/<\s*rdf:RDF[\s>]/i.test(xml)) return "rdf";
  return "xml"; // わからないけどXML
}

// ---- ユーティリティ: パースしてJSONへ正規化 ----
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
      // Atom の link は配列 or オブジェクト
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
        image: strip((Array.isArray(n.link) ? (n.link.find((x)=>x.rel==="enclosure" && /^image\//.test(x.type||""))?.href) : "" ) || ""),
        source: strip(f.title || ""),
      });
    }
    return { type, title: strip(f.title || ""), link: strip(f.link?.href || ""), items };
  }

  if (type === "rdf" && obj?.["rdf:RDF"]) {
    // RDFパターン（例: 朝日・DW）
    const r = obj["rdf:RDF"];
    const channel = Array.isArray(r.channel) ? r.channel[0] : r.channel || {};
    const arr = Array.isArray(r.item) ? r.item : (r.item ? [r.item] : []);
    for (const n of arr) {
      items.push({
        title: strip(n.title),
        url: strip(n.link || n.guid),
        time: strip(n["dc:date"] || n.date || n.pubDate || ""),
        summary: strip(n.description || ""),
        image:
          strip(n?.enclosure?.url) ||
          strip(n?.["media:thumbnail"]?.url) ||
          strip(n?.["media:content"]?.url) ||
          "",
        source: strip(channel.title || ""),
      });
    }
    return { type, title: strip(channel.title || ""), link: strip(channel.link || ""), items };
  }

  // 不明XML → 空（フロントで弾く）
  return { type: "xml", title: "", link: "", items: [] };
}

// ---- ユーティリティ: JSON(正規化) → RSS 2.0 に変換 ----
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

// ---------- 単一フィード: raw/json/rss ----------
app.get("/api/rss", async (req, res) => {
  try {
    const url = String(req.query.url || "");
    const format = String(req.query.format || "raw"); // raw | json | rss
    if (!/^https?:\/\//i.test(url)) return res.status(400).send("bad url");

    const { body, contentType } = await fetchFeed(url);

    if (format === "raw") {
      // 取得元そのまま（RSS/Atom/RDF問わず）
      // 正しめのContent-Typeに調整
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
      // 元がAtom/RDFでもRSS2.0で返す
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

// ---------- 複数フィード合成: RSS2 or JSON ----------
app.get("/api/aggregate", async (req, res) => {
  try {
    // feeds=url1,url2,...  / format=json|rss
    const feeds = String(req.query.feeds || "").split(",").map(s => s.trim()).filter(Boolean);
    const format = String(req.query.format || "rss");

    if (!feeds.length) return res.status(400).send("feeds required");

    const all = [];
    for (const u of feeds) {
      if (!/^https?:\/\//i.test(u)) continue;
      try {
        const { body } = await fetchFeed(u);
        const norm = normalizeToItems(body);
        // source名があればタイトルに反映
        for (const it of norm.items) {
          if (it.source) it.title = `[${it.source}] ${it.title}`;
        }
        all.push(...norm.items);
      } catch (e) {
        console.warn("aggregate fetch fail:", u, e.message);
      }
    }

    // 時系列ソート（新しい順）
    const parsed = all.map(it => ({ ...it, _ts: Date.parse(it.time || "") || 0 }));
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

app.listen(8888, () => console.log("API ready on http://localhost:8888"));
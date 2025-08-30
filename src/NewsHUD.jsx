import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Newspaper, RefreshCcw } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

/* -------------------- Minimal UI (inline) -------------------- */
function cn(...xs){ return xs.filter(Boolean).join(" "); }

function Card({ children, className }) {
  return <div className={cn("rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 backdrop-blur-xl", className)}>{children}</div>;
}
function CardHeader({ children, className }) {
  return <div className={cn("mb-2 flex items-center justify-between", className)}>{children}</div>;
}
function CardTitle({ children, className }) {
  return <h2 className={cn("text-cyan-100/90 text-sm tracking-wider", className)}>{children}</h2>;
}
function CardContent({ children, className }) {
  return <div className={cn("", className)}>{children}</div>;
}
function Badge({ children, variant="outline", className }) {
  const base = "px-2 py-0.5 text-[10px] rounded border";
  const styles = variant === "outline"
    ? "border-cyan-500/40 text-cyan-200"
    : "bg-cyan-500/20 border-cyan-400/40 text-cyan-100";
  return <span className={cn(base, styles, className)}>{children}</span>;
}
/* ------------------------------------------------------------- */

/* ===== RSS 設定 & ユーティリティ ===== */
const FEEDS = [
  { source: "BBC World", url: "http://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "Reuters World", url: "http://feeds.reuters.com/Reuters/worldNews" },
  { source: "NHK 国際", url: "https://www3.nhk.or.jp/rss/news/cat5.xml" },
  // 追加したい場合:
  // { source: "CNN Top", url: "http://rss.cnn.com/rss/edition.rss" },
  // { source: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
];

// CORS を回避してブラウザから直接取得する軽量プロキシ（AllOrigins）
async function fetchRSSviaProxy(url) {
  const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  const data = await res.json(); // { contents: "<xml...>" }
  return data.contents;
}

function parseRSS(xmlText, fallbackSource) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "application/xml");
  const items = [...xml.querySelectorAll("item")];

  const toDate = (s) => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };
  const strip = (html) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return (tmp.textContent || tmp.innerText || "").trim();
  };

  return items.map((item) => {
    const title = item.querySelector("title")?.textContent?.trim() || "";
    const link =
      item.querySelector("link")?.textContent?.trim() ||
      item.querySelector("guid")?.textContent?.trim() ||
      "";
    const pubDateRaw = item.querySelector("pubDate")?.textContent?.trim() || "";
    const pubDate = toDate(pubDateRaw);
    const desc = item.querySelector("description")?.textContent || "";

    // media:thumbnail / media:content の画像も試す（名前空間コロンはエスケープが必要）
    const media =
      item.querySelector("media\\:thumbnail")?.getAttribute("url") ||
      item.querySelector("media\\:content")?.getAttribute("url") ||
      "";

    return {
      title,
      url: link,
      source: fallbackSource,
      time: pubDate ? pubDate.toISOString() : "",
      summary: strip(desc),
      image: media || "",
      _ts: pubDate ? pubDate.getTime() : 0,
      _key: (title + "|" + link).toLowerCase(),
    };
  });
}

/* ===== メイン ===== */
export default function NewsHUD() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      // 複数RSSを並列取得 → パース
      const xmls = await Promise.all(
        FEEDS.map(async (f) => {
          try {
            const xmlText = await fetchRSSviaProxy(f.url);
            return parseRSS(xmlText, f.source);
          } catch (e) {
            console.warn("RSS fetch failed:", f.source, e);
            return [];
          }
        })
      );

      // 平坦化 → 重複除去（title+link） → pubDate降順 → 上位N件
      const merged = xmls.flat();
      const dedupMap = new Map();
      for (const it of merged) {
        if (!dedupMap.has(it._key)) dedupMap.set(it._key, it);
      }
      const list = [...dedupMap.values()]
        .sort((a, b) => (b._ts || 0) - (a._ts || 0))
        .slice(0, 30);

      setArticles(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  return (
    <div className="relative min-h-screen w-full bg-black text-cyan-100 overflow-hidden">
      <HUDGrid />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Newspaper className="h-5 w-5 text-cyan-300" />
          <span className="tracking-widest text-cyan-200/90">J.A.R.V.I.S. // NEWS FEED</span>
          <Badge variant="outline">{loading ? "LOADING" : "LIVE"}</Badge>
        </div>
        <div className="flex items-center gap-6 text-cyan-200/80">
          <div className="flex items-center gap-2"><Globe className="h-4 w-4" /><span>WORLDWIDE</span></div>
          <RefreshCcw
            className="h-4 w-4 cursor-pointer hover:text-cyan-100"
            onClick={loadAll}
            title="Refresh"
          />
        </div>
      </div>

      {/* Calculus / DS block */}
      <CalculusOverview articles={articles} loading={loading} />

    
      {/* News List */}

<div className="relative z-10 grid lg:grid-cols-2 gap-6 px-6 pb-8">
  {loading ? (
    <div className="text-center col-span-2 text-cyan-400">Loading news...</div>
  ) : (
    articles.map((a, i) => (
      <motion.div
        key={a._key ?? `${a.source ?? "src"}-${i}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(i * 0.04, 0.6) }}
      >
        <GlassCard title={a.title}>
          {a.image ? (
            <img
              src={a.image}
              alt=""
              className="mb-2 rounded-lg max-h-40 w-full object-cover opacity-90"
            />
          ) : null}

          <div className="text-sm text-cyan-200/90 mb-2 line-clamp-3">
            {a.summary}
          </div>

          {/* AI解説（あれば表示） */}
          {a.aiLoading ? (
            <div className="text-xs text-cyan-300/80 mb-2">AI解説を生成中…</div>
          ) : a.ai ? (
            <div className="text-xs text-cyan-200/80 mb-2">{a.ai}</div>
          ) : null}

          <div className="flex justify-between items-center text-xs text-cyan-400/70">
            <span>{a.source}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="underline hover:text-cyan-200"
                title="OpenAIにタイトルを投げて要約を追記"
                onClick={async () => {
                  setArticles(prev =>
                    prev.map(x =>
                      (x._key ?? `${x.source ?? "src"}-${i}`) === (a._key ?? `${a.source ?? "src"}-${i}`)
                        ? { ...x, aiLoading: true }
                        : x
                    )
                  );
                  try {
                    const note = await annotateTitle(a.title, { source: a.source, time: a.time, summary: a.summary });
                    setArticles(prev =>
                      prev.map(x =>
                        (x._key ?? `${x.source ?? "src"}-${i}`) === (a._key ?? `${a.source ?? "src"}-${i}`)
                          ? { ...x, ai: note, aiLoading: false }
                          : x
                      )
                    );
                  } catch (e) {
                    setArticles(prev =>
                      prev.map(x =>
                        (x._key ?? `${x.source ?? "src"}-${i}`) === (a._key ?? `${a.source ?? "src"}-${i}`)
                          ? { ...x, ai: "AI解説の取得に失敗しました。", aiLoading: false }
                          : x
                      )
                    );
                  }
                }}
              >
                AI解説
              </button>

              {a.url ? (
                <a
                  className="underline hover:text-cyan-200"
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open
                </a>
              ) : (
                <span>{a.time}</span>
              )}
            </div>
          </div>
        </GlassCard>
      </motion.div>
    ))
  )}
</div>
</div>

);
}



function HUDGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]">
      <div className="absolute inset-0 opacity-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(56,189,248,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.08) 1px, transparent 1px)",
            backgroundSize: "40px 40px, 40px 40px",
          }}
        />
      </div>
    </div>
  );
}

function GlassCard({ title, children }) {
  return (
    <Card className="shadow-[0_0_40px_rgba(34,211,238,0.08)]">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ================== Calculus & DS Extensions ================== */
function diff(series) {
  const d = [];
  for (let i = 1; i < series.length; i++) d.push(series[i] - series[i - 1]);
  return d;
}
function integrate(series) {
  let area = 0;
  for (let i = 1; i < series.length; i++) area += (series[i] + series[i - 1]) / 2;
  return area;
}
function movingAvg(series, k = 5) {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const s = Math.max(0, i - k + 1);
    const slice = series.slice(s, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function useSimSeries(seed = 0, len = 120) {
  const [series, setSeries] = React.useState(
    Array.from({ length: len }, (_, i) =>
      50 + 10 * Math.sin((i + seed) / 5) + 8 * Math.cos((i + seed) / 9) + 6 * Math.random()
    )
  );
  React.useEffect(() => {
    const id = setInterval(() => {
      setSeries((prev) => {
        const i = prev.length;
        const next = 50 + 10 * Math.sin((i + seed) / 5) + 8 * Math.cos((i + seed) / 9) + 6 * Math.random();
        const arr = [...prev.slice(1), clamp(next, 0, 120)];
        return arr;
      });
    }, 1200);
    return () => clearInterval(id);
  }, [seed]);
  return series;
}

function sparkColor(slope) { return slope > 0 ? "#22d3ee" : "#f472b6"; }

function Metric({ label, value, unit, color }) {
  return (
    <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-2">
      <div className="opacity-70 text-[10px]">{label}</div>
      <div className="text-cyan-100 font-mono">
        <span style={{ color: color || undefined }}>{value}</span>
        {unit ? <span className="opacity-70 ml-1">{unit}</span> : null}
      </div>
    </div>
  );
}

// async function annotateTitle(title) {
//   const res = await fetch("/api/annotate", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ title }),
//   });
//   if (!res.ok) throw new Error("annotate failed");
//   const data = await res.json(); // { note: "..." }
//   return data.note;
// }

const aiCache = new Map(); // title をキーにキャッシュ
async function annotateTitle(title, { source, time, summary } = {}) {
  // 既に取得済みならキャッシュを返す
  if (aiCache.has(title)) return aiCache.get(title);

  const res = await fetch("/api/annotate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      // あると精度が上がるのでメタも渡す（サーバ側は title だけでもOK）
      meta: { source, time, summary }
    }),
  });

  if (!res.ok) {
    throw new Error(`annotate failed: ${res.status}`);
  }
  const { note } = await res.json(); // { note: "..." }
  aiCache.set(title, note);
  return note;
}

function CalculusOverview({ articles, loading }) {
  const series = useSimSeries(101, 120);
  const d = diff(series);
  const d2 = diff(d);
  const exposure = integrate(series);
  const slope = d[d.length - 1] ?? 0;
  const accel = d2[d2.length - 1] ?? 0;

  return (
    <div className="relative z-10 px-6 pb-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-cyan-100/90 tracking-wider text-sm">CALCULUS OVERVIEW</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-3">
            <Metric label="総露出 ∫V dt" value={Math.round(exposure)} />
            <Metric label="傾き dV/dt" value={slope.toFixed(2)} unit="/min" color={sparkColor(slope)} />
            <Metric label="加速度 d²V/dt²" value={accel.toFixed(2)} unit="/min²" color={sparkColor(accel)} />
            <Metric label="記事数" value={loading ? "-" : String(articles.length)} />
          </div>
          <div className="mt-3 grid lg:grid-cols-2 gap-3">
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series.map((v, i) => ({ t: i, v }))} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeOpacity={0.08} strokeDasharray="3 3" />
                  <XAxis dataKey="t" hide /><YAxis hide domain={[0, 120]} />
                  <Tooltip />
                  <Area type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={2} fill="#22d3ee22" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.map((v, i) => ({ t: i, v }))} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeOpacity={0.08} strokeDasharray="3 3" />
                  <XAxis dataKey="t" hide /><YAxis hide />
                  <Tooltip />
                  <Line type="monotone" dataKey="v" dot={false} stroke="#67e8f9" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

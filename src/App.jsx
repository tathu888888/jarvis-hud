// import React from "react";
// まずは NewsHUD を一旦コメントアウトして最小描画にする
// import NewsHUD from "./NewsHUD.jsx";

// export default function App() {
//   return (
//     <div style={{ padding: 24, color: "white", background: "#111", minHeight: "100vh" }}>
//       <h1>App は描画できています ✅</h1>
//       {/* <NewsHUD /> */}
//     </div>
//   );
// }

// import React from "react";
// import NewsHUD from "./NewsHUD.jsx";

// export default function App() {
//   return (
//     <div style={{ padding: 24, color: "white", background: "#111", minHeight: "100vh" }}>
//       <h1>App は描画できています ✅</h1>
//       <NewsHUD />
//     </div>
//   );
// }

// import React from "react";
// import { createRoot } from "react-dom/client";
// import "./index.css";
// import App from "./App.jsx";

// createRoot(document.getElementById("root")).render(
//   <React.StrictMode>
//     <App />
//   </React.StrictMode>
// );


// export default function App() {
//   return (
//     <div className="p-6">
//       <h1 className="text-3xl font-bold tracking-tight">J.A.R.V.I.S. // NEWS FEED</h1>
//       <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
//         <div className="rounded-2xl border border-cyan-500/40 bg-black/40 p-4">
//           <div className="text-sm text-cyan-400/80">総露出 ∫V dt</div>
//           <div className="mt-2 text-2xl font-semibold">6258</div>
//         </div>
//         <div className="rounded-2xl border border-cyan-500/40 bg-black/40 p-4">
//           <div className="text-sm text-cyan-400/80">傾き dV/dt</div>
//           <div className="mt-2 text-2xl font-semibold">1.62<span className="text-base">/min</span></div>
//         </div>
//         <div className="rounded-2xl border border-cyan-500/40 bg-black/40 p-4">
//           <div className="text-sm text-cyan-400/80">加速度 d²V/dt²</div>
//           <div className="mt-2 text-2xl font-semibold">5.36<span className="text-base">/min²</span></div>
//         </div>
//         <div className="rounded-2xl border border-cyan-500/40 bg-black/40 p-4">
//           <div className="text-sm text-cyan-400/80">記事数</div>
//           <div className="mt-2 text-2xl font-semibold">4</div>
//         </div>
//       </div>
//     </div>
//   );
// }

import NewsHUD from "./NewsHUD.jsx"; // ファイルは src/NewsHUD.jsx に置く

export default function App() {
  return <NewsHUD />;
}

// import React from "react";
// import { createRoot } from "react-dom/client";
// import App from "./App.jsx";

// const rootEl = document.getElementById("root");
// console.log("rootEl:", rootEl); // ← これが null なら index.html 側の問題
// createRoot(rootEl).render(<App />);

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// TailwindCSS 読み込み
import './input.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// import React from "react";
// import { createRoot } from "react-dom/client";
// import NewsHUD from "./NewsHUD.jsx";

// createRoot(document.getElementById("root")).render(
//   <React.StrictMode>
//     <NewsHUD />
//   </React.StrictMode>
// );


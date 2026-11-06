import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div className="migration-notice" role="note" aria-label="系统迁移通知">
      <span><strong>系统迁移通知</strong>：系统已迁移至 <a href="https://recruitments.wanghuock.com/">https://recruitments.wanghuock.com/</a>，账号和密码保持不变，请使用新地址访问，敬请知悉。</span>
    </div>
    <App />
  </React.StrictMode>,
);

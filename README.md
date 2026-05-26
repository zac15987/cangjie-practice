# 倉頡練習

線上倉頡輸入法練習工具，目前對應 3 代倉頡（Windows 預設版本）。

## 練習內容

首頁可在兩個 section 之間切換：

- **字根練習** — 24 個字母對應的正規字根（A↔日、B↔月…）。5 課依字根分類，每課多個 stage（單字熱身 / 順逆序 / 亂序混打 / 交叉混打）。
- **輔助字形** — 每個字母底下的變形（例如「巴、眉、色」裡躺臥的日屬於 A）。題目以 SVG 呈現，原字標出輔助字形部位。5 課與字根練習同分組，每課三個 stage：基本形 / 變形 / 混合，全部隨機。

兩個 section 的進度互相獨立。

## 開發

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
```

輸出至 `dist/`，可直接部署到 Cloudflare Pages。

## 部署到 Cloudflare Pages

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`

## 來源致謝

輔助字形練習所使用的範例 SVG 圖檔（`public/auxiliary/Cjem-*.svg`），來自
[Wikimedia Commons](https://commons.wikimedia.org/wiki/User:Cangjie6) 使用者
**Cangjie6** 製作上傳，採 [CC0 1.0 公有領域](https://creativecommons.org/publicdomain/zero/1.0/deed.zh_TW) 釋出，
整理頁面為 [《倉頡輸入法／輔助字形》Wikibooks](https://zh.wikibooks.org/wiki/%E5%80%89%E9%A0%A1%E8%BC%B8%E5%85%A5%E6%B3%95/%E8%BC%94%E5%8A%A9%E5%AD%97%E5%BD%A2)。
詳見 `public/auxiliary/LICENSE-AUX.txt`。

下載與資料整理由 `scripts/fetch-aux-svgs.mjs` 一次性產生 — 如有需要重新抓檔，
執行 `node scripts/fetch-aux-svgs.mjs` 即可，已存在的檔案會自動略過。

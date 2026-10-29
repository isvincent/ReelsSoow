/* =========================================================
 * 教學影片集 — 網站設定（只需要改這個檔案）
 * ========================================================= */
window.SITE_CONFIG = {
  // ① 貼上 Google Apps Script 部署後的「網頁應用程式網址」（結尾是 /exec）
  //    留空時，網站會改讀同資料夾內的 videos.json（備用清單）。
  API_URL: 'https://script.google.com/macros/s/AKfycbxxS8Sh4deMcuWwgKXuh3KScYXri9GJelS1W7DBvxOjoiV_Zt3oewT05z_6-l2aTUJs8Q/exec',

  // ② 雲端硬碟資料夾網址（頁尾「開啟雲端資料夾」按鈕使用）
  FOLDER_URL: 'https://drive.google.com/drive/folders/1xGTisJ_FEfg-3uvrBYSOEc0q3i6maf9N',

  // ③ 幾天內上傳的影片顯示「NEW」標籤
  NEW_DAYS: 7,

  // ④ 主題關鍵字 → 圖示與配色（檔名包含關鍵字就套用；可自行增加）
  TOPIC_STYLES: [
    { key: '颱風',   icon: '🌀', colors: ['#38bdf8', '#6366f1'] },
    { key: '圓周率', icon: 'π',  colors: ['#f59e0b', '#ef4444'] },
    { key: 'ETF',    icon: '📈', colors: ['#22c55e', '#0ea5e9'] },
    { key: '心跳',   icon: '❤️', colors: ['#f43f5e', '#ec4899'] },
    { key: '呼吸',   icon: '🌬️', colors: ['#14b8a6', '#84cc16'] },
    { key: 'HRV',    icon: '💓', colors: ['#a855f7', '#f43f5e'] },
    { key: '絕對零度', icon: '🧊', colors: ['#06b6d4', '#3b82f6'] },
    { key: '所有權', icon: '🏠', colors: ['#f97316', '#eab308'] }
  ],
  // 沒有符合關鍵字時輪流使用的配色
  FALLBACK_COLORS: [
    ['#ec4899', '#8b5cf6'], ['#f97316', '#facc15'], ['#10b981', '#06b6d4'],
    ['#6366f1', '#ec4899'], ['#ef4444', '#f59e0b'], ['#0ea5e9', '#22c55e']
  ],
  FALLBACK_ICONS: ['🎬', '💡', '📚', '🔬', '🧠', '✨']
};

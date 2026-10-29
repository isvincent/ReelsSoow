/**
 * 教學影片集 — Google Apps Script 影片清單 API
 * ------------------------------------------------------------
 * 功能：讀取指定雲端硬碟資料夾內的所有影片，回傳 JSON 清單給網站。
 *       資料夾新增影片後，網站重新整理即可自動出現，不必改網站程式。
 *
 * 部署：部署 → 新增部署作業 → 類型「網頁應用程式」
 *       執行身分：我　／　誰可以存取：任何人
 *       複製「網頁應用程式網址」（…/exec）貼到網站 config.js 的 API_URL。
 */

// ★ 影片所在的雲端硬碟資料夾 ID（網址 folders/ 後面那一串）
const FOLDER_ID = '1xGTisJ_FEfg-3uvrBYSOEc0q3i6maf9N';

// 是否包含子資料夾內的影片（子資料夾名稱會成為「分類」）
const INCLUDE_SUBFOLDERS = true;

// 快取秒數（減少讀取雲端硬碟的次數；新增影片後最多等這麼久才會出現）
const CACHE_SECONDS = 300;

/** 網站呼叫的入口：GET …/exec  （可加 ?callback=fn 走 JSONP，加 ?nocache=1 強制重新讀取） */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const data = getVideoList_(params.nocache === '1');
  const json = JSON.stringify(data);

  if (params.callback && /^[\w.$]+$/.test(params.callback)) {
    return ContentService.createTextOutput(params.callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/** 取得影片清單（含快取） */
function getVideoList_(forceRefresh) {
  const cache = CacheService.getScriptCache();
  const KEY = 'videos_v1';
  if (!forceRefresh) {
    const hit = cache.get(KEY);
    if (hit) return JSON.parse(hit);
  }

  const root = DriveApp.getFolderById(FOLDER_ID);
  const videos = [];
  collect_(root, '', videos);

  // 依日期由近而遠
  videos.sort(function (a, b) { return b.date.localeCompare(a.date); });

  const data = {
    title: '教學影片集',
    folder: root.getName(),
    updated: new Date().toISOString(),
    count: videos.length,
    videos: videos
  };

  const text = JSON.stringify(data);
  if (text.length < 95000) cache.put(KEY, text, CACHE_SECONDS); // CacheService 單筆上限約 100KB
  return data;
}

/** 遞迴收集影片 */
function collect_(folder, category, out) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const mime = f.getMimeType();
    const name = f.getName();
    if (!/^video\//.test(mime) && !/\.(mp4|mov|m4v|webm)$/i.test(name)) continue;

    out.push({
      id: f.getId(),
      title: name.replace(/\.[^.]+$/, ''),           // 檔名（去副檔名）＝影片主題
      file: name,
      date: f.getLastUpdated().toISOString(),       // 影片日期（最後修改時間）
      created: f.getDateCreated().toISOString(),
      size: f.getSize(),
      mime: mime,
      category: category,
      description: f.getDescription() || ''         // 可在雲端硬碟「檔案資訊 → 說明」填寫
    });
  }

  if (!INCLUDE_SUBFOLDERS) return;
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    collect_(sub, category ? category + ' / ' + sub.getName() : sub.getName(), out);
  }
}

/**
 * （選用）一鍵把資料夾內所有影片設為「知道連結的任何人都能檢視」。
 * 影片必須公開，網站訪客才能播放。第一次部署前，請在編輯器選擇此函式並按「執行」一次。
 */
function shareAllVideos() {
  const root = DriveApp.getFolderById(FOLDER_ID);
  root.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const list = [];
  collect_(root, '', list);
  list.forEach(function (v) {
    DriveApp.getFileById(v.id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  });
  Logger.log('已設定公開檢視：' + list.length + ' 部影片');
}

/** （測試用）在編輯器執行，於「執行記錄」查看抓到的影片 */
function testList() {
  const data = getVideoList_(true);
  Logger.log('共 ' + data.count + ' 部影片');
  data.videos.forEach(function (v) { Logger.log(v.date.slice(0, 10) + '  ' + v.title); });
}

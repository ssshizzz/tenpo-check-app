// 店舗チェック・修繕管理 MVP
// Google Apps Script / Code.js

// 画像格納フォルダ
const FOLDER_ID = "1r5_Jhg1HnFaOGlXHkhYrvJZmxYN8Na4K";

// 店舗マスタファイル
const MASTER_SHEET_ID = "1uxbE4Ei_fC3ETnKiFMKlb2bvC2tABzzHUswTpMmFEzA";
const STORE_MASTER_SHEET_NAME = "店舗マスタ";

// 日次・週次ファイル
const DAILY_SHEET_ID = "1PQvFFSRr4tn_gs4nHSseWeSicHsDObwogDXKHUlOGPo";
const WEEKLY_SHEET_ID = "1aRFwmNY7xCUwD999jITQsRZA9oOlpUATngGI2WOFfUI";

// 修繕管理ファイル
const REPAIR_SHEET_ID = "1vXevJBB-2UVZSFyD__rhXtauwGnM-5nq8R5ua3kz6XY";

// 設定シート
const SETTING_SHEET_NAME = "設定";
const SETTING_GRADE_CELL = "A1";          // S/A/B/C
const SETTING_DAILY_STATUS_CELL = "B1";   // OK/NG
const SETTING_REPAIR_STATUS_CELL = "C1";  // 未対応/対応中/完了

const DAILY_HEADER = [
  "チェックID",
  "修繕へ登録ID",
  "日時",
  "店舗名",
  "担当者",
  "トイレ",
  "客席",
  "厨房",
  "入口",
  "総合評価",
  "緊急度(自動)",
  "ファイル名",
  "説明文",
  "画像URL",
  "サムネイル",
  "対応ステータス",
  "対応期限",
  "対応完了日",
  "備考",
];

const WEEKLY_HEADER = [
  "チェックID",
  "修繕へ登録ID",
  "日時",
  "店舗名",
  "担当者",
  "設備",
  "内装",
  "導線",
  "総合評価",
  "緊急度(自動)",
  "ファイル名",
  "説明文",
  "画像URL",
  "サムネイル",
  "対応ステータス",
  "対応期限",
  "対応完了日",
  "備考",
];

const REPAIR_HEADER = [
  "修繕ID",
  "元チェックID",
  "登録日時",
  "発生日",
  "店舗名",
  "担当者",
  "チェック種別",
  "内容",
  "写真URL",
  "サムネイル",
  "優先度",
  "対応ステータス",
  "対応期限",
  "対応担当者",
  "対応内容",
  "完了日",
  "備考",
];

function doGet(e) {
  try {
    const action = e.parameter.action || "";

    if (action === "getSettings") {
      return getSettingsResponse(e);
    }

    return createJsonResponse({
      ok: false,
      error: "不明なactionです: " + action,
    });
  } catch (error) {
    return createJsonResponse({
      ok: false,
      error: error.message,
    });
  }
}

function getSettingsResponse(e) {
  const payload = {
    ok: true,
    settings: buildSettingsPayload(),
  };

  const callback = e.parameter.callback;
  const json = JSON.stringify(payload);

  // iPhone/VercelからCORSを避けて取得するためJSONP対応
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return createJsonResponse(payload);
}

function buildSettingsPayload() {
  const dailySS = SpreadsheetApp.openById(DAILY_SHEET_ID);
  const weeklySS = SpreadsheetApp.openById(WEEKLY_SHEET_ID);

  return {
    storeMaster: getStoreMasterRecords(),
    dailyCheckOptions: getValidationValues(dailySS, SETTING_DAILY_STATUS_CELL, ["OK", "NG"]),
    weeklyGradeOptions: getValidationValues(weeklySS, SETTING_GRADE_CELL, ["S", "A", "B", "C"]),
    urgencyOptions: getValidationValues(dailySS, SETTING_GRADE_CELL, ["S", "A", "B", "C"]),
    repairStatusOptions: getValidationValues(dailySS, SETTING_REPAIR_STATUS_CELL, ["未対応", "対応中", "完了"]),
  };
}

function getStoreMasterRecords() {
  const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(STORE_MASTER_SHEET_NAME);

  if (!sheet) {
    throw new Error("店舗マスタシートが見つかりません: " + STORE_MASTER_SHEET_NAME);
  }

  const values = sheet.getDataRange().getValues();
  const records = [];

  // 想定列：
  // A列：業態
  // B列：エリア
  // C列：店舗名
  // D列以降：任意
  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const businessType = row[0] ? String(row[0]).trim() : "";
    const area = row[1] ? String(row[1]).trim() : "";
    const storeName = row[2] ? String(row[2]).trim() : "";

    if (!businessType || !storeName) {
      continue;
    }

    records.push({
      businessType: businessType,
      area: area,
      storeName: storeName,
    });
  }

  return records;
}

function getValidationValues(spreadsheet, cellA1, fallback) {
  const sheet = spreadsheet.getSheetByName(SETTING_SHEET_NAME);
  if (!sheet) {
    return fallback;
  }

  const range = sheet.getRange(cellA1);
  const rule = range.getDataValidation();

  if (!rule) {
    const value = range.getValue();
    if (value) {
      return String(value)
        .split(/[,\n、]/)
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return fallback;
  }

  const criteriaValues = rule.getCriteriaValues();
  if (!criteriaValues || criteriaValues.length === 0) {
    return fallback;
  }

  const first = criteriaValues[0];

  // 直接リスト指定
  if (Array.isArray(first)) {
    return first.map((v) => String(v).trim()).filter(Boolean);
  }

  // 範囲参照
  if (first && typeof first.getValues === "function") {
    return first
      .getValues()
      .flat()
      .map((v) => String(v).trim())
      .filter(Boolean);
  }

  return fallback;
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const result = saveCheckRecord(data);

    return createJsonResponse({
      ok: true,
      result: result,
    });
  } catch (error) {
    return createJsonResponse({
      ok: false,
      error: error.message,
    });
  }
}

function saveCheckRecord(data) {
  const checkType = String(data.checkType || "").trim(); // daily / weekly
  const businessType = String(data.businessType || "").trim();
  const area = String(data.area || "").trim();
  const storeName = String(data.storeName || "").trim();
  const staffName = String(data.staffName || "").trim();
  const description = String(data.description || "").trim();
  const note = String(data.note || "").trim();
  const imageBase64 = data.imageBase64 || "";
  const mimeType = data.mimeType || "image/jpeg";

  if (!checkType) throw new Error("チェック種別がありません");
  if (checkType !== "daily" && checkType !== "weekly") throw new Error("チェック種別が不正です");
  if (!businessType) throw new Error("業態がありません");
  if (!storeName) throw new Error("店舗名がありません");
  if (!staffName) throw new Error("担当者がありません");

  const now = new Date();
  const checkId = makeCheckId(checkType, now);

  let evaluation = "";
  let urgency = "";
  let repairNeeded = false;
  let sheetId = "";
  let header = [];
  let row = [];

  const savedImage = imageBase64
    ? saveImageToDrive({
        checkType: checkType,
        storeName: storeName,
        description: description,
        imageBase64: imageBase64,
        mimeType: mimeType,
        fileName: data.fileName || "",
      })
    : {
        fileName: "",
        fileUrl: "",
        imageViewUrl: "",
        thumbnailFormula: "",
      };

  if (checkType === "daily") {
    const toilet = String(data.toilet || "OK").trim();
    const seats = String(data.seats || "OK").trim();
    const kitchen = String(data.kitchen || "OK").trim();
    const entrance = String(data.entrance || "OK").trim();

    const dailyResult = calculateDailyResult({
      toilet: toilet,
      seats: seats,
      kitchen: kitchen,
      entrance: entrance,
    });

    evaluation = dailyResult.evaluation;
    urgency = dailyResult.urgency;
    repairNeeded = dailyResult.ngCount > 0;

    sheetId = DAILY_SHEET_ID;
    header = DAILY_HEADER;

    row = [
      checkId,
      "", // 修繕へ登録ID。後で入れる
      now,
      storeName,
      staffName,
      toilet,
      seats,
      kitchen,
      entrance,
      evaluation,
      urgency,
      savedImage.fileName,
      description,
      savedImage.fileUrl ? "画像を開く" : "",
      savedImage.thumbnailFormula,
      "",
      repairNeeded ? calculateDeadline(now, urgency) : "",
      "",
      note,
    ];
  }

  if (checkType === "weekly") {
    const equipment = String(data.equipment || "A").trim();
    const interior = String(data.interior || "A").trim();
    const flow = String(data.flow || "A").trim();

    const weeklyResult = calculateWeeklyResult({
      equipment: equipment,
      interior: interior,
      flow: flow,
    });

    evaluation = weeklyResult.evaluation;
    urgency = weeklyResult.urgency;
    repairNeeded =
      weeklyResult.hasC ||
      ((urgency === "S" || urgency === "A") && !!description && !!savedImage.fileUrl);

    sheetId = WEEKLY_SHEET_ID;
    header = WEEKLY_HEADER;

    row = [
      checkId,
      "", // 修繕へ登録ID。後で入れる
      now,
      storeName,
      staffName,
      equipment,
      interior,
      flow,
      evaluation,
      urgency,
      savedImage.fileName,
      description,
      savedImage.fileUrl ? "画像を開く" : "",
      savedImage.thumbnailFormula,
      "",
      repairNeeded ? calculateDeadline(now, urgency) : "",
      "",
      note,
    ];
  }

  // 修繕登録が必要な場合は先に修繕IDを作って2列目へ入れる
  let repairId = "";
  if (repairNeeded) {
    repairId = makeRepairId(now);
    row[1] = repairId;
    row[14] = row[14] || savedImage.thumbnailFormula;
    row[15] = "未対応";
  }

  const targetSS = SpreadsheetApp.openById(sheetId);
  const targetSheet = getOutputSheet(targetSS, storeName);
  ensureHeader(targetSheet, header);
  applySheetFormats(targetSheet, checkType);

  const nextRow = targetSheet.getLastRow() + 1;
  targetSheet.getRange(nextRow, 1, 1, row.length).setValues([row]);

  // 画像URLのリンク設定
  if (savedImage.fileUrl) {
    const imageUrlColumn = checkType === "daily" ? 14 : 13;
    const richText = SpreadsheetApp.newRichTextValue()
      .setText("画像を開く")
      .setLinkUrl(savedImage.fileUrl)
      .build();

    targetSheet.getRange(nextRow, imageUrlColumn).setRichTextValue(richText);
    targetSheet.setRowHeight(nextRow, 130);
  }

  if (repairNeeded) {
    appendRepairRecord({
      repairId: repairId,
      checkId: checkId,
      now: now,
      storeName: storeName,
      staffName: staffName,
      checkType: checkType,
      description: description,
      fileUrl: savedImage.fileUrl,
      thumbnailFormula: savedImage.thumbnailFormula,
      urgency: urgency,
      deadline: calculateDeadline(now, urgency),
      note: note,
    });
  }

  return {
    checkId: checkId,
    repairId: repairId,
    repairNeeded: repairNeeded,
    evaluation: evaluation,
    urgency: urgency,
    storeName: storeName,
  };
}

function saveImageToDrive(params) {
  const now = new Date();
  const fileName = params.fileName || makeImageFileName({
    checkType: params.checkType,
    storeName: params.storeName,
    description: params.description,
    date: now,
  });

  const bytes = Utilities.base64Decode(params.imageBase64);
  const blob = Utilities.newBlob(bytes, params.mimeType || "image/jpeg", fileName);

  const folder = DriveApp.getFolderById(FOLDER_ID);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileUrl = file.getUrl();
  const imageViewUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
  const thumbnailFormula = '=IMAGE("' + imageViewUrl + '", 1)';

  return {
    fileName: fileName,
    fileUrl: fileUrl,
    imageViewUrl: imageViewUrl,
    thumbnailFormula: thumbnailFormula,
  };
}

function appendRepairRecord(params) {
  const repairSS = SpreadsheetApp.openById(REPAIR_SHEET_ID);
  const sheet = getOutputSheet(repairSS, params.storeName);
  ensureHeader(sheet, REPAIR_HEADER);
  applyRepairSheetFormats(sheet);

  const row = [
    params.repairId,
    params.checkId,
    params.now,
    params.now,
    params.storeName,
    params.staffName,
    params.checkType === "daily" ? "日次" : "週次",
    params.description,
    params.fileUrl ? "画像を開く" : "",
    params.thumbnailFormula || "",
    params.urgency,
    "未対応",
    params.deadline,
    "",
    "",
    "",
    params.note || "",
  ];

  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);

  if (params.fileUrl) {
    const richText = SpreadsheetApp.newRichTextValue()
      .setText("画像を開く")
      .setLinkUrl(params.fileUrl)
      .build();

    sheet.getRange(nextRow, 9).setRichTextValue(richText);
    sheet.setRowHeight(nextRow, 130);
  }
}

function calculateDailyResult(values) {
  const checks = [values.toilet, values.seats, values.kitchen, values.entrance];
  const ngCount = checks.filter((v) => v === "NG").length;

  if (ngCount === 0) {
    return {
      evaluation: "S",
      urgency: "C",
      ngCount: ngCount,
    };
  }

  if (ngCount === 1) {
    return {
      evaluation: "B",
      urgency: "B",
      ngCount: ngCount,
    };
  }

  return {
    evaluation: "C",
    urgency: "S",
    ngCount: ngCount,
  };
}

function calculateWeeklyResult(values) {
  const grades = [values.equipment, values.interior, values.flow];
  const order = {
    S: 1,
    A: 2,
    B: 3,
    C: 4,
  };

  let worst = "S";
  grades.forEach((grade) => {
    if ((order[grade] || 99) > (order[worst] || 99)) {
      worst = grade;
    }
  });

  const urgencyMap = {
    S: "C",
    A: "B",
    B: "A",
    C: "S",
  };

  return {
    evaluation: worst,
    urgency: urgencyMap[worst] || "B",
    hasC: grades.includes("C"),
  };
}

function calculateDeadline(date, urgency) {
  const d = new Date(date);
  const daysMap = {
    S: 0,
    A: 3,
    B: 7,
    C: 14,
  };

  const days = daysMap[urgency] !== undefined ? daysMap[urgency] : 7;
  d.setDate(d.getDate() + days);
  return d;
}

function makeCheckId(checkType, date) {
  const prefix = checkType === "daily" ? "D" : "W";
  return prefix + "-" + Utilities.formatDate(date, "Asia/Tokyo", "yyyyMMdd-HHmmss-SSS");
}

function makeRepairId(date) {
  return "R-" + Utilities.formatDate(date, "Asia/Tokyo", "yyyyMMdd-HHmmss-SSS");
}

function makeImageFileName(params) {
  const typeText = params.checkType === "daily" ? "日次" : "週次";
  const dateText = Utilities.formatDate(params.date, "Asia/Tokyo", "yyyyMMdd-HHmmss");
  const store = sanitizeFileText(params.storeName || "店舗", 20);
  const keyword = sanitizeFileText(extractKeyword(params.description || "写真"), 16);

  return [typeText, store, dateText, keyword].join("_") + ".jpg";
}

function extractKeyword(text) {
  const cleaned = sanitizeFileText(text, 80);
  if (!cleaned) return "写真";

  const commonPhrases = [
    "が破損しているので業者対応が必要",
    "が破損している",
    "が汚れている",
    "が壊れている",
    "が故障している",
    "の清掃が必要",
    "清掃が必要",
    "修繕が必要",
    "業者対応が必要",
    "対応が必要",
    "してください",
    "必要です",
    "です",
  ];

  let keyword = cleaned;
  commonPhrases.forEach((phrase) => {
    keyword = keyword.replace(phrase, "");
  });

  const particleIndex = keyword.search(/[がをにはので]/);
  if (particleIndex > 0) {
    keyword = keyword.slice(0, particleIndex);
  }

  return sanitizeFileText(keyword || cleaned, 16);
}

function sanitizeFileText(text, maxLength) {
  return String(text || "")
    .replace(/[\s　]+/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/[。、，,.]/g, "")
    .slice(0, maxLength || 40);
}

function getOutputSheet(spreadsheet, storeName) {
  const safeSheetName = makeSafeSheetName(storeName || "記録");
  let sheet = spreadsheet.getSheetByName(safeSheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(safeSheetName);
  }

  return sheet;
}

function makeSafeSheetName(name) {
  return String(name || "記録")
    .replace(/[\\/?*[\]:]/g, "")
    .slice(0, 80);
}

function ensureHeader(sheet, header) {
  const firstRow = sheet.getRange(1, 1, 1, header.length).getValues()[0];
  const hasHeader = firstRow.some((value) => value);

  if (!hasHeader) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.setFrozenRows(1);
  }

  sheet.getRange(1, 1, 1, header.length)
    .setFontWeight("bold")
    .setBackground("#e5e7eb");

  sheet.autoResizeColumns(1, header.length);
}

function applySheetFormats(sheet, checkType) {
  const maxRows = Math.max(sheet.getMaxRows(), 1000);
  const ss = sheet.getParent();
  const settingSheet = ss.getSheetByName(SETTING_SHEET_NAME);

  if (!settingSheet) {
    return;
  }

  if (checkType === "daily") {
    // 日次：トイレ〜入口 D/G? 実際は F〜I列
    copyValidationAndFormat(settingSheet, SETTING_DAILY_STATUS_CELL, sheet.getRange(2, 6, maxRows - 1, 4));
    // 総合評価 J列、緊急度 K列
    copyValidationAndFormat(settingSheet, SETTING_GRADE_CELL, sheet.getRange(2, 10, maxRows - 1, 2));
    // 対応ステータス P列
    copyValidationAndFormat(settingSheet, SETTING_REPAIR_STATUS_CELL, sheet.getRange(2, 16, maxRows - 1, 1));
  }

  if (checkType === "weekly") {
    // 週次：設備〜導線 F〜H列、総合評価 I列、緊急度 J列
    copyValidationAndFormat(settingSheet, SETTING_GRADE_CELL, sheet.getRange(2, 6, maxRows - 1, 5));
    // 対応ステータス O列
    copyValidationAndFormat(settingSheet, SETTING_REPAIR_STATUS_CELL, sheet.getRange(2, 15, maxRows - 1, 1));
  }
}

function applyRepairSheetFormats(sheet) {
  const maxRows = Math.max(sheet.getMaxRows(), 1000);
  const dailySS = SpreadsheetApp.openById(DAILY_SHEET_ID);
  const settingSheet = dailySS.getSheetByName(SETTING_SHEET_NAME);

  if (!settingSheet) {
    return;
  }

  // 優先度 K列
  copyValidationAndFormat(settingSheet, SETTING_GRADE_CELL, sheet.getRange(2, 11, maxRows - 1, 1));
  // 対応ステータス L列
  copyValidationAndFormat(settingSheet, SETTING_REPAIR_STATUS_CELL, sheet.getRange(2, 12, maxRows - 1, 1));
}

function copyValidationAndFormat(templateSheet, templateCellA1, targetRange) {
  const templateCell = templateSheet.getRange(templateCellA1);

  templateCell.copyTo(
    targetRange,
    SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
    false
  );

  templateCell.copyTo(
    targetRange,
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false
  );
}

function createJsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// 初回セットアップ用：手動で1回実行
function setupAllSheets() {
  setupSettingSheet(SpreadsheetApp.openById(DAILY_SHEET_ID));
  setupSettingSheet(SpreadsheetApp.openById(WEEKLY_SHEET_ID));
  setupSettingSheet(SpreadsheetApp.openById(REPAIR_SHEET_ID));

  const dailySS = SpreadsheetApp.openById(DAILY_SHEET_ID);
  const weeklySS = SpreadsheetApp.openById(WEEKLY_SHEET_ID);
  const repairSS = SpreadsheetApp.openById(REPAIR_SHEET_ID);

  ensureHeader(getOutputSheet(dailySS, "サンプル"), DAILY_HEADER);
  ensureHeader(getOutputSheet(weeklySS, "サンプル"), WEEKLY_HEADER);
  ensureHeader(getOutputSheet(repairSS, "サンプル"), REPAIR_HEADER);
}

function setupSettingSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SETTING_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SETTING_SHEET_NAME);
  }

  sheet.getRange("A1").setValue("S");
  sheet.getRange("B1").setValue("OK");
  sheet.getRange("C1").setValue("未対応");

  const gradeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["S", "A", "B", "C"], true)
    .setAllowInvalid(false)
    .build();

  const dailyRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["OK", "NG"], true)
    .setAllowInvalid(false)
    .build();

  const repairStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["未対応", "対応中", "完了"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange("A1").setDataValidation(gradeRule);
  sheet.getRange("B1").setDataValidation(dailyRule);
  sheet.getRange("C1").setDataValidation(repairStatusRule);

  sheet.getRange("A1:C1")
    .setFontWeight("bold")
    .setBackground("#e5e7eb");

  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 160);
}

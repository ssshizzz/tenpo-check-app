const FOLDER_ID = "1r5_Jhg1HnFaOGlXHkhYrvJZmxYN8Na4K";
const DAILY_SHEET_ID = "1PQvFFSRr4tn_gs4nHSseWeSicHsDObwogDXKHUlOGPo";
const WEEKLY_SHEET_ID = "1aRFwmNY7xCUwD999jITQsRZA9oOlpUATngGI2WOFfUI";
const REPAIR_SHEET_ID = "1vXevJBB-2UVZSFyD__rhXtauwGnM-5nq8R5ua3kz6XY";

const SETTING_SHEET_NAME = "設定";
const SETTING_URGENCY_CELL = "A1";
const SETTING_DAILY_STATUS_CELL = "B1";
const SETTING_REPAIR_STATUS_CELL = "C1";
const DEFAULT_REPAIR_STATUS = "未対応";

const DAILY_HEADERS = [
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

const WEEKLY_HEADERS = [
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

const REPAIR_HEADERS = [
  "修繕ID",
  "元チェックID",
  "チェック種別",
  "登録日時",
  "発生日",
  "店舗名",
  "担当者",
  "内容",
  "写真ファイル名",
  "画像URL",
  "サムネイル",
  "緊急度",
  "総合評価",
  "対応ステータス",
  "対応期限",
  "対応完了日",
  "対応担当者",
  "対応内容",
  "備考",
];

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === "getSettings") return getSettingsResponse(e);
    return createJsonResponse({ ok: false, error: "不明なactionです" });
  } catch (error) {
    return createJsonResponse({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const result = saveCheck(data);
    return createJsonResponse({ ok: true, ...result });
  } catch (error) {
    return createJsonResponse({ ok: false, error: error.message });
  }
}

function getSettingsResponse(e) {
  const settings = buildSettingsPayload();
  const json = JSON.stringify({ ok: true, ...settings });
  const callback = e.parameter.callback;
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return createJsonResponse({ ok: true, ...settings });
}

function buildSettingsPayload() {
  const dailySS = SpreadsheetApp.openById(DAILY_SHEET_ID);
  const weeklySS = SpreadsheetApp.openById(WEEKLY_SHEET_ID);
  const repairSS = SpreadsheetApp.openById(REPAIR_SHEET_ID);
  const stores = uniqueValues([
    ...getStoreNamesFromSpreadsheet(dailySS),
    ...getStoreNamesFromSpreadsheet(weeklySS),
    ...getStoreNamesFromSpreadsheet(repairSS),
    ...getSettingColumnValues(dailySS, "店舗名"),
    ...getSettingColumnValues(weeklySS, "店舗名"),
  ]).filter((name) => name !== SETTING_SHEET_NAME);

  return {
    stores,
    dailyCheckOptions: getValidationValues(dailySS, SETTING_DAILY_STATUS_CELL, ["OK", "NG"]),
    weeklyGradeOptions: getValidationValues(weeklySS, SETTING_URGENCY_CELL, ["S", "A", "B", "C"]),
    urgencyOptions: getValidationValues(dailySS, SETTING_URGENCY_CELL, ["S", "A", "B", "C"]).filter((value) => value !== "D"),
    repairStatusOptions: getValidationValues(dailySS, SETTING_REPAIR_STATUS_CELL, ["未対応", "対応中", "完了"]),
  };
}

function saveCheck(data) {
  const checkType = normalizeCheckType(data.checkType);
  const storeName = requiredText(data.storeName, "店舗名");
  const staffName = requiredText(data.staffName, "担当者");
  const memo = String(data.memo || "").trim();
  const note = String(data.note || "").trim();
  const now = new Date();
  const checkId = makeId(checkType === "daily" ? "D" : "W", now);

  const imageInfo = saveImageIfPresent(data, checkType, storeName, checkId);
  const calculation = checkType === "daily"
    ? calculateDaily(data.dailyChecks || {})
    : calculateWeekly(data.weeklyChecks || {});

  const shouldRepair = shouldCreateRepair(checkType, calculation, memo, imageInfo.hasImage);
  let repairId = "";
  let repairDeadline = "";

  if (shouldRepair) {
    repairId = makeId("R", now);
    repairDeadline = calculateDeadline(calculation.urgency, now);
    appendRepairRow({
      repairId,
      checkId,
      checkType,
      now,
      storeName,
      staffName,
      memo,
      note,
      fileName: imageInfo.fileName,
      fileUrl: imageInfo.fileUrl,
      thumbnailFormula: imageInfo.thumbnailFormula,
      urgency: calculation.urgency,
      evaluation: calculation.evaluation,
      deadline: repairDeadline,
    });
  }

  if (checkType === "daily") {
    appendDailyRow({
      checkId,
      repairId,
      now,
      storeName,
      staffName,
      checks: data.dailyChecks || {},
      evaluation: calculation.evaluation,
      urgency: calculation.urgency,
      imageInfo,
      memo,
      status: repairId ? DEFAULT_REPAIR_STATUS : "",
      deadline: repairDeadline,
      note,
    });
  } else {
    appendWeeklyRow({
      checkId,
      repairId,
      now,
      storeName,
      staffName,
      checks: data.weeklyChecks || {},
      evaluation: calculation.evaluation,
      urgency: calculation.urgency,
      imageInfo,
      memo,
      status: repairId ? DEFAULT_REPAIR_STATUS : "",
      deadline: repairDeadline,
      note,
    });
  }

  return {
    checkId,
    repairId,
    checkType,
    storeName,
    evaluation: calculation.evaluation,
    urgency: calculation.urgency,
    repaired: Boolean(repairId),
    fileUrl: imageInfo.fileUrl,
  };
}

function appendDailyRow(payload) {
  const ss = SpreadsheetApp.openById(DAILY_SHEET_ID);
  const sheet = getOrCreateStoreSheet(ss, payload.storeName);
  ensureCheckHeader(sheet, DAILY_HEADERS, "daily");
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, DAILY_HEADERS.length).setValues([[
    payload.checkId,
    payload.repairId,
    payload.now,
    payload.storeName,
    payload.staffName,
    payload.checks.toilet || "",
    payload.checks.seats || "",
    payload.checks.kitchen || "",
    payload.checks.entrance || "",
    payload.evaluation,
    payload.urgency,
    payload.imageInfo.fileName,
    payload.memo,
    payload.imageInfo.fileUrl ? "画像を開く" : "",
    payload.imageInfo.thumbnailFormula,
    payload.status,
    payload.deadline,
    "",
    payload.note,
  ]]);
  applyImageRichText(sheet, row, 14, payload.imageInfo.fileUrl);
  styleInsertedRow(sheet, row, DAILY_HEADERS.length);
}

function appendWeeklyRow(payload) {
  const ss = SpreadsheetApp.openById(WEEKLY_SHEET_ID);
  const sheet = getOrCreateStoreSheet(ss, payload.storeName);
  ensureCheckHeader(sheet, WEEKLY_HEADERS, "weekly");
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, WEEKLY_HEADERS.length).setValues([[
    payload.checkId,
    payload.repairId,
    payload.now,
    payload.storeName,
    payload.staffName,
    payload.checks.equipment || "",
    payload.checks.interior || "",
    payload.checks.flow || "",
    payload.evaluation,
    payload.urgency,
    payload.imageInfo.fileName,
    payload.memo,
    payload.imageInfo.fileUrl ? "画像を開く" : "",
    payload.imageInfo.thumbnailFormula,
    payload.status,
    payload.deadline,
    "",
    payload.note,
  ]]);
  applyImageRichText(sheet, row, 13, payload.imageInfo.fileUrl);
  styleInsertedRow(sheet, row, WEEKLY_HEADERS.length);
}

function appendRepairRow(payload) {
  const ss = SpreadsheetApp.openById(REPAIR_SHEET_ID);
  const sheet = getOrCreateStoreSheet(ss, payload.storeName);
  ensureRepairHeader(sheet);
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, REPAIR_HEADERS.length).setValues([[
    payload.repairId,
    payload.checkId,
    payload.checkType === "daily" ? "日次" : "週次",
    payload.now,
    payload.now,
    payload.storeName,
    payload.staffName,
    payload.memo,
    payload.fileName,
    payload.fileUrl ? "画像を開く" : "",
    payload.thumbnailFormula,
    payload.urgency,
    payload.evaluation,
    DEFAULT_REPAIR_STATUS,
    payload.deadline,
    "",
    "",
    "",
    payload.note,
  ]]);
  applyImageRichText(sheet, row, 10, payload.fileUrl);
  styleInsertedRow(sheet, row, REPAIR_HEADERS.length);
}

function ensureCheckHeader(sheet, headers, type) {
  ensureHeader(sheet, headers);
  const ss = sheet.getParent();
  if (type === "daily") {
    copyValidationAndFormat(ss, SETTING_DAILY_STATUS_CELL, sheet.getRange(2, 6, Math.max(sheet.getMaxRows() - 1, 1), 4));
    copyValidationAndFormat(ss, SETTING_URGENCY_CELL, sheet.getRange(2, 10, Math.max(sheet.getMaxRows() - 1, 1), 2));
    copyValidationAndFormat(ss, SETTING_REPAIR_STATUS_CELL, sheet.getRange(2, 16, Math.max(sheet.getMaxRows() - 1, 1), 1));
  } else {
    copyValidationAndFormat(ss, SETTING_URGENCY_CELL, sheet.getRange(2, 6, Math.max(sheet.getMaxRows() - 1, 1), 5));
    copyValidationAndFormat(ss, SETTING_REPAIR_STATUS_CELL, sheet.getRange(2, 15, Math.max(sheet.getMaxRows() - 1, 1), 1));
  }
}

function ensureRepairHeader(sheet) {
  ensureHeader(sheet, REPAIR_HEADERS);
  const ss = sheet.getParent();
  copyValidationAndFormat(ss, SETTING_URGENCY_CELL, sheet.getRange(2, 12, Math.max(sheet.getMaxRows() - 1, 1), 2));
  copyValidationAndFormat(ss, SETTING_REPAIR_STATUS_CELL, sheet.getRange(2, 14, Math.max(sheet.getMaxRows() - 1, 1), 1));
}

function ensureHeader(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const same = headers.every((header, index) => current[index] === header);
  if (!same) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e5e7eb");
  const widths = [150, 150, 160, 150, 120, 90, 90, 90, 90, 100, 110, 230, 360, 110, 180, 120, 120, 120, 260];
  for (let i = 0; i < headers.length; i++) sheet.setColumnWidth(i + 1, widths[i] || 140);
}

function styleInsertedRow(sheet, row, colCount) {
  sheet.getRange(row, 1, 1, colCount).setVerticalAlignment("middle");
  sheet.setRowHeight(row, 130);
}

function copyValidationAndFormat(ss, sourceCellA1, targetRange) {
  const settingSheet = ss.getSheetByName(SETTING_SHEET_NAME);
  if (!settingSheet) return;
  const source = settingSheet.getRange(sourceCellA1);
  source.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
  source.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
}

function saveImageIfPresent(data, checkType, storeName, checkId) {
  const base64 = data.imageBase64 || "";
  if (!base64) return { hasImage: false, fileName: "", fileUrl: "", thumbnailFormula: "" };
  const mimeType = data.mimeType || "image/jpeg";
  const fileName = data.fileName || makeImageFileName(checkType, storeName, checkId);
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileUrl = file.getUrl();
  const imageViewUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
  return {
    hasImage: true,
    fileName,
    fileUrl,
    thumbnailFormula: '=IMAGE("' + imageViewUrl + '", 1)',
  };
}

function applyImageRichText(sheet, row, col, fileUrl) {
  if (!fileUrl) return;
  const richText = SpreadsheetApp.newRichTextValue().setText("画像を開く").setLinkUrl(fileUrl).build();
  sheet.getRange(row, col).setRichTextValue(richText);
}

function calculateDaily(checks) {
  const values = [checks.toilet, checks.seats, checks.kitchen, checks.entrance];
  const ngCount = values.filter((value) => value === "NG").length;
  const evaluation = ngCount === 0 ? "S" : ngCount === 1 ? "B" : "C";
  const urgency = ngCount === 0 ? "C" : ngCount === 1 ? "B" : "S";
  return { evaluation, urgency, ngCount };
}

function calculateWeekly(checks) {
  const values = [checks.equipment, checks.interior, checks.flow].filter(Boolean);
  const worst = worstGrade(values);
  const evaluation = worst || "S";
  const urgencyMap = { S: "C", A: "B", B: "A", C: "S" };
  return { evaluation, urgency: urgencyMap[evaluation] || "C", hasC: values.includes("C") };
}

function worstGrade(values) {
  const order = { S: 1, A: 2, B: 3, C: 4 };
  let worst = "S";
  values.forEach((value) => {
    if ((order[value] || 99) > (order[worst] || 99)) worst = value;
  });
  return worst;
}

function shouldCreateRepair(checkType, calculation, memo, hasImage) {
  if (checkType === "daily" && calculation.ngCount > 0) return true;
  if (checkType === "weekly" && calculation.hasC) return true;
  if (["S", "A"].includes(calculation.urgency) && memo && hasImage) return true;
  return false;
}

function calculateDeadline(urgency, baseDate) {
  const daysMap = { S: 0, A: 3, B: 7, C: 14 };
  const days = daysMap[urgency] == null ? 7 : daysMap[urgency];
  const date = new Date(baseDate.getTime());
  date.setDate(date.getDate() + days);
  return date;
}

function getOrCreateStoreSheet(ss, storeName) {
  const safe = makeSafeSheetName(storeName);
  let sheet = ss.getSheetByName(safe);
  if (!sheet) sheet = ss.insertSheet(safe);
  return sheet;
}

function getStoreNamesFromSpreadsheet(ss) {
  return ss.getSheets().map((sheet) => sheet.getName()).filter((name) => name !== SETTING_SHEET_NAME);
}

function getSettingColumnValues(ss, headerName) {
  const sheet = ss.getSheetByName(SETTING_SHEET_NAME);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values[0].map((value) => String(value || "").trim());
  const col = headers.indexOf(headerName);
  if (col < 0) return [];
  return values.slice(1).map((row) => String(row[col] || "").trim()).filter(Boolean);
}

function getValidationValues(ss, cellA1, fallback) {
  const sheet = ss.getSheetByName(SETTING_SHEET_NAME);
  if (!sheet) return fallback;
  const rule = sheet.getRange(cellA1).getDataValidation();
  if (!rule) return fallback;
  const type = rule.getCriteriaType();
  const values = rule.getCriteriaValues();
  if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    return values[0].map((value) => String(value).trim()).filter(Boolean);
  }
  if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
    return values[0].getValues().flat().map((value) => String(value).trim()).filter(Boolean);
  }
  return fallback;
}

function normalizeCheckType(value) {
  if (value === "daily" || value === "日次") return "daily";
  if (value === "weekly" || value === "週次") return "weekly";
  throw new Error("チェック種別が不正です");
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(label + "がありません");
  return text;
}

function makeId(prefix, date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return prefix + "-" + yyyy + mm + dd + "-" + hh + mi + ss + "-" + rand;
}

function makeImageFileName(checkType, storeName, checkId) {
  return [checkType === "daily" ? "日次" : "週次", sanitizeFileText(storeName, 24), checkId].join("_") + ".jpg";
}

function sanitizeFileText(text, maxLength) {
  return String(text || "")
    .replace(/[\s　]+/g, "")
    .replace(/[\\/:*?\"<>|]/g, "")
    .replace(/[。、，,.]/g, "")
    .slice(0, maxLength || 40);
}

function makeSafeSheetName(name) {
  return String(name || "記録").replace(/[\\/?*[\]:]/g, "").slice(0, 80);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function createJsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function setupAllSheets() {
  setupWorkbook(DAILY_SHEET_ID, DAILY_HEADERS, "daily");
  setupWorkbook(WEEKLY_SHEET_ID, WEEKLY_HEADERS, "weekly");
  setupRepairWorkbook();
}

function setupWorkbook(spreadsheetId, headers, type) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  ensureSettingSheet(ss);
  ss.getSheets().forEach((sheet) => {
    if (sheet.getName() === SETTING_SHEET_NAME) return;
    ensureCheckHeader(sheet, headers, type);
  });
}

function setupRepairWorkbook() {
  const ss = SpreadsheetApp.openById(REPAIR_SHEET_ID);
  ensureSettingSheet(ss);
  ss.getSheets().forEach((sheet) => {
    if (sheet.getName() === SETTING_SHEET_NAME) return;
    ensureRepairHeader(sheet);
  });
}

function ensureSettingSheet(ss) {
  let sheet = ss.getSheetByName(SETTING_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SETTING_SHEET_NAME);
  const urgencyRule = SpreadsheetApp.newDataValidation().requireValueInList(["S", "A", "B", "C"], true).build();
  const dailyRule = SpreadsheetApp.newDataValidation().requireValueInList(["OK", "NG"], true).build();
  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(["未対応", "対応中", "完了"], true).build();
  sheet.getRange(SETTING_URGENCY_CELL).setValue("S").setDataValidation(urgencyRule);
  sheet.getRange(SETTING_DAILY_STATUS_CELL).setValue("OK").setDataValidation(dailyRule);
  sheet.getRange(SETTING_REPAIR_STATUS_CELL).setValue(DEFAULT_REPAIR_STATUS).setDataValidation(statusRule);
  sheet.getRange("A1:C1").setFontWeight("bold").setBackground("#f1f5f9");
}

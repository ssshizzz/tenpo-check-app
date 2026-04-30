import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Mic, RefreshCw, RotateCcw, Send, Square, UploadCloud } from "lucide-react";

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "https://script.google.com/macros/s/ここにデプロイURLを入れてください/exec";

const INITIAL_DAILY = { toilet: "OK", seats: "OK", kitchen: "OK", entrance: "OK" };
const INITIAL_WEEKLY = { equipment: "S", interior: "S", flow: "S" };

export default function App() {
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const [settings, setSettings] = useState({
    stores: [],
    dailyCheckOptions: ["OK", "NG"],
    weeklyGradeOptions: ["S", "A", "B", "C"],
    urgencyOptions: ["S", "A", "B", "C"],
    repairStatusOptions: ["未対応", "対応中", "完了"],
  });
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);

  const [checkType, setCheckType] = useState("daily");
  const [storeName, setStoreName] = useState("");
  const [staffName, setStaffName] = useState("");
  const [dailyChecks, setDailyChecks] = useState(INITIAL_DAILY);
  const [weeklyChecks, setWeeklyChecks] = useState(INITIAL_WEEKLY);
  const [memo, setMemo] = useState("");
  const [note, setNote] = useState("");
  const [imageBlob, setImageBlob] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState("待機中");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    loadSettings();
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const calculation = useMemo(() => {
    return checkType === "daily" ? calculateDaily(dailyChecks) : calculateWeekly(weeklyChecks);
  }, [checkType, dailyChecks, weeklyChecks]);

  const needsRepair = useMemo(() => {
    if (checkType === "daily") return Object.values(dailyChecks).includes("NG");
    return Object.values(weeklyChecks).includes("C") || ["S", "A"].includes(calculation.urgency);
  }, [checkType, dailyChecks, weeklyChecks, calculation.urgency]);

  const requiresIssueInput = needsRepair;

  function loadSettings() {
    setIsSettingsLoading(true);
    setError("");
    const callbackName = `settingsCallback_${Date.now()}`;
    const script = document.createElement("script");

    window[callbackName] = (response) => {
      try {
        if (!response?.ok) throw new Error(response?.error || "設定の取得に失敗しました");
        setSettings({
          stores: response.stores?.length ? response.stores : [],
          dailyCheckOptions: response.dailyCheckOptions?.length ? response.dailyCheckOptions : ["OK", "NG"],
          weeklyGradeOptions: normalizeGradeOptions(response.weeklyGradeOptions),
          urgencyOptions: normalizeGradeOptions(response.urgencyOptions),
          repairStatusOptions: response.repairStatusOptions?.length ? response.repairStatusOptions : ["未対応", "対応中", "完了"],
        });
        setStatus("設定シートを読み込みました");
      } catch (e) {
        setError(e.message);
      } finally {
        setIsSettingsLoading(false);
        delete window[callbackName];
        script.remove();
      }
    };

    script.onerror = () => {
      setIsSettingsLoading(false);
      setError("設定を読み込めませんでした。Apps ScriptのURLとデプロイ設定を確認してください。");
      delete window[callbackName];
      script.remove();
    };

    script.src = `${APPS_SCRIPT_URL}?action=getSettings&callback=${callbackName}`;
    document.body.appendChild(script);
  }

  function normalizeGradeOptions(values) {
    const base = Array.isArray(values) ? values.filter((value) => ["S", "A", "B", "C"].includes(value)) : [];
    return base.length ? base : ["S", "A", "B", "C"];
  }

  function updateDaily(key, value) {
    setDailyChecks((current) => ({ ...current, [key]: value }));
  }

  function updateWeekly(key, value) {
    setWeeklyChecks((current) => ({ ...current, [key]: value }));
  }

  function openCamera() {
    setError("");
    fileInputRef.current?.click();
  }

  async function handleImageSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setStatus("写真を準備中です");
      const compressedBlob = await resizeImage(file, 1400, 0.82);
      const previewUrl = URL.createObjectURL(compressedBlob);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageBlob(compressedBlob);
      setImageUrl(previewUrl);
      const name = makeFileName(checkType, storeName, memo);
      setFileName(name);
      setStatus("写真を添付しました");
    } catch (e) {
      setError("写真の読み込みに失敗しました。もう一度撮影してください。");
    }
  }

  function resizeImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) reject(new Error("画像変換に失敗しました"));
            else resolve(blob);
          }, "image/jpeg", quality);
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function startSpeechRecognition() {
    setError("");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("このブラウザでは音声認識が使えません。説明文を手入力してください。");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onstart = () => {
      setIsListening(true);
      setStatus("音声認識中です。異常内容を話してください。");
    };
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setMemo(transcript);
      setFileName(makeFileName(checkType, storeName, transcript));
    };
    recognition.onerror = () => {
      setError("音声認識でエラーが出ました。手入力も利用できます。");
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      setStatus("音声認識を終了しました");
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopSpeechRecognition() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  function resetImage() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageBlob(null);
    setImageUrl("");
    setFileName("");
    setStatus("写真をリセットしました");
  }

  function resetForm() {
    resetImage();
    setDailyChecks(INITIAL_DAILY);
    setWeeklyChecks(INITIAL_WEEKLY);
    setMemo("");
    setNote("");
    setLastResult(null);
    setError("");
    setStatus("入力をリセットしました");
  }

  function validate() {
    if (!storeName.trim()) return "店舗名を選択してください。";
    if (!staffName.trim()) return "担当者を入力してください。";
    if (checkType === "daily") {
      if (!dailyChecks.toilet || !dailyChecks.seats || !dailyChecks.kitchen || !dailyChecks.entrance) {
        return "日次チェックをすべて入力してください。";
      }
    }
    if (checkType === "weekly") {
      if (!weeklyChecks.equipment || !weeklyChecks.interior || !weeklyChecks.flow) {
        return "週次チェックをすべて入力してください。";
      }
    }
    if (requiresIssueInput && !memo.trim()) return "修繕登録が発生するため、説明文を入力してください。";
    if (requiresIssueInput && !imageBlob) return "修繕登録が発生するため、写真を添付してください。";
    return "";
  }

  async function send() {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    try {
      setIsSending(true);
      setError("");
      setStatus("送信中です");
      const imageBase64 = imageBlob ? await blobToBase64(imageBlob) : "";
      const finalFileName = fileName || makeFileName(checkType, storeName, memo);

      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          checkType,
          storeName,
          staffName,
          dailyChecks,
          weeklyChecks,
          evaluation: calculation.evaluation,
          urgency: calculation.urgency,
          memo,
          note,
          fileName: imageBlob ? finalFileName : "",
          imageBase64,
          mimeType: "image/jpeg",
        }),
      });

      setLastResult({
        checkType,
        storeName,
        evaluation: calculation.evaluation,
        urgency: calculation.urgency,
        repaired: needsRepair,
      });
      setStatus(needsRepair ? "送信しました。修繕管理にも登録されます。" : "送信しました。チェック履歴に登録されます。");
      setDailyChecks(INITIAL_DAILY);
      setWeeklyChecks(INITIAL_WEEKLY);
      setMemo("");
      setNote("");
      resetImage();
    } catch (e) {
      setError("送信に失敗しました。通信状況とApps Scriptのデプロイを確認してください。");
      setStatus("送信エラー");
    } finally {
      setIsSending(false);
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function makeFileName(type, store, text) {
    const now = makeDateText();
    const kind = type === "daily" ? "日次" : "週次";
    const keyword = extractKeyword(text) || "チェック";
    return `${kind}_${sanitizeFileText(store || "店舗未選択", 20)}_${keyword}_${now}.jpg`;
  }

  function makeDateText() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
  }

  function sanitizeFileText(text, maxLength = 40) {
    return String(text || "").replace(/[\s　]+/g, "").replace(/[\\/:*?"<>|]/g, "").replace(/[。、，,.]/g, "").slice(0, maxLength);
  }

  function extractKeyword(text) {
    const cleaned = sanitizeFileText(text, 80);
    if (!cleaned) return "";
    let keyword = cleaned;
    ["が破損している", "が汚れている", "が壊れている", "が故障している", "修繕が必要", "対応が必要", "してください", "必要です", "です"].forEach((phrase) => {
      keyword = keyword.replace(phrase, "");
    });
    const particleIndex = keyword.search(/[がをにはので]/);
    if (particleIndex > 0) keyword = keyword.slice(0, particleIndex);
    return sanitizeFileText(keyword || cleaned, 12);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>店舗チェック</h1>
            <p style={styles.subtitle}>日次・週次チェックを記録し、必要時は修繕管理へ自動登録</p>
          </div>
          <button style={styles.reloadButton} onClick={loadSettings} disabled={isSettingsLoading || isSending}>
            <RefreshCw size={20} />
          </button>
        </div>

        <div style={styles.card}>
          <div style={styles.segmented}>
            <button style={checkType === "daily" ? styles.segmentActive : styles.segment} onClick={() => setCheckType("daily")} disabled={isSending}>日次</button>
            <button style={checkType === "weekly" ? styles.segmentActive : styles.segment} onClick={() => setCheckType("weekly")} disabled={isSending}>週次</button>
          </div>

          <label style={styles.label}>店舗名</label>
          <select value={storeName} onChange={(e) => setStoreName(e.target.value)} style={styles.select} disabled={isSending}>
            <option value="">選択してください</option>
            {settings.stores.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>

          <label style={styles.label}>担当者</label>
          <input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="例：柴田" style={styles.input} disabled={isSending} />
        </div>

        {checkType === "daily" ? (
          <div style={styles.card}>
            <div style={styles.sectionTitle}>日次チェック</div>
            <CheckRow label="トイレ" value={dailyChecks.toilet} options={settings.dailyCheckOptions} onChange={(value) => updateDaily("toilet", value)} />
            <CheckRow label="客席" value={dailyChecks.seats} options={settings.dailyCheckOptions} onChange={(value) => updateDaily("seats", value)} />
            <CheckRow label="厨房" value={dailyChecks.kitchen} options={settings.dailyCheckOptions} onChange={(value) => updateDaily("kitchen", value)} />
            <CheckRow label="入口" value={dailyChecks.entrance} options={settings.dailyCheckOptions} onChange={(value) => updateDaily("entrance", value)} />
          </div>
        ) : (
          <div style={styles.card}>
            <div style={styles.sectionTitle}>週次チェック</div>
            <CheckRow label="設備" value={weeklyChecks.equipment} options={settings.weeklyGradeOptions} onChange={(value) => updateWeekly("equipment", value)} />
            <CheckRow label="内装" value={weeklyChecks.interior} options={settings.weeklyGradeOptions} onChange={(value) => updateWeekly("interior", value)} />
            <CheckRow label="導線" value={weeklyChecks.flow} options={settings.weeklyGradeOptions} onChange={(value) => updateWeekly("flow", value)} />
          </div>
        )}

        <div style={styles.resultCard(needsRepair)}>
          <div style={styles.resultGrid}>
            <div>
              <div style={styles.resultLabel}>総合評価</div>
              <div style={styles.resultValue}>{calculation.evaluation}</div>
            </div>
            <div>
              <div style={styles.resultLabel}>緊急度(自動)</div>
              <div style={styles.resultValue}>{calculation.urgency}</div>
            </div>
          </div>
          <div style={styles.repairNotice(needsRepair)}>
            {needsRepair ? "修繕へ登録IDが発行され、修繕管理に自動登録されます" : "チェック履歴に登録します。修繕管理には登録しません"}
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.sectionTitle}>異常内容・写真</div>
          {requiresIssueInput && <div style={styles.requiredNotice}>修繕登録が発生するため、説明文と写真が必須です。</div>}
          <label style={styles.label}>説明文</label>
          <textarea value={memo} onChange={(e) => {
            setMemo(e.target.value);
            if (imageBlob) setFileName(makeFileName(checkType, storeName, e.target.value));
          }} placeholder="例：厨房排水口まわりに水漏れあり" style={styles.textarea} disabled={isSending} />

          <div style={styles.buttonRow}>
            {!isListening ? (
              <button style={styles.secondaryButton} onClick={startSpeechRecognition} disabled={isSending}>
                <Mic size={22} /> 音声入力
              </button>
            ) : (
              <button style={styles.dangerButton} onClick={stopSpeechRecognition}>
                <Square size={22} /> 停止
              </button>
            )}
            <button style={styles.secondaryButton} onClick={openCamera} disabled={isSending}>
              <Camera size={22} /> 写真を撮る
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelected} style={{ display: "none" }} />

          <div style={styles.imageBox}>
            {imageUrl ? <img src={imageUrl} alt="チェック写真" style={styles.image} /> : <div style={styles.placeholder}>写真未添付</div>}
          </div>
          {imageBlob && (
            <>
              <div style={styles.fileNameBox}>{fileName}</div>
              <button style={styles.resetButton} onClick={resetImage} disabled={isSending}><RotateCcw size={18} /> 写真をやり直す</button>
            </>
          )}

          <label style={styles.label}>備考</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="任意" style={styles.noteArea} disabled={isSending} />
        </div>

        <button style={styles.sendButton} onClick={send} disabled={isSending}>
          {isSending ? <UploadCloud size={24} /> : <Send size={24} />}
          {isSending ? "送信中" : "送信する"}
        </button>
        <button style={styles.resetAllButton} onClick={resetForm} disabled={isSending}>入力をリセット</button>

        <div style={styles.card}>
          <div style={styles.statusTitle}>状態</div>
          <p style={styles.status}>{status}</p>
          {error && <p style={styles.error}>{error}</p>}
          {lastResult && (
            <div style={styles.doneBox}>
              <CheckCircle2 size={22} />
              <span>{lastResult.storeName} / 総合評価 {lastResult.evaluation} / 緊急度 {lastResult.urgency}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckRow({ label, value, options, onChange }) {
  return (
    <div style={styles.checkRow}>
      <div style={styles.checkLabel}>{label}</div>
      <div style={styles.optionGrid(options.length)}>
        {options.map((option) => (
          <button key={option} style={value === option ? styles.optionActive : styles.option} onClick={() => onChange(option)} type="button">
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function calculateDaily(checks) {
  const values = [checks.toilet, checks.seats, checks.kitchen, checks.entrance];
  const ngCount = values.filter((value) => value === "NG").length;
  return {
    evaluation: ngCount === 0 ? "S" : ngCount === 1 ? "B" : "C",
    urgency: ngCount === 0 ? "C" : ngCount === 1 ? "B" : "S",
  };
}

function calculateWeekly(checks) {
  const values = [checks.equipment, checks.interior, checks.flow];
  const order = { S: 1, A: 2, B: 3, C: 4 };
  let worst = "S";
  values.forEach((value) => {
    if ((order[value] || 99) > (order[worst] || 99)) worst = value;
  });
  const urgencyMap = { S: "C", A: "B", B: "A", C: "S" };
  return { evaluation: worst, urgency: urgencyMap[worst] || "C" };
}

const styles = {
  page: { minHeight: "100vh", background: "#f1f5f9", padding: "16px 14px 34px", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", color: "#0f172a" },
  container: { maxWidth: 460, margin: "0 auto" },
  header: { background: "white", borderRadius: 22, padding: 18, marginBottom: 14, boxShadow: "0 1px 10px rgba(15,23,42,0.08)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  title: { margin: 0, fontSize: 28, letterSpacing: "-0.02em" },
  subtitle: { margin: "6px 0 0", color: "#64748b", fontSize: 14, lineHeight: 1.5 },
  reloadButton: { width: 44, height: 44, borderRadius: 16, border: "1px solid #cbd5e1", background: "white", display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a" },
  card: { background: "white", borderRadius: 22, padding: 16, marginBottom: 14, boxShadow: "0 1px 10px rgba(15,23,42,0.08)" },
  segmented: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "#e2e8f0", padding: 5, borderRadius: 18, marginBottom: 14 },
  segment: { height: 48, border: "none", borderRadius: 14, background: "transparent", fontSize: 18, fontWeight: "700", color: "#475569" },
  segmentActive: { height: 48, border: "none", borderRadius: 14, background: "#0f172a", color: "white", fontSize: 18, fontWeight: "800" },
  label: { display: "block", fontWeight: "800", marginBottom: 8, marginTop: 12 },
  select: { width: "100%", height: 54, borderRadius: 16, border: "1px solid #cbd5e1", background: "white", padding: "0 12px", fontSize: 17, boxSizing: "border-box" },
  input: { width: "100%", height: 54, borderRadius: 16, border: "1px solid #cbd5e1", padding: "0 12px", fontSize: 17, boxSizing: "border-box" },
  sectionTitle: { fontSize: 19, fontWeight: "900", marginBottom: 10 },
  checkRow: { display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, alignItems: "center", margin: "12px 0" },
  checkLabel: { fontSize: 17, fontWeight: "800" },
  optionGrid: (count) => ({ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 8 }),
  option: { height: 48, borderRadius: 14, border: "1px solid #cbd5e1", background: "white", fontSize: 17, fontWeight: "800", color: "#334155" },
  optionActive: { height: 48, borderRadius: 14, border: "none", background: "#0f172a", color: "white", fontSize: 17, fontWeight: "900" },
  resultCard: (warn) => ({ background: warn ? "#fff7ed" : "#ecfdf5", border: warn ? "1px solid #fed7aa" : "1px solid #bbf7d0", borderRadius: 22, padding: 16, marginBottom: 14, boxShadow: "0 1px 10px rgba(15,23,42,0.06)" }),
  resultGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  resultLabel: { color: "#64748b", fontWeight: "800", fontSize: 13 },
  resultValue: { fontSize: 36, fontWeight: "900", lineHeight: 1.1 },
  repairNotice: (warn) => ({ marginTop: 10, padding: 12, borderRadius: 16, background: warn ? "#ffedd5" : "#dcfce7", color: warn ? "#9a3412" : "#166534", fontWeight: "800", lineHeight: 1.4 }),
  requiredNotice: { background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 14, fontWeight: "800", marginBottom: 12 },
  textarea: { width: "100%", minHeight: 112, borderRadius: 16, border: "1px solid #cbd5e1", padding: 12, fontSize: 16, boxSizing: "border-box", lineHeight: 1.5 },
  noteArea: { width: "100%", minHeight: 74, borderRadius: 16, border: "1px solid #cbd5e1", padding: 12, fontSize: 16, boxSizing: "border-box", lineHeight: 1.5 },
  buttonRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12, marginBottom: 12 },
  secondaryButton: { height: 56, borderRadius: 17, border: "1px solid #cbd5e1", background: "white", color: "#0f172a", fontSize: 16, fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 },
  dangerButton: { height: 56, borderRadius: 17, border: "none", background: "#dc2626", color: "white", fontSize: 16, fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 },
  imageBox: { aspectRatio: "4 / 3", background: "#0f172a", borderRadius: 20, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 12 },
  image: { width: "100%", height: "100%", objectFit: "contain" },
  placeholder: { color: "white", opacity: 0.72, fontSize: 18, fontWeight: "800" },
  fileNameBox: { marginTop: 10, background: "#f8fafc", borderRadius: 14, padding: 10, color: "#334155", wordBreak: "break-all", fontSize: 13 },
  resetButton: { marginTop: 10, height: 46, borderRadius: 15, border: "1px solid #cbd5e1", background: "white", color: "#334155", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%" },
  sendButton: { width: "100%", height: 72, borderRadius: 22, border: "none", background: "#0f172a", color: "white", fontSize: 21, fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 },
  resetAllButton: { width: "100%", height: 48, borderRadius: 16, border: "1px solid #cbd5e1", background: "white", color: "#334155", fontSize: 16, fontWeight: "800", marginBottom: 14 },
  statusTitle: { fontWeight: "900" },
  status: { color: "#334155", lineHeight: 1.5 },
  error: { background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 14, fontWeight: "800", lineHeight: 1.5 },
  doneBox: { display: "flex", alignItems: "center", gap: 8, background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 14, fontWeight: "800" },
};

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Mic,
  RefreshCw,
  RotateCcw,
  Send,
  Square,
  UploadCloud,
} from "lucide-react";

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "";

const DEFAULT_SETTINGS = {
  storeMaster: [],
  dailyCheckOptions: ["OK", "NG"],
  weeklyGradeOptions: ["S", "A", "B", "C"],
  urgencyOptions: ["S", "A", "B", "C"],
  repairStatusOptions: ["未対応", "対応中", "完了"],
};

export default function App() {
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);

  const [checkType, setCheckType] = useState("daily");

  const [businessType, setBusinessType] = useState("");
  const [area, setArea] = useState("");
  const [storeName, setStoreName] = useState("");
  const [staffName, setStaffName] = useState("");

  const [toilet, setToilet] = useState("OK");
  const [seats, setSeats] = useState("OK");
  const [kitchen, setKitchen] = useState("OK");
  const [entrance, setEntrance] = useState("OK");

  const [equipment, setEquipment] = useState("A");
  const [interior, setInterior] = useState("A");
  const [flow, setFlow] = useState("A");

  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");

  const [imageBlob, setImageBlob] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isListening, setIsListening] = useState(false);

  const [status, setStatus] = useState("待機中");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    loadSettings();

    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeMaster = settings.storeMaster || [];

  const businessTypeOptions = useMemo(() => {
    return uniqueValues(storeMaster.map((row) => row.businessType));
  }, [storeMaster]);

  const areaOptions = useMemo(() => {
    return uniqueValues(
      storeMaster
        .filter((row) => !businessType || row.businessType === businessType)
        .map((row) => row.area)
    );
  }, [storeMaster, businessType]);

  const storeOptions = useMemo(() => {
    return uniqueValues(
      storeMaster
        .filter((row) => !businessType || row.businessType === businessType)
        .filter((row) => !area || row.area === area)
        .map((row) => row.storeName)
    );
  }, [storeMaster, businessType, area]);

  const dailyCheckOptions = settings.dailyCheckOptions?.length
    ? settings.dailyCheckOptions
    : ["OK", "NG"];

  const weeklyGradeOptions = settings.weeklyGradeOptions?.length
    ? settings.weeklyGradeOptions
    : ["S", "A", "B", "C"];

  const calculated = useMemo(() => {
    if (checkType === "daily") {
      return calculateDailyResult({ toilet, seats, kitchen, entrance });
    }

    return calculateWeeklyResult({ equipment, interior, flow });
  }, [checkType, toilet, seats, kitchen, entrance, equipment, interior, flow]);

  const needsRepair = calculated.repairNeeded;
  const needsPhoto = needsRepair;
  const todayText = formatDateTime(new Date());

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function loadSettings() {
    if (!APPS_SCRIPT_URL) {
      setError(".env または Vercelの環境変数 VITE_APPS_SCRIPT_URL が未設定です。");
      return;
    }

    setIsSettingsLoading(true);
    setError("");

    const callbackName = `settingsCallback_${Date.now()}`;
    const script = document.createElement("script");

    window[callbackName] = (response) => {
      try {
        if (!response?.ok) {
          throw new Error(response?.error || "設定の取得に失敗しました");
        }

        const nextSettings = {
          ...DEFAULT_SETTINGS,
          ...(response.settings || {}),
        };

        setSettings(nextSettings);

        const firstBusinessType = nextSettings.storeMaster?.[0]?.businessType || "";
        const firstArea = nextSettings.storeMaster?.[0]?.area || "";
        const firstStore = nextSettings.storeMaster?.[0]?.storeName || "";

        setBusinessType((current) => current || firstBusinessType);
        setArea((current) => current || firstArea);
        setStoreName((current) => current || firstStore);

        setStatus("店舗マスタと設定を読み込みました");
      } catch (e) {
        console.error(e);
        setError(e.message);
      } finally {
        setIsSettingsLoading(false);
        delete window[callbackName];
        script.remove();
      }
    };

    script.onerror = () => {
      setIsSettingsLoading(false);
      setError("設定を読み込めませんでした。Apps ScriptのデプロイURLを確認してください。");
      delete window[callbackName];
      script.remove();
    };

    script.src = `${APPS_SCRIPT_URL}?action=getSettings&callback=${callbackName}`;
    document.body.appendChild(script);
  }

  function handleCheckTypeChange(nextType) {
    setCheckType(nextType);
    setLastResult(null);
    setError("");
    setStatus(nextType === "daily" ? "日次チェックに切り替えました" : "週次チェックに切り替えました");
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
      const url = URL.createObjectURL(compressedBlob);

      if (imageUrl) URL.revokeObjectURL(imageUrl);

      setImageBlob(compressedBlob);
      setImageUrl(url);
      setStatus("写真をセットしました");
    } catch (e) {
      console.error(e);
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

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("画像変換に失敗しました"));
                return;
              }
              resolve(blob);
            },
            "image/jpeg",
            quality
          );
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
      setStatus("音声認識中です。問題内容を話してください。");
    };

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setDescription(transcript);
    };

    recognition.onerror = (event) => {
      console.error(event);
      setError("音声認識でエラーが出ました。もう一度試すか、手入力してください。");
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
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsListening(false);
  }

  function resetPhoto() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageBlob(null);
    setImageUrl("");
    setStatus("写真をリセットしました");
  }

  function validateBeforeSend() {
    if (!businessType) return "業態を選択してください。";
    if (!area) return "エリアを選択してください。";
    if (!storeName) return "店舗名を選択してください。";
    if (!staffName.trim()) return "担当者を入力してください。";

    if (needsRepair && !description.trim()) {
      return "修繕登録が発生する内容です。問題内容を入力してください。";
    }

    if (needsPhoto && !imageBlob) {
      return "修繕登録が発生する内容です。写真を添付してください。";
    }

    return "";
  }

  async function sendRecord() {
    try {
      const validationError = validateBeforeSend();
      if (validationError) {
        setError(validationError);
        return;
      }

      setIsSending(true);
      setError("");
      setLastResult(null);
      setStatus("送信中です。閉じずにお待ちください。");

      const imageBase64 = imageBlob ? await blobToBase64(imageBlob) : "";

      const payload = {
        checkType,
        businessType,
        area,
        storeName,
        staffName,
        toilet,
        seats,
        kitchen,
        entrance,
        equipment,
        interior,
        flow,
        description,
        note,
        imageBase64,
        mimeType: "image/jpeg",
        fileName: makeFileName(),
      };

      // Apps Scriptはno-corsだとレスポンスを読めないため、
      // 書き込みは成功扱いにする。失敗時はGAS側ログを確認。
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payload),
      });

      setLastResult({
        repairNeeded: needsRepair,
        evaluation: calculated.evaluation,
        urgency: calculated.urgency,
      });

      setStatus(
        needsRepair
          ? "送信しました。修繕管理にも登録されます。"
          : "送信しました。チェック履歴に登録されます。"
      );

      resetAfterSend();
    } catch (e) {
      console.error(e);
      setError("送信に失敗しました。通信状況またはApps Scriptの設定を確認してください。");
      setStatus("送信エラー");
    } finally {
      setIsSending(false);
    }
  }

  function resetAfterSend() {
    setDescription("");
    setNote("");

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageBlob(null);
    setImageUrl("");

    setToilet("OK");
    setSeats("OK");
    setKitchen("OK");
    setEntrance("OK");

    setEquipment("A");
    setInterior("A");
    setFlow("A");
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        const result = reader.result;
        const base64 = String(result).split(",")[1];
        resolve(base64);
      };

      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function makeFileName() {
    const typeText = checkType === "daily" ? "日次" : "週次";
    const dateText = makeDateText();
    const keyword = sanitizeFileText(extractKeyword(description || "写真"), 16);
    const store = sanitizeFileText(storeName || "店舗", 20);
    return `${typeText}_${store}_${dateText}_${keyword}.jpg`;
  }

  function makeDateText() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
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

  function sanitizeFileText(text, maxLength = 40) {
    return String(text || "")
      .replace(/[\s　]+/g, "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/[。、，,.]/g, "")
      .slice(0, maxLength);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>店舗チェック</h1>
          <p style={styles.subtitle}>日次・週次チェック / 修繕管理連携</p>
        </header>

        <section style={styles.statusCard}>
          <div>
            <div style={styles.statusLabel}>本日</div>
            <div style={styles.statusDate}>{todayText}</div>
          </div>
          <button
            type="button"
            style={styles.refreshButton}
            onClick={loadSettings}
            disabled={isSettingsLoading || isSending}
          >
            <RefreshCw size={18} />
            更新
          </button>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionTitle}>1. チェック種別</div>
          <div style={styles.segment}>
            <button
              type="button"
              style={checkType === "daily" ? styles.segmentActive : styles.segmentButton}
              onClick={() => handleCheckTypeChange("daily")}
              disabled={isSending}
            >
              日次
            </button>
            <button
              type="button"
              style={checkType === "weekly" ? styles.segmentActive : styles.segmentButton}
              onClick={() => handleCheckTypeChange("weekly")}
              disabled={isSending}
            >
              週次
            </button>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionTitle}>2. 店舗情報</div>

          <label style={styles.label}>業態</label>
          <select
            value={businessType}
            onChange={(e) => {
              setBusinessType(e.target.value);
              setArea("");
              setStoreName("");
            }}
            style={styles.select}
            disabled={isSending}
          >
            <option value="">選択してください</option>
            {businessTypeOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>

          <label style={styles.label}>エリア</label>
          <select
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              setStoreName("");
            }}
            style={styles.select}
            disabled={isSending || !businessType}
          >
            <option value="">選択してください</option>
            {areaOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>

          <label style={styles.label}>店舗名</label>
          <select
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            style={styles.select}
            disabled={isSending || !businessType || !area}
          >
            <option value="">選択してください</option>
            {storeOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>

          <label style={styles.label}>担当者</label>
          <input
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            placeholder="例：柴田"
            style={styles.input}
            disabled={isSending}
          />
        </section>

        <section style={styles.card}>
          <div style={styles.sectionTitle}>3. チェック項目</div>

          {checkType === "daily" ? (
            <>
              <CheckRow label="トイレ" value={toilet} onChange={setToilet} options={dailyCheckOptions} disabled={isSending} />
              <CheckRow label="客席" value={seats} onChange={setSeats} options={dailyCheckOptions} disabled={isSending} />
              <CheckRow label="厨房" value={kitchen} onChange={setKitchen} options={dailyCheckOptions} disabled={isSending} />
              <CheckRow label="入口" value={entrance} onChange={setEntrance} options={dailyCheckOptions} disabled={isSending} />
            </>
          ) : (
            <>
              <CheckRow label="設備" value={equipment} onChange={setEquipment} options={weeklyGradeOptions} disabled={isSending} />
              <CheckRow label="内装" value={interior} onChange={setInterior} options={weeklyGradeOptions} disabled={isSending} />
              <CheckRow label="導線" value={flow} onChange={setFlow} options={weeklyGradeOptions} disabled={isSending} />
            </>
          )}
        </section>

        <section style={needsRepair ? styles.alertCard : styles.resultCard}>
          <div style={styles.resultGrid}>
            <div>
              <div style={styles.resultLabel}>総合評価</div>
              <div style={styles.resultValue}>{calculated.evaluation}</div>
            </div>
            <div>
              <div style={styles.resultLabel}>緊急度(自動)</div>
              <div style={styles.resultValue}>{calculated.urgency}</div>
            </div>
          </div>

          <div style={needsRepair ? styles.repairNotice : styles.normalNotice}>
            {needsRepair
              ? "この内容は修繕管理に登録されます。問題内容と写真が必須です。"
              : "修繕登録なし。チェック履歴には登録されます。"}
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionTitle}>4. 異常内容・写真</div>

          <label style={styles.label}>問題内容</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例：厨房排水口まわりに水漏れあり"
            style={styles.textarea}
            disabled={isSending}
          />

          <div style={styles.buttonRow}>
            {!isListening ? (
              <button
                type="button"
                style={styles.darkButton}
                onClick={startSpeechRecognition}
                disabled={isSending}
              >
                <Mic size={20} />
                音声入力
              </button>
            ) : (
              <button
                type="button"
                style={styles.dangerButton}
                onClick={stopSpeechRecognition}
              >
                <Square size={20} />
                停止
              </button>
            )}

            <button
              type="button"
              style={styles.lightButton}
              onClick={() => setDescription("")}
              disabled={isSending}
            >
              <RotateCcw size={20} />
              クリア
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageSelected}
            style={{ display: "none" }}
          />

          <div style={styles.imageBox}>
            {imageUrl ? (
              <img src={imageUrl} alt="店舗チェック" style={styles.image} />
            ) : (
              <div style={styles.placeholder}>
                {needsPhoto ? "写真が必須です" : "写真なしでも送信できます"}
              </div>
            )}
          </div>

          <div style={styles.buttonRow}>
            <button
              type="button"
              style={styles.darkButton}
              onClick={openCamera}
              disabled={isSending}
            >
              <Camera size={20} />
              写真を撮る
            </button>

            <button
              type="button"
              style={styles.lightButton}
              onClick={resetPhoto}
              disabled={isSending || !imageBlob}
            >
              <RotateCcw size={20} />
              写真リセット
            </button>
          </div>

          <label style={styles.label}>備考</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="任意"
            style={styles.smallTextarea}
            disabled={isSending}
          />
        </section>

        <button
          type="button"
          style={styles.sendButton}
          onClick={sendRecord}
          disabled={isSending}
        >
          {isSending ? <UploadCloud size={24} /> : <Send size={24} />}
          {isSending ? "送信中..." : "送信する"}
        </button>

        <section style={styles.card}>
          <div style={styles.statusTitle}>状態</div>
          <p style={styles.status}>{status}</p>
          {error && <p style={styles.error}>{error}</p>}
          {lastResult && (
            <div style={styles.success}>
              <CheckCircle2 size={20} />
              <span>
                送信完了：
                総合評価 {lastResult.evaluation} / 緊急度 {lastResult.urgency}
                {lastResult.repairNeeded ? " / 修繕登録あり" : " / 修繕登録なし"}
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CheckRow({ label, value, onChange, options, disabled }) {
  return (
    <div style={styles.checkRow}>
      <div style={styles.checkLabel}>{label}</div>
      <div style={styles.optionGroup}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            style={value === option ? styles.optionActive : styles.optionButton}
            onClick={() => onChange(option)}
            disabled={disabled}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function calculateDailyResult(values) {
  const checks = [values.toilet, values.seats, values.kitchen, values.entrance];
  const ngCount = checks.filter((v) => v === "NG").length;

  if (ngCount === 0) {
    return {
      evaluation: "S",
      urgency: "C",
      repairNeeded: false,
    };
  }

  if (ngCount === 1) {
    return {
      evaluation: "B",
      urgency: "B",
      repairNeeded: true,
    };
  }

  return {
    evaluation: "C",
    urgency: "S",
    repairNeeded: true,
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
    repairNeeded: grades.includes("C"),
  };
}

function formatDateTime(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f1f5f9",
    padding: 16,
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    color: "#0f172a",
  },
  container: {
    maxWidth: 460,
    margin: "0 auto",
  },
  header: {
    background: "white",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
  },
  subtitle: {
    margin: "6px 0 0",
    color: "#64748b",
  },
  statusCard: {
    background: "white",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  statusLabel: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: 700,
  },
  statusDate: {
    fontSize: 18,
    fontWeight: 800,
  },
  refreshButton: {
    height: 44,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "white",
    color: "#0f172a",
    padding: "0 14px",
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  card: {
    background: "white",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
  },
  sectionTitle: {
    fontWeight: 800,
    fontSize: 18,
    marginBottom: 12,
  },
  segment: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  segmentButton: {
    height: 54,
    borderRadius: 16,
    border: "1px solid #cbd5e1",
    background: "white",
    fontSize: 18,
    fontWeight: 800,
    color: "#334155",
  },
  segmentActive: {
    height: 54,
    borderRadius: 16,
    border: "none",
    background: "#0f172a",
    fontSize: 18,
    fontWeight: 800,
    color: "white",
  },
  label: {
    display: "block",
    fontWeight: 800,
    marginTop: 12,
    marginBottom: 8,
  },
  select: {
    width: "100%",
    height: 52,
    borderRadius: 16,
    border: "1px solid #cbd5e1",
    padding: "0 12px",
    fontSize: 17,
    background: "white",
    boxSizing: "border-box",
  },
  input: {
    width: "100%",
    height: 52,
    borderRadius: 16,
    border: "1px solid #cbd5e1",
    padding: "0 12px",
    fontSize: 17,
    boxSizing: "border-box",
  },
  checkRow: {
    display: "grid",
    gridTemplateColumns: "72px 1fr",
    gap: 10,
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid #e2e8f0",
  },
  checkLabel: {
    fontWeight: 800,
    fontSize: 17,
  },
  optionGroup: {
    display: "grid",
    gridAutoFlow: "column",
    gap: 8,
  },
  optionButton: {
    height: 48,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "white",
    fontSize: 17,
    fontWeight: 800,
    color: "#334155",
  },
  optionActive: {
    height: 48,
    borderRadius: 14,
    border: "none",
    background: "#0f172a",
    fontSize: 17,
    fontWeight: 800,
    color: "white",
  },
  resultCard: {
    background: "#ecfdf5",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
    border: "1px solid #bbf7d0",
  },
  alertCard: {
    background: "#fff7ed",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
    border: "1px solid #fed7aa",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  resultLabel: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: 800,
  },
  resultValue: {
    fontSize: 34,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  repairNotice: {
    marginTop: 10,
    color: "#9a3412",
    fontWeight: 800,
  },
  normalNotice: {
    marginTop: 10,
    color: "#166534",
    fontWeight: 800,
  },
  textarea: {
    width: "100%",
    minHeight: 120,
    borderRadius: 16,
    border: "1px solid #cbd5e1",
    padding: 12,
    fontSize: 16,
    boxSizing: "border-box",
  },
  smallTextarea: {
    width: "100%",
    minHeight: 80,
    borderRadius: 16,
    border: "1px solid #cbd5e1",
    padding: 12,
    fontSize: 16,
    boxSizing: "border-box",
  },
  buttonRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 12,
    marginBottom: 12,
  },
  darkButton: {
    height: 54,
    borderRadius: 16,
    border: "none",
    background: "#0f172a",
    color: "white",
    fontSize: 16,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dangerButton: {
    height: 54,
    borderRadius: 16,
    border: "none",
    background: "#dc2626",
    color: "white",
    fontSize: 16,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  lightButton: {
    height: 54,
    borderRadius: 16,
    border: "1px solid #cbd5e1",
    background: "white",
    color: "#334155",
    fontSize: 16,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  imageBox: {
    aspectRatio: "4 / 3",
    background: "#0f172a",
    borderRadius: 20,
    overflow: "hidden",
    marginTop: 14,
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  placeholder: {
    color: "white",
    opacity: 0.75,
    fontSize: 18,
    fontWeight: 800,
  },
  sendButton: {
    width: "100%",
    height: 72,
    borderRadius: 20,
    border: "none",
    background: "#0f172a",
    color: "white",
    fontSize: 22,
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
  },
  statusTitle: {
    fontWeight: 800,
  },
  status: {
    color: "#334155",
  },
  error: {
    background: "#fee2e2",
    color: "#991b1b",
    padding: 12,
    borderRadius: 12,
    fontWeight: 700,
  },
  success: {
    background: "#dcfce7",
    color: "#166534",
    padding: 12,
    borderRadius: 12,
    fontWeight: 800,
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
};

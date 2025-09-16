/* eslint-disable tailwindcss/classnames-order */
/* eslint-disable no-unused-vars */
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import React, { useEffect, useMemo, useState } from "react";
import GaugeChart from "react-gauge-chart";
import ExcelJS from "exceljs";
import useNodeRedWS from "../hooks/useNodeRedWS";

/* ============================================================================
   LOGOS / IMÁGENES desde /public/assets/
============================================================================ */
const LOGO_CANDIDATES = [
  "/assets/fcaqualink-logo.png",
  "/assets/84427232.png",
  "/assets/84427232 (1).png",
  "/assets/84427232.svg",
  "/assets/logo.png",
];

function loadImg(url) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = (process.env.PUBLIC_URL || "") + url;
  });
}

/** Devuelve { raw(base64 sin prefijo), dataUrl, w, h } o nulos si falla */
async function logoAsPNG() {
  for (const rel of LOGO_CANDIDATES) {
    try {
      const img = await loadImg(rel);
      const w = Math.max(1, img.naturalWidth || img.width || 256);
      const h = Math.max(1, img.naturalHeight || img.height || 256);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL("image/png");
      const raw = dataUrl.split(",")[1];
      return { raw, dataUrl, w, h };
    } catch {
      // probar siguiente
    }
  }
  return { raw: null, dataUrl: null, w: 0, h: 0 };
}

/* ============================================================================
   PALETA / MARCA
============================================================================ */
const BRAND = {
  blue: "FF1F4ED8",
  blueDark: "FF0B3FB3",
  gray100: "FFF3F4F6",
  gray50: "FFF9FAFB",
  text: "FF0F172A",
  note: "FF6B7280",
  good: "FF16A34A",
  warn: "FFCA8A04",
  bad: "FFDC2626",
};

/* ============================================================================
   MAPAS / CONSTANTES
============================================================================ */
const KEY_BY_NAME = {
  ORP: "orp",
  Conductividad: "conductividad",
  Turbidez: "turbidez",
  pH: "ph",
  Temperatura: "temperatura",
  TDS: "tds",
};

const NAME_TO_KEY = Object.fromEntries(
  Object.entries(KEY_BY_NAME).map(([k, v]) => [k.toLowerCase(), v]),
);

const PROPERTY_ID_TO_KEY = {
  1: "ph",
  2: "turbidez",
  3: "tds",
  4: "temperatura",
  5: "conductividad",
  6: "orp",
};

/* ============================================================================
   HELPERS NUMÉRICOS Y VISUALES
============================================================================ */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const toNumOrNull = (v) => {
  if (v === null || v === undefined) return null; // no convertir null→0
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const getMaxValue = (name) => {
  switch (name) {
    case "ORP":
      return 500;
    case "Conductividad":
      return 1000;
    case "Turbidez":
      return 10;
    case "pH":
      return 14;
    case "Temperatura":
      return 50;
    case "TDS":
      return 1000;
    default:
      return 100;
  }
};

const clampPercent = (name, value) => {
  if (!isNum(value)) return 0;
  const max = getMaxValue(name);
  const pct = value / (max || 1);
  return Math.max(0, Math.min(1, pct));
};

const formatValue = (name, value) => {
  if (!isNum(value)) return "—";
  const opts =
    name === "pH"
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 1 };
  return value.toLocaleString(undefined, opts);
};

/* ============================================================================
   REGLAS DE CALIDAD
============================================================================ */
function calcQuality(name, value) {
  if (!isNum(value)) return "Desconocida";
  const v = Number(value);

  switch (name) {
    case "pH":
      return v >= 6.5 && v <= 8.5 ? "Buena" : v >= 6.0 && v <= 9.0 ? "Regular" : "Mala";
    case "ORP":
      return v > 300 ? "Buena" : v >= 100 ? "Regular" : "Mala";
    case "Turbidez":
      return v < 1 ? "Buena" : v <= 5 ? "Regular" : "Mala";
    case "Conductividad":
      return v < 500 ? "Buena" : v <= 1000 ? "Regular" : "Mala";
    case "Temperatura":
      return v >= 15 && v <= 30
        ? "Buena"
        : (v >= 10 && v < 15) || (v > 30 && v <= 35)
          ? "Regular"
          : "Mala";
    case "TDS":
      return v < 500 ? "Buena" : v <= 1000 ? "Regular" : "Mala";
    default:
      return "Desconocida";
  }
}

/* ============================================================================
   HISTORIAL (localStorage)
============================================================================ */
const LS_KEY = "sensorHistoryV1";

function sensorsToRecord(array) {
  const rec = { ts: new Date().toISOString() };
  array.forEach((s) => {
    const key = KEY_BY_NAME[s.name];
    if (key) rec[key] = isNum(s.value) ? s.value : null;
  });
  return rec;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(hist) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(hist));
  } catch {}
}

function fmtDateTime(ts) {
  return new Date(ts).toLocaleString();
}

function sameDay(ts, yyyy_mm_dd) {
  const d = new Date(ts);
  const [y, m, day] = yyyy_mm_dd.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
}

function inRange(ts, startISO, endISO) {
  const t = new Date(ts).getTime();
  const a = startISO ? new Date(startISO).getTime() : -Infinity;
  const b = endISO ? new Date(`${endISO}T23:59:59.999`).getTime() : Infinity;
  return t >= a && t <= b;
}

function sameMonth(ts, yyyy_mm) {
  const d = new Date(ts);
  const [y, m] = yyyy_mm.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m;
}

/* ============================================================================
   BACKEND HELPERS (Node-RED)
============================================================================ */
function httpBaseFromWs(ws) {
  try {
    if (!ws) return null;
    const u = new URL(ws);
    const proto = u.protocol === "wss:" ? "https:" : "http:";
    return `${proto}//${u.hostname}:${u.port}`;
  } catch {
    return null;
  }
}

// "2025-08-27" -> "27/08/2025"
function isoToDMY(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ============================================================================
   DETECCIÓN DE “MOJADO” CON TTL
============================================================================ */
const WET_TTL_MS = 15000; // 15 s
const TURB_WET_MAX_NTU = 1200;
const TURB_VERY_DRY_NTU = 5000;

/* ============================================================================
   COMPONENTE
============================================================================ */
const DashboardSensors = () => {
  const [sensors, setSensors] = useState([
    { id: 1, name: "ORP", value: null, unit: "mV", quality: "Desconocida" },
    { id: 2, name: "Conductividad", value: null, unit: "µS/cm", quality: "Desconocida" },
    { id: 3, name: "Turbidez", value: null, unit: "NTU", quality: "Desconocida" },
    { id: 4, name: "pH", value: null, unit: "", quality: "Desconocida" },
    { id: 5, name: "Temperatura", value: null, unit: "°C", quality: "Desconocida" },
    { id: 6, name: "TDS", value: null, unit: "ppm", quality: "Desconocida" },
  ]);

  const { status, lastMessage, wsUrl } = useNodeRedWS();

  // pestañas: monitoreo / historial / dashboard
  const [view, setView] = useState("monitoreo");

  // historial
  const [history, setHistory] = useState(() => loadHistory());
  const todayISO = new Date().toISOString().slice(0, 10);
  const thisMonthISO = new Date().toISOString().slice(0, 7);
  const [mode, setMode] = useState("dia"); // 'dia' | 'rango' | 'mes'
  const [dayISO, setDayISO] = useState(todayISO);
  const [startISO, setStartISO] = useState(todayISO);
  const [endISO, setEndISO] = useState(todayISO);
  const [monthISO, setMonthISO] = useState(thisMonthISO);

  // historial remoto (para vista Historial)
  const [remoteHist, setRemoteHist] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(null);

  // TTL de "mojado"
  const [wetUntil, setWetUntil] = useState(0);

  // normalizador de payload entrante
  const normalizeIncoming = (raw) => {
    if (raw == null) return null;

    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {}
    }

    // 1) Uno por uno
    if (typeof raw === "object" && !Array.isArray(raw) && "value" in raw) {
      if (raw.name) {
        const k =
          NAME_TO_KEY[String(raw.name).toLowerCase()] || String(raw.name).toLowerCase();
        return { [k]: toNumOrNull(raw.value) };
      }
      if (raw.property_id != null || raw.propertyId != null) {
        const pid = Number(raw.property_id ?? raw.propertyId);
        const k = PROPERTY_ID_TO_KEY[pid];
        if (k) return { [k]: toNumOrNull(raw.value) };
      }
    }

    // 2) Objeto directo
    if (typeof raw === "object" && !Array.isArray(raw)) {
      const obj = { ...raw };
      if (obj.temp != null && obj.temperatura == null)
        obj.temperatura = toNumOrNull(obj.temp);
      if (obj.conduct != null && obj.conductividad == null)
        obj.conductividad = toNumOrNull(obj.conduct);
      return obj;
    }

    // 3) Array de objetos
    if (Array.isArray(raw) && raw.length && typeof raw[0] === "object") {
      const obj = {};
      for (const item of raw) {
        const label = item.name || item.Sensor || item.sensor || "";
        if (!label) continue;
        const key = NAME_TO_KEY[String(label).toLowerCase()];
        if (key) obj[key] = toNumOrNull(item.value ?? item.Valor ?? item.val);
      }
      return obj;
    }

    // 4) Array posicional según UI
    if (Array.isArray(raw) && raw.length === sensors.length) {
      const obj = {};
      sensors.forEach((s, i) => {
        const key = KEY_BY_NAME[s.name];
        if (key) obj[key] = toNumOrNull(raw[i]);
      });
      return obj;
    }

    return null;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // GATE "WET": sólo mostrar lecturas cuando está mojado (con TTL)
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lastMessage) return;
    const data = normalizeIncoming(lastMessage);
    if (!data) return;

    const now = Date.now();
    let wetNow = false;
    let dryNow = false;

    if (data.status === "wet") wetNow = true;
    if (data.status === "dry") dryNow = true;

    if (isNum(data.turbidez)) {
      if (data.turbidez < TURB_WET_MAX_NTU) wetNow = true;
      if (data.turbidez >= TURB_VERY_DRY_NTU) dryNow = true;
    }
    if (isNum(data.ph) && data.ph >= 3 && data.ph <= 10) wetNow = true;
    if (isNum(data.conductividad) && data.conductividad > 5) wetNow = true;
    if (isNum(data.tds) && data.tds > 5) wetNow = true;

    if (wetNow) setWetUntil(now + WET_TTL_MS);
    if (dryNow) setWetUntil(0);

    const looksWet = wetNow || (!dryNow && now < wetUntil);

    let nextArray = null;

    setSensors((prev) => {
      if (!looksWet) {
        nextArray = prev.map((s) => ({ ...s, value: null, quality: "Desconocida" }));
        return nextArray;
      }

      nextArray = prev.map((s) => {
        const key = KEY_BY_NAME[s.name];
        if (!key || !(key in data)) return s;

        const raw = data[key];
        if (raw == null) {
          return { ...s, value: null, quality: "Desconocida" };
        }
        const n = Number(raw);
        if (Number.isFinite(n)) {
          return { ...s, value: n, quality: calcQuality(s.name, n) };
        }
        return { ...s, value: null, quality: "Desconocida" };
      });

      return nextArray;
    });

    if (nextArray) {
      const rec = sensorsToRecord(nextArray);
      setHistory((prev) => {
        const next = [...prev, rec].slice(-10000);
        saveHistory(next);
        return next;
      });
    }
  }, [lastMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // historial remoto cuando entro a "historial"
  useEffect(() => {
    if (view !== "historial") return;

    const base = httpBaseFromWs(wsUrl);
    if (!base) return;

    const params = new URLSearchParams();
    if (mode === "dia") {
      params.set("fecha", isoToDMY(dayISO));
    } else if (mode === "rango") {
      params.set("inicio", isoToDMY(startISO));
      params.set("fin", isoToDMY(endISO));
    } else {
      const [y, m] = monthISO.split("-");
      params.set("mes", m);
      params.set("anio", y);
    }

    const url = `${base}/api/sensores/historial?${params.toString()}`;

    let cancel = false;
    (async () => {
      setRemoteLoading(true);
      setRemoteError(null);
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const norm = (Array.isArray(data) ? data : []).map((r) => ({
          ts: r.ts,
          ph: toNumOrNull(r.ph),
          turbidez: toNumOrNull(r.turbidez),
          tds: toNumOrNull(r.tds),
          temperatura: toNumOrNull(r.temperatura ?? r.temp),
          conductividad: toNumOrNull(r.conductividad ?? r.conduct),
          orp: toNumOrNull(r.orp),
        }));
        if (!cancel) setRemoteHist(norm);
      } catch (e) {
        if (!cancel) {
          setRemoteHist([]);
          setRemoteError(e.message);
        }
      } finally {
        if (!cancel) setRemoteLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [view, mode, dayISO, startISO, endISO, monthISO, wsUrl]);

  // historial filtrado (para la vista Historial)
  const filteredHistory = useMemo(() => {
    if (view === "historial" && remoteHist.length) return remoteHist;
    if (mode === "dia") return history.filter((r) => sameDay(r.ts, dayISO));
    if (mode === "rango") return history.filter((r) => inRange(r.ts, startISO, endISO));
    return history.filter((r) => sameMonth(r.ts, monthISO));
  }, [view, remoteHist, history, mode, dayISO, startISO, endISO, monthISO]);

  // resumen promedios (ignorando nulos)
  const avgOf = (arr, key) => {
    const xs = arr.map((r) => r?.[key]).filter(isNum);
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };

  const summary = useMemo(() => {
    if (!filteredHistory.length) return null;
    const keys = ["ph", "turbidez", "tds", "temperatura", "conductividad", "orp"];
    const avg = Object.fromEntries(keys.map((k) => [k, avgOf(filteredHistory, k)]));
    return { n: filteredHistory.length, avg };
  }, [filteredHistory]);

  /* ==========================================================================
     EXPORTACIONES (con logo y estilo)
  ========================================================================== */

  // Excel — Monitoreo
  const exportNowToExcel = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "FCAquaLink";
    wb.created = new Date();

    const ws = wb.addWorksheet("Sensores", {
      views: [{ state: "frozen", ySplit: 8 }],
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.5,
          right: 0.5,
          top: 0.6,
          bottom: 0.6,
          header: 0.3,
          footer: 0.3,
        },
      },
      properties: { defaultRowHeight: 18 },
    });

    // Logo
    const { raw: logoRaw, w: imgW, h: imgH } = await logoAsPNG();
    if (logoRaw && imgW && imgH) {
      const maxW = 240;
      const scale = Math.min(1, maxW / imgW);
      const W = Math.round(imgW * scale);
      const H = Math.round(imgH * scale);

      const imgId = wb.addImage({ base64: logoRaw, extension: "png" });
      ws.addImage(imgId, {
        tl: { col: 0.25, row: 0.25 },
        ext: { width: W, height: H },
        editAs: "oneCell",
      });
      ws.getRow(1).height = Math.max(ws.getRow(1).height || 18, Math.ceil(H / 1.3));
      ws.getRow(2).height = 6;
      ws.getRow(3).height = 6;
    }

    ws.getRow(4).height = 4;
    ["A4", "B4", "C4", "D4"].forEach((a1) => {
      ws.getCell(a1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BRAND.gray100 },
      };
    });

    ws.mergeCells("A5:D5");
    ws.getCell("A5").value = "REPORTE DE SENSORES – FCAquaLink";
    ws.getCell("A5").font = {
      name: "Calibri",
      size: 16,
      bold: true,
      color: { argb: BRAND.text },
    };
    ws.getCell("A5").alignment = { horizontal: "center" };

    ws.mergeCells("A6:D6");
    ws.getCell("A6").value = `Generado: ${new Date().toLocaleString()}`;
    ws.getCell("A6").font = {
      name: "Calibri",
      size: 10,
      italic: true,
      color: { argb: BRAND.note },
    };
    ws.getCell("A6").alignment = { horizontal: "center" };

    const headerRowIdx = 8;
    const header = ["Sensor", "Valor", "Unidad", "Calidad"];
    ws.getRow(headerRowIdx).values = header;
    ws.getRow(headerRowIdx).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(headerRowIdx).alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(headerRowIdx).height = 22;
    ["A", "B", "C", "D"].forEach((col) => {
      const cell = ws.getCell(`${col}${headerRowIdx}`);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
      cell.border = {
        top: { style: "thin", color: { argb: BRAND.blueDark } },
        left: { style: "thin", color: { argb: BRAND.blueDark } },
        bottom: { style: "thin", color: { argb: BRAND.blueDark } },
        right: { style: "thin", color: { argb: BRAND.blueDark } },
      };
    });

    const start = headerRowIdx + 1;
    sensors.forEach((s, i) => {
      const r = start + i;
      ws.getCell(`A${r}`).value = s.name;
      ws.getCell(`B${r}`).value = isNum(s.value) ? s.value : null; // vacío si null
      ws.getCell(`C${r}`).value = s.unit || "";
      ws.getCell(`D${r}`).value = s.quality || "";

      ws.getCell(`B${r}`).numFmt = s.name === "pH" ? "0.00" : "0.0";
      ["A", "B", "C", "D"].forEach((col) => {
        const cell = ws.getCell(`${col}${r}`);
        cell.border = {
          top: { style: "hair" },
          left: { style: "hair" },
          bottom: { style: "hair" },
          right: { style: "hair" },
        };
        cell.alignment = { vertical: "middle" };
        if (i % 2 === 1)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: BRAND.gray50 },
          };
      });

      const q = String(s.quality || "").toLowerCase();
      const color =
        q === "buena"
          ? BRAND.good
          : q === "regular"
            ? BRAND.warn
            : q === "mala"
              ? BRAND.bad
              : BRAND.text;
      ws.getCell(`D${r}`).font = { color: { argb: color }, bold: true };
    });

    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 14;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 16;

    ws.headerFooter.oddFooter = "&C FCAquaLink · Página &P de &N";

    const buf = await wb.xlsx.writeBuffer();
    saveAs(
      new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `datos_sensores_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  // Excel — Historial
  const exportHistoryToExcel = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "FCAquaLink";
    wb.created = new Date();

    const ws = wb.addWorksheet("Historial", {
      views: [{ state: "frozen", ySplit: 8 }],
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.5,
          right: 0.5,
          top: 0.6,
          bottom: 0.6,
          header: 0.3,
          footer: 0.3,
        },
      },
      properties: { defaultRowHeight: 18 },
    });

    const { raw: logoRaw, w: imgW, h: imgH } = await logoAsPNG();
    if (logoRaw && imgW && imgH) {
      const maxW = 240;
      const scale = Math.min(1, maxW / imgW);
      const W = Math.round(imgW * scale);
      const H = Math.round(imgH * scale);

      const imgId = wb.addImage({ base64: logoRaw, extension: "png" });
      ws.addImage(imgId, {
        tl: { col: 0.25, row: 0.25 },
        ext: { width: W, height: H },
        editAs: "oneCell",
      });
      ws.getRow(1).height = Math.max(ws.getRow(1).height || 18, Math.ceil(H / 1.3));
      ws.getRow(2).height = 6;
      ws.getRow(3).height = 6;
    }

    ws.getRow(4).height = 4;
    ["A4", "B4", "C4", "D4", "E4", "F4", "G4"].forEach((a1) => {
      ws.getCell(a1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BRAND.gray100 },
      };
    });

    ws.mergeCells("A5:G5");
    ws.getCell("A5").value = "HISTORIAL DE SENSORES – FCAquaLink";
    ws.getCell("A5").font = {
      name: "Calibri",
      size: 16,
      bold: true,
      color: { argb: BRAND.text },
    };
    ws.getCell("A5").alignment = { horizontal: "center" };

    ws.mergeCells("A6:G6");
    ws.getCell("A6").value = `Generado: ${new Date().toLocaleString()}`;
    ws.getCell("A6").font = {
      name: "Calibri",
      size: 10,
      italic: true,
      color: { argb: BRAND.note },
    };
    ws.getCell("A6").alignment = { horizontal: "center" };

    const headerRowIdx = 8;
    const header = [
      "Fecha/Hora",
      "pH",
      "Turbidez (NTU)",
      "TDS (ppm)",
      "Temp (°C)",
      "Conduct. (µS/cm)",
      "ORP (mV)",
    ];
    ws.getRow(headerRowIdx).values = header;
    ws.getRow(headerRowIdx).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(headerRowIdx).alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(headerRowIdx).height = 22;
    ["A", "B", "C", "D", "E", "F", "G"].forEach((col) => {
      const cell = ws.getCell(`${col}${headerRowIdx}`);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.blue } };
      cell.border = {
        top: { style: "thin", color: { argb: BRAND.blueDark } },
        left: { style: "thin", color: { argb: BRAND.blueDark } },
        bottom: { style: "thin", color: { argb: BRAND.blueDark } },
        right: { style: "thin", color: { argb: BRAND.blueDark } },
      };
    });

    const rows = filteredHistory.map((r) => ({
      ts: r.ts ? new Date(r.ts) : "",
      ph: isNum(r.ph) ? r.ph : null,
      turbidez: isNum(r.turbidez) ? r.turbidez : null,
      tds: isNum(r.tds) ? r.tds : null,
      temperatura: isNum(r.temperatura) ? r.temperatura : null,
      conductividad: isNum(r.conductividad) ? r.conductividad : null,
      orp: isNum(r.orp) ? r.orp : null,
    }));

    const start = headerRowIdx + 1;
    rows.forEach((row, i) => {
      const r = start + i;
      ws.getCell(`A${r}`).value = row.ts;
      ws.getCell(`B${r}`).value = row.ph;
      ws.getCell(`C${r}`).value = row.turbidez;
      ws.getCell(`D${r}`).value = row.tds;
      ws.getCell(`E${r}`).value = row.temperatura;
      ws.getCell(`F${r}`).value = row.conductividad;
      ws.getCell(`G${r}`).value = row.orp;

      ws.getCell(`A${r}`).numFmt = "dd/mm/yyyy hh:mm";
      ws.getCell(`B${r}`).numFmt = "0.00";
      ["C", "D", "E", "F", "G"].forEach(
        (col) => (ws.getCell(`${col}${r}`).numFmt = "0.0"),
      );

      ["A", "B", "C", "D", "E", "F", "G"].forEach((col) => {
        const cell = ws.getCell(`${col}${r}`);
        cell.border = {
          top: { style: "hair" },
          left: { style: "hair" },
          bottom: { style: "hair" },
          right: { style: "hair" },
        };
        cell.alignment = { vertical: "middle" };
        if (i % 2 === 1)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: BRAND.gray50 },
          };
      });
    });

    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 10;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 18;
    ws.getColumn(7).width = 12;

    ws.headerFooter.oddFooter = "&C FCAquaLink · Página &P de &N";

    const buf = await wb.xlsx.writeBuffer();
    saveAs(
      new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `historial_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  // PDF — Monitoreo
  const exportNowToPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, 120, "F");

    let y = 26;

    try {
      const { dataUrl, w: imgW, h: imgH } = await logoAsPNG();
      if (dataUrl && imgW && imgH) {
        const maxW = 120;
        const scale = Math.min(1, maxW / imgW);
        const W = imgW * scale;
        const H = imgH * scale;
        const x = (pageW - W) / 2;
        doc.addImage(dataUrl, "PNG", x, y, W, H);
        y += H + 12;
      }
    } catch {}

    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("Reporte de Calidad del Agua – FCAquaLink", pageW / 2, y, {
      align: "center",
    });
    y += 18;

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generado: ${new Date().toLocaleString()}`, pageW / 2, y, {
      align: "center",
    });
    y += 14;

    doc.setDrawColor(31, 78, 216);
    doc.setLineWidth(2);
    doc.line(36, y, pageW - 36, y);
    y += 18;

    autoTable(doc, {
      startY: y,
      head: [["Sensor", "Valor", "Unidad", "Calidad"]], // FIX: sin ] extra
      body: sensors.map((s) => [
        s.name,
        isNum(s.value) ? s.value : "",
        s.unit,
        s.quality,
      ]),
      theme: "grid",
      styles: {
        fontSize: 10,
        cellPadding: 6,
        lineColor: [230, 232, 240],
        lineWidth: 0.4,
      },
      headStyles: { fillColor: [31, 78, 216], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { top: 110, right: 36, bottom: 40, left: 36 },
      didDrawPage: () => {
        const w = doc.internal.pageSize.getWidth();
        const h = doc.internal.pageSize.getHeight();
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`FCAquaLink · Página ${doc.getNumberOfPages()}`, w / 2, h - 18, {
          align: "center",
        });
        doc.setTextColor(0);
      },
    });

    doc.save(`datos_sensores_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ---- PDF — Historial ----
  const historyFilterLabel = () => {
    if (mode === "dia") return `Filtro: Día ${dayISO}`;
    if (mode === "rango") return `Filtro: ${startISO} a ${endISO}`;
    return `Filtro: Mes ${monthISO}`;
  };

  const exportHistoryToPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, 120, "F");

    let y = 26;

    try {
      const { dataUrl, w: imgW, h: imgH } = await logoAsPNG();
      if (dataUrl && imgW && imgH) {
        const maxW = 120;
        const scale = Math.min(1, maxW / imgW);
        const W = imgW * scale;
        const H = imgH * scale;
        const x = (pageW - W) / 2;
        doc.addImage(dataUrl, "PNG", x, y, W, H);
        y += H + 12;
      }
    } catch {}

    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("Historial de Sensores – FCAquaLink", pageW / 2, y, { align: "center" });
    y += 18;

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(
      `${historyFilterLabel()}   ·   Generado: ${new Date().toLocaleString()}`,
      pageW / 2,
      y,
      { align: "center" },
    );
    y += 14;

    doc.setDrawColor(31, 78, 216);
    doc.setLineWidth(2);
    doc.line(36, y, pageW - 36, y);
    y += 18;

    const head = [
      [
        "Fecha/Hora",
        "pH",
        "Turbidez (NTU)",
        "TDS (ppm)",
        "Temp (°C)",
        "Conduct. (µS/cm)",
        "ORP (mV)",
      ],
    ];
    const body = filteredHistory.map((r) => [
      fmtDateTime(r.ts),
      isNum(r.ph) ? r.ph : "",
      isNum(r.turbidez) ? r.turbidez : "",
      isNum(r.tds) ? r.tds : "",
      isNum(r.temperatura) ? r.temperatura : "",
      isNum(r.conductividad) ? r.conductividad : "",
      isNum(r.orp) ? r.orp : "",
    ]);

    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5, lineColor: [230, 232, 240], lineWidth: 0.4 },
      headStyles: { fillColor: [31, 78, 216], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 0: { cellWidth: 128 } },
      margin: { top: 110, right: 36, bottom: 40, left: 36 },
      didDrawPage: () => {
        const w = doc.internal.pageSize.getWidth();
        const h = doc.internal.pageSize.getHeight();
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`FCAquaLink · Página ${doc.getNumberOfPages()}`, w / 2, h - 18, {
          align: "center",
        });
        doc.setTextColor(0);
      },
    });

    const sufijo =
      mode === "dia" ? dayISO : mode === "rango" ? `${startISO}_a_${endISO}` : monthISO;
    doc.save(`historial_${sufijo}.pdf`);
  };

  /* ==========================================================================
     === CÁLCULOS PARA LA VISTA "DASHBOARD" (promedios por día + gráficas) ===
  ========================================================================== */
  const [dashDay, setDashDay] = useState(todayISO);

  const dayRows = useMemo(
    () => history.filter((r) => sameDay(r.ts, dashDay)),
    [history, dashDay],
  );

  // promedio por sensor (valor, ignorando nulos) para el día
  const avgPerSensor = useMemo(() => {
    const ks = ["ph", "turbidez", "tds", "temperatura", "conductividad", "orp"];
    const res = {};
    ks.forEach((k) => {
      const xs = dayRows.map((r) => r[k]).filter(isNum);
      res[k] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    });
    return res;
  }, [dayRows]);

  // distribución de calidades (todas las lecturas del día)
  const qualityDist = useMemo(() => {
    let buena = 0,
      regular = 0,
      mala = 0,
      total = 0;
    const map = {
      ph: "pH",
      turbidez: "Turbidez",
      tds: "TDS",
      temperatura: "Temperatura",
      conductividad: "Conductividad",
      orp: "ORP",
    };
    dayRows.forEach((r) => {
      Object.entries(map).forEach(([k, name]) => {
        const v = r[k];
        if (!isNum(v)) return;
        total++;
        const q = calcQuality(name, v);
        if (q === "Buena") buena++;
        else if (q === "Regular") regular++;
        else if (q === "Mala") mala++;
      });
    });
    const pct = (x) => (total ? (x * 100) / total : 0);
    return {
      total,
      buena,
      regular,
      mala,
      pctBuena: pct(buena),
      pctRegular: pct(regular),
      pctMala: pct(mala),
    };
  }, [dayRows]);

  /* ====== Donut (conic-gradient) y Barras (SVG) ====== */
  function Donut({ parts = [], size = 220, thickness = 26, center = "" }) {
    const total = parts.reduce((a, p) => a + (p.value || 0), 0) || 1;
    let acc = 0;
    const stops = parts
      .map((p) => {
        const from = (acc / total) * 360;
        acc += p.value || 0;
        const to = (acc / total) * 360;
        return `${p.color} ${from}deg ${to}deg`;
      })
      .join(", ");
    return (
      <div
        className="relative mx-auto"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${stops})`,
          borderRadius: "50%",
        }}
      >
        <div
          className="absolute inset-0 m-auto flex items-center justify-center rounded-full bg-white text-center"
          style={{ width: size - thickness * 2, height: size - thickness * 2 }}
        >
          <div className="px-3 text-sm leading-tight text-gray-700">{center}</div>
        </div>
      </div>
    );
  }

  function Bars({ rows }) {
    const max = Math.max(1, ...rows.map((r) => (isNum(r.value) ? r.value : 0)));
    const barH = 24;
    const gap = 10;
    const w = 460;
    const left = 130;
    const usable = w - left - 16;
    const h = rows.length * (barH + gap);

    return (
      <svg width={w} height={h} role="img" aria-label="Promedio por sensor">
        {rows.map((r, i) => {
          const y = i * (barH + gap);
          const v = isNum(r.value) ? r.value : 0;
          const wVal = (v / max) * usable;
          return (
            <g key={r.label} transform={`translate(0, ${y})`}>
              <text x="0" y={barH - 8} className="fill-gray-700" style={{ fontSize: 12 }}>
                {r.label}
              </text>
              <rect
                x={left}
                y="0"
                width={usable}
                height={barH}
                rx="6"
                className="fill-gray-200"
              />
              <rect
                x={left}
                y="0"
                width={wVal}
                height={barH}
                rx="6"
                className="fill-blue-500"
              />
              <text
                x={left + usable}
                y={barH - 8}
                textAnchor="end"
                className="fill-gray-700"
                style={{ fontSize: 12 }}
              >
                {isNum(r.value) ? formatValue(r.label, r.value) : "—"}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  /* ========= NUEVO: TARJETAS POR SENSOR + PANEL INTERACTIVO (día/mes/año) ========== */

  const SENSOR_CARDS = [
    { key: "ph", title: "pH" },
    { key: "turbidez", title: "Turbidez (NTU)" },
    { key: "tds", title: "TDS (ppm)" },
    { key: "temperatura", title: "Temp (°C)" },
    { key: "conductividad", title: "Conduct. (µS/cm)" },
    { key: "orp", title: "ORP (mV)" },
  ];

  const [selSensor, setSelSensor] = useState("ph");
  const [aggMode, setAggMode] = useState("dia"); // 'dia' | 'mes' | 'anio'

  const lastNDays = (n) => {
    const arr = [];
    const base = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      arr.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    }
    return arr;
  };

  // agrega por bucket (YYYY-MM-DD / YYYY-MM / YYYY)
  function aggregate(historyArray, key, bucket) {
    const map = new Map(); // bucket -> {sum,count}
    historyArray.forEach((r) => {
      const d = new Date(r.ts);
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, "0");
      const day = d.getDate().toString().padStart(2, "0");
      let b = `${y}-${m}-${day}`;
      if (bucket === "mes") b = `${y}-${m}`;
      if (bucket === "anio") b = `${y}`;
      const v = r[key];
      if (!isNum(v)) return;
      const prev = map.get(b) || { sum: 0, n: 0 };
      prev.sum += v;
      prev.n += 1;
      map.set(b, prev);
    });

    // sort asc
    const labels = Array.from(map.keys()).sort();
    return labels.map((lab) => ({
      label: lab,
      value: map.get(lab).sum / map.get(lab).n,
    }));
  }

  // datos para sparklines (últimos 10 días por sensor)
  const sparkFor = (key) => {
    const days = lastNDays(10);
    const map = new Map(days.map((d) => [d, { sum: 0, n: 0 }]));
    history.forEach((r) => {
      const d = String(r.ts).slice(0, 10);
      if (!map.has(d)) return;
      const v = r[key];
      if (!isNum(v)) return;
      const obj = map.get(d);
      obj.sum += v;
      obj.n += 1;
    });
    return days.map((d) => ({
      label: d,
      value: map.get(d).n ? map.get(d).sum / map.get(d).n : null,
    }));
  };

  function Sparkline({ data }) {
    const w = 150;
    const h = 46;
    const pad = 6;
    const xs = data.map((d) => (isNum(d.value) ? d.value : null)).filter(isNum);
    const min = xs.length ? Math.min(...xs) : 0;
    const max = xs.length ? Math.max(...xs) : 1;
    const scaleX = (i) => pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1);
    const scaleY = (v) =>
      h - pad - ((v - min) / Math.max(0.0001, max - min)) * (h - pad * 2);

    const pts = data
      .map((d, i) => (isNum(d.value) ? `${scaleX(i)},${scaleY(d.value)}` : null))
      .filter(Boolean)
      .join(" ");

    return (
      <svg width={w} height={h} aria-hidden>
        <polyline points={pts} fill="none" stroke="white" strokeWidth="2" opacity="0.7" />
      </svg>
    );
  }

  function LineChart({ data, title }) {
    // simple linea+marcas
    const w = 760;
    const h = 280;
    const pad = 40;
    const xs = data.map((d) => d.value).filter(isNum);
    const min = xs.length ? Math.min(...xs) : 0;
    const max = xs.length ? Math.max(...xs) : 1;
    const scaleX = (i) => pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1);
    const scaleY = (v) =>
      h - pad - ((v - min) / Math.max(0.0001, max - min)) * (h - pad * 2);
    const points = data
      .map((d, i) => (isNum(d.value) ? `${scaleX(i)},${scaleY(d.value)}` : null))
      .filter(Boolean)
      .join(" ");

    return (
      <div>
        <div className="mb-2 text-sm text-gray-600">{title}</div>
        <svg
          width={w}
          height={h}
          role="img"
          aria-label={title}
          className="rounded border bg-white"
        >
          {/* ejes simples */}
          <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e7eb" />
          <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e5e7eb" />
          {/* línea */}
          <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="2" />
          {/* marcas */}
          {data.map((d, i) =>
            isNum(d.value) ? (
              <circle key={i} cx={scaleX(i)} cy={scaleY(d.value)} r="3" fill="#2563eb" />
            ) : null,
          )}
          {/* labels X (máximo 10 para que no se amontonen) */}
          {data.map((d, i) =>
            i % Math.ceil(data.length / 10) === 0 || i === data.length - 1 ? (
              <text
                key={`lx${i}`}
                x={scaleX(i)}
                y={h - pad + 12}
                textAnchor="middle"
                className="fill-gray-500"
                style={{ fontSize: 10 }}
              >
                {d.label}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    );
  }

  // datos agregados para el panel del sensor seleccionado
  const aggData = useMemo(() => {
    if (aggMode === "dia") return aggregate(history, selSensor, "dia").slice(-30); // últimos 30 días
    if (aggMode === "mes") return aggregate(history, selSensor, "mes").slice(-12); // últimos 12 meses
    return aggregate(history, selSensor, "anio").slice(-5); // últimos 5 años
  }, [history, selSensor, aggMode]);

  /* ==========================================================================
     UI
  ========================================================================== */
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-3 text-sm text-gray-600">
        WebSocket: <b>{status}</b> <span className="ml-2">({wsUrl})</span>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Sensores de Calidad de Agua</h2>

        {/* Pestañas */}
        <div className="inline-flex overflow-hidden rounded-md shadow-sm">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold ${
              view === "monitoreo"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-800"
            }`}
            onClick={() => setView("monitoreo")}
          >
            Monitoreo
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold ${
              view === "historial"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-800"
            }`}
            onClick={() => setView("historial")}
          >
            Historial
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold ${
              view === "dashboard"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-800"
            }`}
            onClick={() => setView("dashboard")}
          >
            Dashboard
          </button>
        </div>
      </div>

      {/* Botones según vista */}
      {view === "monitoreo" ? (
        <div className="mb-6 flex justify-end gap-4">
          <button
            onClick={exportNowToExcel}
            className="rounded bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
          >
            Exportar a Excel
          </button>
          <button
            onClick={exportNowToPDF}
            className="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
          >
            Exportar a PDF
          </button>
        </div>
      ) : view === "historial" ? (
        <div className="mb-6 flex items-center justify-end gap-3">
          {remoteLoading && (
            <span className="mr-2 text-sm text-gray-500">Cargando historial…</span>
          )}
          {remoteError && (
            <span className="mr-2 text-sm text-red-600">Error: {remoteError}</span>
          )}

          <button
            onClick={exportHistoryToExcel}
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!filteredHistory.length}
            title={
              !filteredHistory.length
                ? "No hay datos filtrados"
                : "Exportar historial filtrado (Excel)"
            }
          >
            Exportar Historial (Excel)
          </button>

          <button
            onClick={exportHistoryToPDF}
            className="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            disabled={!filteredHistory.length}
            title={
              !filteredHistory.length
                ? "No hay datos filtrados"
                : "Exportar historial filtrado (PDF)"
            }
          >
            Exportar Historial (PDF)
          </button>
        </div>
      ) : null}

      {/* ====== MONITOREO ====== */}
      {view === "monitoreo" && (
        <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sensors.map((sensor) => (
            <div
              key={sensor.id}
              className="rounded-lg bg-white p-6 shadow-lg transition-shadow hover:shadow-xl"
            >
              <h3 className="mb-4 text-xl font-semibold text-blue-600">{sensor.name}</h3>

              <div className="relative pt-8">
                <div
                  className={
                    "absolute -top-1 left-1/2 -translate-x-1/2 rounded-md bg-white/95 px-2 py-0.5 text-xs font-semibold shadow sm:text-sm " +
                    (sensor.quality === "Buena"
                      ? "text-green-600"
                      : sensor.quality === "Regular"
                        ? "text-yellow-600"
                        : "text-red-600")
                  }
                >
                  {formatValue(sensor.name, sensor.value)}{" "}
                  {isNum(sensor.value) ? sensor.unit : ""}
                </div>

                <GaugeChart
                  id={`gauge-${sensor.id}`}
                  nrOfLevels={20}
                  percent={clampPercent(sensor.name, sensor.value)}
                  colors={["#FF0000", "#FFBF00", "#00FF00"]}
                  arcWidth={0.3}
                  animate
                  hideText
                  style={{ width: "100%" }}
                />
              </div>

              <p className="mt-3">
                Calidad{" "}
                <span
                  className={`font-bold ${
                    sensor.quality === "Buena"
                      ? "text-green-600"
                      : sensor.quality === "Regular"
                        ? "text-yellow-600"
                        : "text-red-600"
                  }`}
                >
                  {sensor.quality}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ====== HISTORIAL ====== */}
      {view === "historial" && (
        <div className="rounded-lg bg-white p-6 shadow-lg">
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end">
            <div>
              <label htmlFor="modeSel" className="mb-1 block text-sm font-medium">
                Modo
              </label>
              <select
                id="modeSel"
                className="rounded border px-2 py-1"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="dia">Por día</option>
                <option value="rango">Por rango de fechas</option>
                <option value="mes">Por mes y año</option>
              </select>
            </div>

            {mode === "dia" && (
              <div>
                <label htmlFor="dayInp" className="mb-1 block text-sm font-medium">
                  Fecha
                </label>
                <input
                  id="dayInp"
                  type="date"
                  className="rounded border px-2 py-1"
                  value={dayISO}
                  onChange={(e) => setDayISO(e.target.value)}
                />
              </div>
            )}

            {mode === "rango" && (
              <>
                <div>
                  <label htmlFor="rangeStart" className="mb-1 block text-sm font-medium">
                    Desde
                  </label>
                  <input
                    id="rangeStart"
                    type="date"
                    className="rounded border px-2 py-1"
                    value={startISO}
                    onChange={(e) => setStartISO(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="rangeEnd" className="mb-1 block text-sm font-medium">
                    Hasta
                  </label>
                  <input
                    id="rangeEnd"
                    type="date"
                    className="rounded border px-2 py-1"
                    value={endISO}
                    onChange={(e) => setEndISO(e.target.value)}
                  />
                </div>
              </>
            )}

            {mode === "mes" && (
              <div>
                <label htmlFor="monthInp" className="mb-1 block text-sm font-medium">
                  Mes
                </label>
                <input
                  id="monthInp"
                  type="month"
                  className="rounded border px-2 py-1"
                  value={monthISO}
                  onChange={(e) => setMonthISO(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Resumen */}
          <div className="mb-2 text-sm text-gray-700">
            <span className="font-medium">Registros:</span> {filteredHistory.length}
            {summary && (
              <span className="ml-4">
                <span className="font-medium">Promedios</span> — pH:{" "}
                {formatValue("pH", summary.avg.ph)} {" | "}
                Turbidez: {formatValue("Turbidez", summary.avg.turbidez)} NTU {" | "}
                TDS: {formatValue("TDS", summary.avg.tds)} ppm {" | "}
                Temp: {formatValue("Temperatura", summary.avg.temperatura)} °C {" | "}
                Cond: {formatValue("Conductividad", summary.avg.conductividad)} µS/cm{" "}
                {" | "}
                ORP: {formatValue("ORP", summary.avg.orp)} mV
              </span>
            )}
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="px-3 py-2 text-left">Fecha/Hora</th>
                  <th className="px-3 py-2 text-right">pH</th>
                  <th className="px-3 py-2 text-right">Turbidez (NTU)</th>
                  <th className="px-3 py-2 text-right">TDS (ppm)</th>
                  <th className="px-3 py-2 text-right">Temp (°C)</th>
                  <th className="px-3 py-2 text-right">Conduct. (µS/cm)</th>
                  <th className="px-3 py-2 text-right">ORP (mV)</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((r, i) => (
                  <tr key={i} className={i % 2 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-3 py-2">{fmtDateTime(r.ts)}</td>
                    <td className="px-3 py-2 text-right">{isNum(r.ph) ? r.ph : ""}</td>
                    <td className="px-3 py-2 text-right">
                      {isNum(r.turbidez) ? r.turbidez : ""}
                    </td>
                    <td className="px-3 py-2 text-right">{isNum(r.tds) ? r.tds : ""}</td>
                    <td className="px-3 py-2 text-right">
                      {isNum(r.temperatura) ? r.temperatura : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isNum(r.conductividad) ? r.conductividad : ""}
                    </td>
                    <td className="px-3 py-2 text-right">{isNum(r.orp) ? r.orp : ""}</td>
                  </tr>
                ))}

                {!filteredHistory.length && (
                  <tr>
                    <td className="px-3 py-6 text-center text-gray-500" colSpan={7}>
                      No hay datos para el filtro seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ====== DASHBOARD (GRÁFICAS Y PROMEDIOS POR DÍA) ====== */}
      {view === "dashboard" && (
        <div className="rounded-lg bg-white p-6 shadow-lg">
          {/* Filtros del dashboard */}
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Dashboard (resumen del día)</h3>
              <p className="text-sm text-gray-600">
                Promedio por sensor y distribución de calidad para el día seleccionado.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Día</label>
              <input
                type="date"
                value={dashDay}
                onChange={(e) => setDashDay(e.target.value)}
                className="rounded border px-2 py-1"
              />
            </div>
          </div>

          {/* Tarjetas rápidas */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Lecturas (todas)</div>
              <div className="text-2xl font-semibold">{qualityDist.total}</div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Calidad Buena</div>
              <div className="text-2xl font-semibold text-green-600">
                {qualityDist.pctBuena.toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Calidad Mala</div>
              <div className="text-2xl font-semibold text-red-600">
                {qualityDist.pctMala.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Sección superior: Donut + Barras */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Donut distribución de calidad */}
            <div className="rounded-xl border p-6">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-lg font-semibold">Distribución por calidad</h4>
                <span className="text-sm text-gray-500">
                  {qualityDist.total} lecturas
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-center">
                <Donut
                  parts={[
                    { label: "Buena", value: qualityDist.buena, color: "#16A34A" },
                    { label: "Regular", value: qualityDist.regular, color: "#CA8A04" },
                    { label: "Mala", value: qualityDist.mala, color: "#DC2626" },
                  ]}
                  center={
                    <span>
                      <span className="block text-xs text-gray-500">Buena</span>
                      <span className="text-2xl font-semibold text-green-600">
                        {qualityDist.pctBuena.toFixed(1)}%
                      </span>
                    </span>
                  }
                />
                <div className="space-y-2">
                  {[
                    { name: "Buena", pct: qualityDist.pctBuena, color: "#16A34A" },
                    { name: "Regular", pct: qualityDist.pctRegular, color: "#CA8A04" },
                    { name: "Mala", pct: qualityDist.pctMala, color: "#DC2626" },
                  ].map((p) => (
                    <div key={p.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block size-3 rounded"
                          style={{ background: p.color }}
                        />
                        <span className="text-sm">{p.name}</span>
                      </div>
                      <span className="text-sm font-semibold">{p.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Barras con promedio por sensor */}
            <div className="rounded-xl border p-6">
              <div className="mb-4">
                <h4 className="text-lg font-semibold">Promedio por sensor (día)</h4>
              </div>
              <Bars
                rows={[
                  { label: "pH", value: avgPerSensor.ph },
                  { label: "Turbidez (NTU)", value: avgPerSensor.turbidez },
                  { label: "TDS (ppm)", value: avgPerSensor.tds },
                  { label: "Temp (°C)", value: avgPerSensor.temperatura },
                  { label: "Conduct. (µS/cm)", value: avgPerSensor.conductividad },
                  { label: "ORP (mV)", value: avgPerSensor.orp },
                ]}
              />
              <div className="mt-3 text-xs text-gray-500">
                Promedio calculado sobre lecturas válidas (ignora valores nulos).
              </div>
            </div>
          </div>

          {/* ---------- NUEVO: Tarjetas por sensor (clic) + panel de gráfica ---------- */}
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {SENSOR_CARDS.map((s) => {
              const spark = sparkFor(s.key);
              const avgToday = avgPerSensor[s.key];
              const active = selSensor === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSelSensor(s.key)}
                  className={
                    "group relative flex items-center justify-between rounded-xl px-4 py-3 text-left transition " +
                    (active ? "bg-blue-600 text-white" : "bg-teal-600 text-white")
                  }
                  title={`Ver gráfica de ${s.title}`}
                >
                  <div>
                    <div className="text-sm opacity-80">{s.title}</div>
                    <div className="text-2xl font-semibold">
                      {isNum(avgToday) ? formatValue(s.title, avgToday) : "—"}
                    </div>
                  </div>
                  <div className="opacity-80">
                    <Sparkline data={spark} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Panel de gráfica del sensor seleccionado */}
          <div className="mt-6 rounded-xl border p-6">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                Gráfica — {SENSOR_CARDS.find((x) => x.key === selSensor)?.title}
              </h4>
              <div className="inline-flex overflow-hidden rounded-md border">
                {["dia", "mes", "anio"].map((m) => (
                  <button
                    key={m}
                    className={`px-3 py-1 text-sm ${aggMode === m ? "bg-blue-600 text-white" : "bg-white text-gray-700"}`}
                    onClick={() => setAggMode(m)}
                  >
                    {m === "dia" ? "Por día" : m === "mes" ? "Por mes" : "Por año"}
                  </button>
                ))}
              </div>
            </div>
            <LineChart
              data={aggData}
              title={
                aggMode === "dia"
                  ? "Promedio diario (últimos 30 días)"
                  : aggMode === "mes"
                    ? "Promedio mensual (últimos 12 meses)"
                    : "Promedio anual (últimos 5 años)"
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardSensors;

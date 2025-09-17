/* eslint-disable tailwindcss/classnames-order */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GaugeChart from "react-gauge-chart";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "file-saver";
import useNodeRedWS from "../hooks/useNodeRedWS";

/* ============================================================================
   LOGO desde /public/assets/
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
    if (typeof window === "undefined") return reject(new Error("SSR"));
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

// Orden fijo para interpretar arreglos numéricos entrantes sin depender de `sensors`
const SENSOR_NAMES_IN_ORDER = [
  "ORP",
  "Conductividad",
  "Turbidez",
  "pH",
  "Temperatura",
  "TDS",
];

/* ============================================================================
   HELPERS NUMÉRICOS Y VISUALES
============================================================================ */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const toNumOrNull = (v) => {
  if (v === null || v === undefined) return null;
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
  } catch {
    // ignore
  }
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

function isoToDMY(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ============================================================================
   DETECCIÓN DE “MOJADO” CON TTL + Anti-parpadeo
============================================================================ */
const WET_TTL_MS = 15000; // 15 s pegados a “mojado”
const TURB_WET_MAX_NTU = 1200;

// Anti-parpadeo por sensor
const EPS = {
  ph: 0.02,
  turbidez: 0.2,
  tds: 2,
  temperatura: 0.1,
  conductividad: 3,
  orp: 3,
};
// Suavizado EMA para la aguja
const ALPHA = 0.35;

/* ============================================================================
   MINI CHARTS (SVG) – sin dependencias
============================================================================ */
function Sparkline({ points, width = 120, height = 36 }) {
  if (!points || points.length < 2) {
    return <svg width={width} height={height} />;
  }
  const xs = points.map((p, i) => [i, p]);
  const ys = xs.map(([, y]) => y).filter((v) => Number.isFinite(v));
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const rng = max - min || 1;

  const path = xs
    .map(([i, y], idx) => {
      const x = (i / (xs.length - 1)) * (width - 8) + 4;
      const py = height - 6 - ((y - min) / rng) * (height - 12);
      return `${idx ? "L" : "M"}${x},${py}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.85" />
    </svg>
  );
}

function SimpleLineChart({ rows, keyName, width = 720, height = 260 }) {
  const data = rows
    .filter((r) => isNum(r[keyName]))
    .map((r) => ({ t: new Date(r.ts).getTime(), v: r[keyName] }));

  if (!data.length) return <div className="text-sm text-gray-500">Sin datos.</div>;

  const minX = Math.min(...data.map((d) => d.t));
  const maxX = Math.max(...data.map((d) => d.t));
  const minY = Math.min(...data.map((d) => d.v));
  const maxY = Math.max(...data.map((d) => d.v));
  const rngX = maxX - minX || 1;
  const rngY = maxY - minY || 1;

  const toX = (t) => 48 + ((t - minX) / rngX) * (width - 64);
  const toY = (v) => height - 36 - ((v - minY) / rngY) * (height - 64);

  const dAttr = data.map((d, i) => `${i ? "L" : "M"}${toX(d.t)},${toY(d.v)}`).join(" ");

  const ticks = 6;
  const yTicks = Array.from({ length: ticks }, (_, i) => minY + (i * rngY) / (ticks - 1));

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x="0" y="0" width={width} height={height} fill="white" />
      <line x1="48" y1={height - 36} x2={width - 16} y2={height - 36} stroke="#e5e7eb" />
      <line x1="48" y1="16" x2="48" y2={height - 36} stroke="#e5e7eb" />
      {yTicks.map((v, i) => {
        const y = toY(v);
        return (
          <g key={i}>
            <line x1="48" y1={y} x2={width - 16} y2={y} stroke="#f1f5f9" />
            <text x="44" y={y} fontSize="11" fill="#64748b" textAnchor="end" dy="3">
              {v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </text>
          </g>
        );
      })}
      <path d={dAttr} fill="none" stroke="#2563eb" strokeWidth="2" />
    </svg>
  );
}

/* ============================================================================
   Donut gauge (SVG puro) para el detalle
============================================================================ */
function DonutGauge({ label, value, max, fmt = (v) => v }) {
  const size = 220;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const center = size / 2;
  const pct =
    isNum(value) && isNum(max) && max > 0
      ? Math.max(0, Math.min(100, (value / max) * 100))
      : 0;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  const q = calcQuality(label === "pH" ? "pH" : label.replace(/ \(.*\)/, ""), value);
  const color = q === "Buena" ? "#16A34A" : q === "Regular" ? "#CA8A04" : "#DC2626";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth={stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`}
        transform={`rotate(-90 ${center} ${center})`}
        strokeLinecap="round"
      />
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="18"
        fill="#334155"
      >
        {label}
      </text>
      <text
        x={center}
        y={center + 22}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="20"
        fontWeight="700"
        fill={color}
      >
        {isNum(value) ? fmt(value) : "—"}
      </text>
      <text x={center} y={center + 48} textAnchor="middle" fontSize="12" fill="#64748b">
        {q}
      </text>
    </svg>
  );
}

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

  // pestañas
  const [view, setView] = useState("dashboard"); // monitoreo | historial | dashboard

  // historial local y filtros
  const [history, setHistory] = useState(() => loadHistory());
  const todayISO = new Date().toISOString().slice(0, 10);
  const thisMonthISO = new Date().toISOString().slice(0, 7);

  const [mode, setMode] = useState("dia"); // 'dia' | 'rango' | 'mes' | 'anio'
  const [dayISO, setDayISO] = useState(todayISO);
  const [startISO, setStartISO] = useState(todayISO);
  const [endISO, setEndISO] = useState(todayISO);
  const [monthISO, setMonthISO] = useState(thisMonthISO);
  const [year, setYear] = useState(new Date().getFullYear().toString());

  // historial remoto
  const [remoteHist, setRemoteHist] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(null);

  // TTL de "mojado"
  const wetUntilRef = useRef(0);

  // normalizador de payload entrante — **sin deps** (evita bucle)
  const normalizeIncoming = useCallback((raw) => {
    if (raw == null) return null;

    if (typeof raw === "string") {
      try {
        // eslint-disable-next-line no-param-reassign
        raw = JSON.parse(raw);
      } catch {
        // ignore
      }
    }

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

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const obj = { ...raw };
      if (obj.temp != null && obj.temperatura == null)
        obj.temperatura = toNumOrNull(obj.temp);
      if (obj.conduct != null && obj.conductividad == null)
        obj.conductividad = toNumOrNull(obj.conduct);
      return obj;
    }

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

    // Arreglo numérico en el orden fijo de sensores
    if (Array.isArray(raw) && raw.length === SENSOR_NAMES_IN_ORDER.length) {
      const obj = {};
      SENSOR_NAMES_IN_ORDER.forEach((name, i) => {
        const key = KEY_BY_NAME[name];
        if (key) obj[key] = toNumOrNull(raw[i]);
      });
      return obj;
    }

    return null;
  }, []); // <- vacío para no recircular

  /* ───────── Gate "WET" con TTL + anti-parpadeo ───────── */
  useEffect(() => {
    if (!lastMessage) return;
    const data = normalizeIncoming(lastMessage);
    if (!data) return;

    const now = Date.now();
    let wetNow = false;
    let dryNow = false;

    // Señales explícitas
    if (data.status === "wet") wetNow = true;
    if (data.status === "dry") dryNow = true;

    // Señales derivadas (si hay números plausibles, asumimos mojado)
    if (isNum(data.turbidez) && data.turbidez < TURB_WET_MAX_NTU) wetNow = true;
    if (isNum(data.ph) && data.ph >= 3 && data.ph <= 10) wetNow = true;
    if (isNum(data.conductividad) && data.conductividad > 5) wetNow = true;
    if (isNum(data.tds) && data.tds > 5) wetNow = true;
    if (isNum(data.temperatura) && data.temperatura > -10) wetNow = true;
    if (isNum(data.orp)) wetNow = true;

    if (wetNow) wetUntilRef.current = now + WET_TTL_MS;
    if (dryNow) wetUntilRef.current = 0;

    const looksWet = wetNow || (!dryNow && now < wetUntilRef.current);

    // Si está seco (sin TTL activo) → limpiar
    if (!looksWet) {
      setSensors((prev) =>
        prev.map((s) => ({ ...s, value: null, quality: "Desconocida" })),
      );
      return;
    }

    // Si está “mojado” → actualizar con suavizado y guardar historial
    setSensors((prev) => {
      const next = prev.map((s) => {
        const key = KEY_BY_NAME[s.name];
        if (!key || !(key in data)) return s;

        const raw = data[key];
        if (raw == null || !Number.isFinite(Number(raw))) return s;

        const incoming = Number(raw);

        // anti-parpadeo
        const eps = EPS[key] ?? 0;
        if (isNum(s.value) && Math.abs(incoming - s.value) < eps) {
          return s;
        }

        // suavizado EMA
        const smoothed = isNum(s.value)
          ? s.value + ALPHA * (incoming - s.value)
          : incoming;

        return {
          ...s,
          value: smoothed,
          quality: calcQuality(s.name, smoothed),
        };
      });

      // Guardar historial con valores *entrantes* (no suavizados)
      const rec = sensorsToRecord(
        prev.map((s) => {
          const key = KEY_BY_NAME[s.name];
          const v = key in data ? Number(data[key]) : s.value;
          return { ...s, value: Number.isFinite(v) ? v : null };
        }),
      );
      setHistory((h) => {
        const nx = [...h, rec].slice(-10000);
        saveHistory(nx);
        return nx;
      });

      return next;
    });
  }, [lastMessage, normalizeIncoming]); // lastMessage cambia → procesa; normalizeIncoming estable

  /* ───────── Historial remoto ───────── */
  useEffect(() => {
    if (view !== "historial" && view !== "dashboard") return;

    const base = httpBaseFromWs(wsUrl);
    if (!base) return;

    const params = new URLSearchParams();
    if (mode === "dia") {
      params.set("fecha", isoToDMY(dayISO));
    } else if (mode === "rango") {
      params.set("inicio", isoToDMY(startISO));
      params.set("fin", isoToDMY(endISO));
    } else if (mode === "mes") {
      const [y, m] = monthISO.split("-");
      params.set("mes", m);
      params.set("anio", y);
    } else if (mode === "anio") {
      params.set("anio", year);
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
  }, [view, mode, dayISO, startISO, endISO, monthISO, year, wsUrl]);

  /* ───────── Filtrado local ───────── */
  const filteredHistory = useMemo(() => {
    const base = view === "historial" || view === "dashboard" ? remoteHist : history;
    if (mode === "dia") return base.filter((r) => sameDay(r.ts, dayISO));
    if (mode === "rango") return base.filter((r) => inRange(r.ts, startISO, endISO));
    if (mode === "mes") return base.filter((r) => sameMonth(r.ts, monthISO));
    if (mode === "anio")
      return base.filter((r) => new Date(r.ts).getFullYear().toString() === year);
    return base;
  }, [view, remoteHist, history, mode, dayISO, startISO, endISO, monthISO, year]);

  const buildSeries = (key) =>
    filteredHistory.map((r) => (isNum(r[key]) ? r[key] : null)).filter((v) => v != null);

  const avgOf = (arr, key) => {
    const xs = arr.map((r) => r?.[key]).filter(isNum);
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };

  const summary = useMemo(() => {
    const n = filteredHistory.length;
    if (!n) return { n: 0, good: 0, bad: 0, avg: {} };
    const keys = ["ph", "turbidez", "tds", "temperatura", "conductividad", "orp"];
    const avg = Object.fromEntries(keys.map((k) => [k, avgOf(filteredHistory, k)]));
    let good = 0;
    let bad = 0;
    filteredHistory.forEach((r) => {
      const candidates = [
        ["pH", r.ph],
        ["Turbidez", r.turbidez],
        ["TDS", r.tds],
        ["Temperatura", r.temperatura],
        ["Conductividad", r.conductividad],
        ["ORP", r.orp],
      ];
      const first = candidates.find((c) => isNum(c[1]));
      if (!first) return;
      const q = calcQuality(first[0], first[1]);
      if (q === "Buena") good++;
      if (q === "Mala") bad++;
    });
    return { n, goodPct: (good / n) * 100, badPct: (bad / n) * 100, avg };
  }, [filteredHistory]);

  /* ============================================================================
     EXPORTACIONES (Excel/PDF)
  ============================================================================ */
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
      ws.getCell(`B${r}`).value = isNum(s.value) ? s.value : null;
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
        if (i % 2 === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: BRAND.gray50 },
          };
        }
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
        if (i % 2 === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: BRAND.gray50 },
          };
        }
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

  const historyFilterLabel = () => {
    if (mode === "dia") return `Filtro: Día ${dayISO}`;
    if (mode === "rango") return `Filtro: ${startISO} a ${endISO}`;
    if (mode === "mes") return `Filtro: Mes ${monthISO}`;
    return `Filtro: Año ${year}`;
  };

  const exportNowToPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

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
    } catch {
      // ignore
    }

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
      head: [["Sensor", "Valor", "Unidad", "Calidad"]],
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

  const exportHistoryToPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

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
    } catch {
      // ignore
    }

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
      {
        align: "center",
      },
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
      styles: {
        fontSize: 9,
        cellPadding: 5,
        lineColor: [230, 232, 240],
        lineWidth: 0.4,
      },
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
      mode === "dia"
        ? dayISO
        : mode === "rango"
          ? `${startISO}_a_${endISO}`
          : mode === "mes"
            ? monthISO
            : year;
    doc.save(`historial_${sufijo}.pdf`);
  };

  /* ============================================================================
     DASHBOARD – orden y selección
  ============================================================================ */
  const SENSOR_ORDER = [
    { key: "ph", label: "pH", unit: "" },
    { key: "turbidez", label: "Turbidez", unit: "NTU" },
    { key: "tds", label: "TDS", unit: "ppm" },
    { key: "temperatura", label: "Temp", unit: "°C" },
    { key: "conductividad", label: "Conduct.", unit: "µS/cm" },
    { key: "orp", label: "ORP", unit: "mV" },
  ];

  const latestOf = (key) => {
    for (let i = filteredHistory.length - 1; i >= 0; i--) {
      const v = filteredHistory[i]?.[key];
      if (isNum(v)) return v;
    }
    return null;
  };

  const [selectedSensor, setSelectedSensor] = useState("ph");

  const dayRecords = filteredHistory;

  const dayAvg = {
    ph: avgOf(dayRecords, "ph"),
    turbidez: avgOf(dayRecords, "turbidez"),
    tds: avgOf(dayRecords, "tds"),
    temperatura: avgOf(dayRecords, "temperatura"),
    conductividad: avgOf(dayRecords, "conductividad"),
    orp: avgOf(dayRecords, "orp"),
  };

  /* ============================================================================
     UI
  ============================================================================ */
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-3 text-sm text-gray-600">
        WebSocket: <b>{status}</b> <span className="ml-2">({wsUrl})</span>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Sensores de Calidad de Agua</h2>

        <div className="inline-flex overflow-hidden rounded-md shadow-sm">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold ${view === "monitoreo" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
            onClick={() => setView("monitoreo")}
          >
            Monitoreo
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold ${view === "historial" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
            onClick={() => setView("historial")}
          >
            Historial
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold ${view === "dashboard" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
            onClick={() => setView("dashboard")}
          >
            Dashboard
          </button>
        </div>
      </div>

      {/* ====== DASHBOARD ====== */}
      {view === "dashboard" && (
        <div className="space-y-6">
          {/* Filtros arriba */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <div>Día</div>
              <input
                type="date"
                className="rounded border px-2 py-1"
                value={dayISO}
                onChange={(e) => setDayISO(e.target.value)}
              />
              <div className="ml-4">
                <b>Lecturas (todas):</b> {dayRecords.length}
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Modo</label>
                <select
                  className="rounded border px-2 py-1"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="dia">Por día</option>
                  <option value="rango">Por rango</option>
                  <option value="mes">Por mes</option>
                  <option value="anio">Por año</option>
                </select>
              </div>

              {mode === "rango" && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Desde</label>
                    <input
                      type="date"
                      className="rounded border px-2 py-1"
                      value={startISO}
                      onChange={(e) => setStartISO(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Hasta</label>
                    <input
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
                  <label className="mb-1 block text-sm font-medium">Mes</label>
                  <input
                    type="month"
                    className="rounded border px-2 py-1"
                    value={monthISO}
                    onChange={(e) => setMonthISO(e.target.value)}
                  />
                </div>
              )}

              {mode === "anio" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Año</label>
                  <input
                    type="number"
                    min="2000"
                    className="w-28 rounded border px-2 py-1"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* RESUMEN SUPERIOR */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-md ring-1 ring-gray-200">
              <div className="text-sm text-gray-500">Lecturas (todas)</div>
              <div className="mt-2 text-3xl font-bold text-gray-800">
                {summary.n || 0}
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-md ring-1 ring-gray-200">
              <div className="text-sm text-gray-500">Calidad Buena</div>
              <div className="mt-2 text-3xl font-bold text-green-600">
                {(summary.goodPct || 0).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-md ring-1 ring-gray-200">
              <div className="text-sm text-gray-500">Calidad Mala</div>
              <div className="mt-2 text-3xl font-bold text-red-600">
                {(summary.badPct || 0).toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Distribución por calidad */}
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-200">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-lg font-semibold">Distribución por calidad</div>
                <div className="text-xs text-gray-500">{summary.n || 0} lecturas</div>
              </div>

              <div className="flex items-center gap-6">
                <div className="w-56">
                  <GaugeChart
                    id="quality-donut"
                    nrOfLevels={3}
                    percent={0}
                    colors={["#16A34A", "#CA8A04", "#DC2626"]}
                    arcsLength={[
                      (summary.goodPct || 0) / 100,
                      Math.max(
                        0,
                        1 - (summary.goodPct || 0) / 100 - (summary.badPct || 0) / 100,
                      ),
                      (summary.badPct || 0) / 100,
                    ]}
                    arcPadding={0.02}
                    arcWidth={0.25}
                    hideText
                    needleColor="transparent"
                    needleBaseColor="transparent"
                    style={{ width: "100%" }}
                  />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block rounded-full align-middle"
                      style={{ width: 12, height: 12, background: "#16A34A" }}
                    />
                    <span className="text-gray-700">Buena</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      {(summary.goodPct || 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block rounded-full align-middle"
                      style={{ width: 12, height: 12, background: "#CA8A04" }}
                    />
                    <span className="text-gray-700">Regular</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      {Math.max(
                        0,
                        100 - (summary.goodPct || 0) - (summary.badPct || 0),
                      ).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block rounded-full align-middle"
                      style={{ width: 12, height: 12, background: "#DC2626" }}
                    />
                    <span className="text-gray-700">Mala</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      {(summary.badPct || 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="pt-1 text-xs text-gray-500">
                    Promedio calculado sobre lecturas válidas (ignora nulos).
                  </div>
                </div>
              </div>
            </div>

            {/* Promedio por sensor (día) */}
            <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-200">
              <div className="mb-3 text-lg font-semibold">Promedio por sensor (día)</div>
              <div className="space-y-3">
                <BarRow
                  label="pH"
                  value={dayAvg.ph}
                  max={getMaxValue("pH")}
                  fmt={(v) => formatValue("pH", v)}
                />
                <BarRow
                  label="Turbidez (NTU)"
                  value={dayAvg.turbidez}
                  max={getMaxValue("Turbidez")}
                />
                <BarRow label="TDS (ppm)" value={dayAvg.tds} max={getMaxValue("TDS")} />
                <BarRow
                  label="Temp (°C)"
                  value={dayAvg.temperatura}
                  max={getMaxValue("Temperatura")}
                />
                <BarRow
                  label="Conduct. (µS/cm)"
                  value={dayAvg.conductividad}
                  max={getMaxValue("Conductividad")}
                />
                <BarRow label="ORP (mV)" value={dayAvg.orp} max={getMaxValue("ORP")} />
              </div>
              <div className="pt-1 text-xs text-gray-500">
                Promedio calculado sobre lecturas válidas (ignora valores nulos).
              </div>
            </div>
          </div>

          {/* Tarjetas KPI por sensor */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SENSOR_ORDER.map((s) => {
              const last = latestOf(s.key);
              const spark = buildSeries(s.key).slice(-24);
              const qName = s.label === "pH" ? "pH" : s.label.replace(/ \(.*\)/, "");
              const q = calcQuality(qName, last);
              const color =
                q === "Buena"
                  ? "text-green-600"
                  : q === "Regular"
                    ? "text-yellow-600"
                    : "text-red-600";
              const selected = selectedSensor === s.key;

              return (
                <button
                  key={s.key}
                  className={`group rounded-2xl bg-white p-5 text-left shadow-md ring-1 ring-gray-200 transition hover:shadow-lg ${selected ? "ring-2 ring-blue-600" : ""}`}
                  onClick={() => setSelectedSensor(s.key)}
                  title="Ver detalle"
                >
                  <div className="mb-1 text-sm text-gray-500">{s.label}</div>
                  <div className="flex items-end justify-between">
                    <div className={`text-3xl font-bold ${color}`}>
                      {isNum(last) ? formatValue(s.label, last) : "—"}{" "}
                      {isNum(last) ? s.unit : ""}
                    </div>
                    <div className="text-xs text-gray-400">últimas lecturas</div>
                  </div>
                  <div className="mt-2 text-gray-500">
                    <Sparkline points={spark} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalle del sensor seleccionado */}
          <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-200">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">
                Detalle —{" "}
                {SENSOR_ORDER.find((x) => x.key === selectedSensor)?.label ||
                  selectedSensor}
              </div>
              <div className="text-sm text-gray-600">
                Registros:{" "}
                <b>{filteredHistory.filter((r) => isNum(r[selectedSensor])).length}</b>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex items-center justify-center">
                {(() => {
                  const meta = SENSOR_ORDER.find((x) => x.key === selectedSensor);
                  const label = meta?.label || "";
                  const avg = avgOf(filteredHistory, selectedSensor);
                  return (
                    <DonutGauge
                      label={label}
                      value={avg}
                      max={getMaxValue(label.replace(/ \(.*\)/, ""))}
                      fmt={(v) => formatValue(label, v)}
                    />
                  );
                })()}
              </div>

              <div>
                <SimpleLineChart rows={filteredHistory} keyName={selectedSensor} />
                <div className="mt-2 text-xs text-gray-500">
                  Promedio (filtro actual):{" "}
                  <b>
                    {formatValue(
                      SENSOR_ORDER.find((x) => x.key === selectedSensor)?.label || "",
                      avgOf(filteredHistory, selectedSensor),
                    )}
                  </b>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== MONITOREO ====== */}
      {view === "monitoreo" && (
        <>
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

          <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sensors.map((sensor) => (
              <div
                key={sensor.id}
                className="rounded-lg bg-white p-6 shadow-lg transition-shadow hover:shadow-xl"
              >
                <h3 className="mb-4 text-xl font-semibold text-blue-600">
                  {sensor.name}
                </h3>

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
                    animate={false}
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
        </>
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
                <option value="anio">Por año</option>
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

            {mode === "anio" && (
              <div>
                <label htmlFor="yearInp" className="mb-1 block text-sm font-medium">
                  Año
                </label>
                <input
                  id="yearInp"
                  type="number"
                  min="2000"
                  className="w-28 rounded border px-2 py-1"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="mb-2 text-sm text-gray-700">
            <span className="font-medium">Registros:</span> {filteredHistory.length}
            {summary && (
              <span className="ml-4">
                <span className="font-medium">Promedios</span> — pH:{" "}
                {formatValue("pH", summary.avg?.ph)} | Turbidez:{" "}
                {formatValue("Turbidez", summary.avg?.turbidez)} NTU | TDS:{" "}
                {formatValue("TDS", summary.avg?.tds)} ppm | Temp:{" "}
                {formatValue("Temperatura", summary.avg?.temperatura)} °C | Cond:{" "}
                {formatValue("Conductividad", summary.avg?.conductividad)} µS/cm | ORP:{" "}
                {formatValue("ORP", summary.avg?.orp)} mV
              </span>
            )}
          </div>

          <div className="mb-4 flex items-center justify-end gap-3">
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
    </div>
  );
};

/* ============================================================================
   Row de barra
============================================================================ */
function BarRow({ label, value, max, fmt = (v) => (isNum(v) ? v.toFixed(1) : "—") }) {
  const pct =
    isNum(value) && isNum(max) && max > 0
      ? Math.max(0, Math.min(100, (value / max) * 100))
      : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">
          {isNum(value) ? fmt(value) : "—"}
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-200">
        <div className="h-3 rounded-full bg-gray-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default DashboardSensors;

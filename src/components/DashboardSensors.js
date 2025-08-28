/* eslint-disable tailwindcss/classnames-order */
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import React, { useEffect, useMemo, useState } from "react";
import GaugeChart from "react-gauge-chart";
import * as XLSX from "xlsx";
import useNodeRedWS from "../hooks/useNodeRedWS";

// === Mapa entre etiqueta visible y clave interna ===
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

// ------------------ Umbrales de calidad ------------------
function calcQuality(name, value) {
  if (value == null || Number.isNaN(Number(value))) return "Desconocida";
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

// ---------- helpers visuales ----------
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
  const max = getMaxValue(name);
  const pct = max > 0 ? Number(value) / max : 0;
  const safe = Number.isFinite(pct) ? pct : 0;
  return Math.max(0, Math.min(1, safe));
};

const formatValue = (name, value) => {
  const opts =
    name === "pH"
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 1 };
  return Number(value ?? 0).toLocaleString(undefined, opts);
};

// --------- helpers historial ----------
const LS_KEY = "sensorHistoryV1";

function sensorsToRecord(array) {
  const rec = { ts: new Date().toISOString() };
  array.forEach((s) => {
    const key = KEY_BY_NAME[s.name];
    if (key) rec[key] = Number(s.value ?? 0);
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

// === NUEVO: utilidades para pedir historial al backend ===
// de ws://raspberry-fredyhi.local:1880/ws/sensores -> http://raspberry-fredyhi.local:1880
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

// ------------------ Dashboard ------------------
const DashboardSensors = () => {
  const [sensors, setSensors] = useState([
    { id: 1, name: "ORP", value: 0, unit: "mV", quality: "Desconocida" },
    { id: 2, name: "Conductividad", value: 0, unit: "µS/cm", quality: "Desconocida" },
    { id: 3, name: "Turbidez", value: 0, unit: "NTU", quality: "Desconocida" },
    { id: 4, name: "pH", value: 0, unit: "", quality: "Desconocida" },
    { id: 5, name: "Temperatura", value: 0, unit: "°C", quality: "Desconocida" },
    { id: 6, name: "TDS", value: 0, unit: "ppm", quality: "Desconocida" },
  ]);

  const { status, lastMessage, wsUrl } = useNodeRedWS();

  // pestañas: monitoreo / historial
  const [view, setView] = useState("monitoreo");

  // ---------- historial ----------
  const [history, setHistory] = useState(() => loadHistory());
  const todayISO = new Date().toISOString().slice(0, 10);
  const thisMonthISO = new Date().toISOString().slice(0, 7);
  const [mode, setMode] = useState("dia"); // 'dia' | 'rango' | 'mes'
  const [dayISO, setDayISO] = useState(todayISO);
  const [startISO, setStartISO] = useState(todayISO);
  const [endISO, setEndISO] = useState(todayISO);
  const [monthISO, setMonthISO] = useState(thisMonthISO);

  // === NUEVO: estados de historial proveniente del backend ===
  const [remoteHist, setRemoteHist] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(null);

  // Normaliza cualquier payload entrante -> objeto { ph, orp, ... }
  const normalizeIncoming = (raw) => {
    if (raw == null) return null;

    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        // ignore
      }
    }

    // 1) Uno por uno
    if (typeof raw === "object" && !Array.isArray(raw) && "value" in raw) {
      if (raw.name) {
        const k =
          NAME_TO_KEY[String(raw.name).toLowerCase()] || String(raw.name).toLowerCase();
        return { [k]: Number(raw.value) };
      }
      if (raw.property_id != null || raw.propertyId != null) {
        const pid = Number(raw.property_id ?? raw.propertyId);
        const k = PROPERTY_ID_TO_KEY[pid];
        if (k) return { [k]: Number(raw.value) };
      }
    }

    // 2) Objeto directo → remapear keys comunes del backend (temp, conduct)
    if (typeof raw === "object" && !Array.isArray(raw)) {
      const obj = { ...raw };
      if (obj.temp != null && obj.temperatura == null) obj.temperatura = Number(obj.temp);
      if (obj.conduct != null && obj.conductividad == null)
        obj.conductividad = Number(obj.conduct);
      return obj;
    }

    // 3) Array de objetos
    if (Array.isArray(raw) && raw.length && typeof raw[0] === "object") {
      const obj = {};
      for (const item of raw) {
        const label = item.name || item.Sensor || item.sensor || "";
        if (!label) continue;
        const key = NAME_TO_KEY[String(label).toLowerCase()];
        if (key) obj[key] = Number(item.value ?? item.Valor ?? item.val ?? 0);
      }
      return obj;
    }

    // 4) Array posicional según UI
    if (Array.isArray(raw) && raw.length === sensors.length) {
      const obj = {};
      sensors.forEach((s, i) => {
        const key = KEY_BY_NAME[s.name];
        if (key) obj[key] = Number(raw[i]);
      });
      return obj;
    }

    return null;
  };

  // Cuando llega un mensaje, actualizamos gauges y registramos snapshot en historial local
  useEffect(() => {
    if (!lastMessage) return;
    const data = normalizeIncoming(lastMessage);
    if (!data) return;

    let nextArray = null;

    setSensors((prev) => {
      nextArray = prev.map((s) => {
        const key = KEY_BY_NAME[s.name];
        if (!key || !(key in data)) return s;
        const val = Number.isFinite(Number(data[key])) ? Number(data[key]) : 0;
        return { ...s, value: val, quality: calcQuality(s.name, val) };
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

  // === NUEVO: traer historial desde Node-RED cuando estoy en la vista "historial"
  useEffect(() => {
    if (view !== "historial") return;

    const base = httpBaseFromWs(wsUrl);
    if (!base) return;

    const params = new URLSearchParams();
    if (mode === "dia") {
      params.set("fecha", isoToDMY(dayISO)); // ?fecha=27/08/2025
    } else if (mode === "rango") {
      // Ajusta si tu flow usa otros nombres
      params.set("inicio", isoToDMY(startISO));
      params.set("fin", isoToDMY(endISO));
    } else {
      // "mes": ?mes=08&anio=2025
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
          ph: r.ph,
          turbidez: r.turbidez,
          tds: r.tds,
          temperatura: r.temperatura ?? r.temp,
          conductividad: r.conductividad ?? r.conduct,
          orp: r.orp,
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

  // Historial a mostrar: si hay del backend, úsalo; si no, usa localStorage
  const filteredHistory = useMemo(() => {
    if (view === "historial" && remoteHist.length) return remoteHist;
    if (mode === "dia") return history.filter((r) => sameDay(r.ts, dayISO));
    if (mode === "rango") return history.filter((r) => inRange(r.ts, startISO, endISO));
    return history.filter((r) => sameMonth(r.ts, monthISO));
  }, [view, remoteHist, history, mode, dayISO, startISO, endISO, monthISO]);

  // Resumen (promedio)
  const summary = useMemo(() => {
    if (!filteredHistory.length) return null;

    const keys = ["ph", "turbidez", "tds", "temperatura", "conductividad", "orp"];
    const acc = {};
    keys.forEach((k) => (acc[k] = 0));
    filteredHistory.forEach((r) => keys.forEach((k) => (acc[k] += Number(r[k] ?? 0))));
    const n = filteredHistory.length;
    const avg = {};
    keys.forEach((k) => (avg[k] = acc[k] / n));
    return { n, avg };
  }, [filteredHistory]);

  // Exportaciones
  const exportNowToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      sensors.map((s) => ({
        Sensor: s.name,
        Valor: s.value,
        Unidad: s.unit,
        Calidad: s.quality,
      })),
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sensores");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, `datos_sensores_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportNowToPDF = () => {
    const doc = new jsPDF();
    doc.text("Reporte de Calidad del Agua", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Sensor", "Valor", "Unidad", "Calidad"]],
      body: sensors.map((s) => [s.name, s.value, s.unit, s.quality]),
    });
    doc.save(`datos_sensores_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportHistoryToExcel = () => {
    const rows = filteredHistory.map((r) => ({
      FechaHora: fmtDateTime(r.ts),
      pH: r.ph,
      Turbidez: r.turbidez,
      TDS: r.tds,
      Temperatura: r.temperatura,
      Conductividad: r.conductividad,
      ORP: r.orp,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/octet-stream" });
    saveAs(blob, `historial_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

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
      ) : (
        <div className="mb-6 flex items-center justify-end gap-4">
          {remoteLoading && (
            <span className="text-sm text-gray-500">Cargando historial…</span>
          )}
          {remoteError && (
            <span className="text-sm text-red-600">Error: {remoteError}</span>
          )}
          <button
            onClick={exportHistoryToExcel}
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!filteredHistory.length}
            title={
              !filteredHistory.length
                ? "No hay datos filtrados"
                : "Exportar historial filtrado"
            }
          >
            Exportar Historial (Excel)
          </button>
        </div>
      )}

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
                  {formatValue(sensor.name, sensor.value)} {sensor.unit}
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
                {summary.avg.ph?.toFixed(2)} {" | "}Turbidez:{" "}
                {summary.avg.turbidez?.toFixed(2)} NTU {" | "}TDS:{" "}
                {summary.avg.tds?.toFixed(1)} ppm {" | "}Temp:{" "}
                {summary.avg.temperatura?.toFixed(1)} °C {" | "}Cond:{" "}
                {summary.avg.conductividad?.toFixed(1)} µS/cm {" | "}ORP:{" "}
                {summary.avg.orp?.toFixed(0)} mV
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
                    <td className="px-3 py-2 text-right">{r.ph}</td>
                    <td className="px-3 py-2 text-right">{r.turbidez}</td>
                    <td className="px-3 py-2 text-right">{r.tds}</td>
                    <td className="px-3 py-2 text-right">{r.temperatura}</td>
                    <td className="px-3 py-2 text-right">{r.conductividad}</td>
                    <td className="px-3 py-2 text-right">{r.orp}</td>
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

export default DashboardSensors;

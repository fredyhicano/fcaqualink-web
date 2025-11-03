/* eslint-disable tailwindcss/classnames-order */
import React, { useMemo } from "react";

/* ============================ helpers ============================ */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const last = (a) => (a && a.length ? a[a.length - 1] : null);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mean = (xs) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : 0);
const stdev = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
};

const SENSORS = [
  { key: "ph", label: "pH", unit: "" },
  { key: "turbidez", label: "Turbidez", unit: "NTU" },
  { key: "tds", label: "TDS", unit: "ppm" },
  { key: "temperatura", label: "Temperatura", unit: "°C" },
  { key: "conductividad", label: "Conductividad", unit: "µS/cm" },
  { key: "orp", label: "ORP", unit: "mV" },
];

/* Rangos operativos “suaves” (ajústalos a tu proceso) */
function inRangeSoft(name, v) {
  if (!isNum(v)) return false;
  switch (name) {
    case "pH":
      return v >= 6.5 && v <= 8.5;
    case "Turbidez":
      return v <= 4;
    case "TDS":
      return v <= 500;
    case "Temperatura":
      return v >= 0 && v <= 30;
    case "Conductividad":
      return v >= 50 && v <= 1500;
    case "ORP":
      return true;
    default:
      return true;
  }
}

function qualityLabel(name, v) {
  if (!isNum(v)) return "Sin datos";
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

/* tendencia (OLS) sobre últimas N lecturas */
function linearTrend(values, N = 48) {
  const ys = values.filter(isNum).slice(-N);
  const n = ys.length;
  if (n < 3) return { slope: 0, dir: "estable", z: 0 };
  const xs = Array.from({ length: n }, (_, i) => i + 1);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  const s = stdev(ys);
  const z = s ? (ys[n - 1] - my) / s : 0;
  const dir = Math.abs(slope) < 1e-6 ? "estable" : slope > 0 ? "alza" : "baja";
  return { slope, dir, z };
}

/* Holt 24h */
function holt(values, alpha = 0.5, beta = 0.2, steps = 24) {
  const ys = values.filter(isNum);
  if (ys.length < 3) return [];
  let l = ys[0];
  let b = ys[1] - ys[0];
  for (let t = 1; t < ys.length; t++) {
    const y = ys[t];
    const prevL = l;
    l = alpha * y + (1 - alpha) * (l + b);
    b = beta * (l - prevL) + (1 - beta) * b;
  }
  return Array.from({ length: steps }, (_, k) => l + (k + 1) * b);
}

/* SPC + EWMA + CUSUM (deriva/cambio) */
function spc(values) {
  const ys = values.filter(isNum).slice(-200);
  if (!ys.length) return { mu: 0, sigma: 0, z: 0, out: false };
  const mu = mean(ys);
  const sigma = stdev(ys);
  const z = sigma ? (last(ys) - mu) / sigma : 0;
  const out = last(ys) > mu + 3 * sigma || last(ys) < mu - 3 * sigma;
  return { mu, sigma, z, out };
}
function ewma(values, lambda = 0.3) {
  const ys = values.filter(isNum).slice(-200);
  if (!ys.length) return { s: 0, flag: false };
  let s = ys[0];
  for (let i = 1; i < ys.length; i++) s = lambda * ys[i] + (1 - lambda) * s;
  const flag = Math.abs(last(ys) - s) > stdev(ys);
  return { s, flag };
}
function cusum(values, k = 0.5, h = 5) {
  const ys = values.filter(isNum).slice(-200);
  if (ys.length < 2) return { pos: 0, neg: 0, flag: false };
  const mu = mean(ys);
  let cp = 0;
  let cn = 0;
  for (const y of ys) {
    cp = Math.max(0, cp + (y - mu - k));
    cn = Math.max(0, cn + (mu - y - k));
  }
  return { pos: cp, neg: cn, flag: cp > h || cn > h };
}

/* mini barras ui */
function MiniBars({ values, label, unit }) {
  const xs = (values || []).filter(isNum);
  if (!xs.length) return <div className="text-xs text-gray-500">Sin datos</div>;
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const rng = max - min || 1;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span>
          {xs[xs.length - 1].toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
          {unit}
        </span>
      </div>
      <div className="grid-cols-24 mt-1 grid gap-0.5">
        {xs.slice(-24).map((v, i) => {
          const h = 12 + ((v - min) / rng) * 28;
          return <div key={i} className="rounded bg-blue-500/70" style={{ height: h }} />;
        })}
      </div>
    </div>
  );
}

/* ========================= componente principal ========================= */
export default function AIInsights({ rows }) {
  const analysis = useMemo(() => {
    const byKey = {};
    SENSORS.forEach((s) => {
      byKey[s.key] = rows.map((r) => (isNum(r[s.key]) ? Number(r[s.key]) : null));
    });

    /* métricas por sensor */
    const meta = SENSORS.map((s) => {
      const values = byKey[s.key];
      const lastVal = last(values);
      const trend = linearTrend(values, 48);
      const ctrl = spc(values);
      const e = ewma(values);
      const c = cusum(values);

      /* cumplimiento % para la barra */
      const valid = values.filter(isNum);
      const ok = valid.filter((v) => inRangeSoft(s.label, v)).length;
      const compliance = valid.length ? Math.round((ok / valid.length) * 100) : 0;

      return {
        key: s.key,
        label: s.label,
        unit: s.unit,
        values,
        lastVal,
        trend,
        spc: ctrl,
        ewma: e,
        cusum: c,
        compliance,
        forecast: holt(values, 0.5, 0.2, 24),
      };
    });

    /* score global */
    let total = 0;
    let inSpec = 0;
    for (const m of meta) {
      for (const v of m.values) {
        if (!isNum(v)) continue;
        total++;
        if (inRangeSoft(m.label, v)) inSpec++;
      }
    }
    const score = total ? Math.round((inSpec / total) * 100) : 0;

    /* recomendaciones accionables priorizadas */
    const actions = [];
    const push = (title, why, impact, effort, confidence) => {
      actions.push({
        title,
        why,
        impact,
        effort,
        confidence,
        score: Math.round(100 * (impact / (effort || 1)) * confidence),
      });
    };

    for (const m of meta) {
      if (!m.values.length) continue;
      const q = qualityLabel(m.label, m.lastVal);
      const reasons = [];
      if (q === "Mala") reasons.push("fuera de rango de calidad");
      if (m.spc.out) reasons.push("fuera de control (μ±3σ)");
      if (m.ewma.flag) reasons.push("deriva EWMA");
      if (m.cusum.flag) reasons.push("cambio CUSUM");
      if (Math.abs(m.trend.z) >= 2)
        reasons.push(`desvío significativo (z=${m.trend.z.toFixed(1)})`);
      if (reasons.length) {
        const t = `Ajustar ${m.label} — actual ${
          isNum(m.lastVal) ? m.lastVal.toFixed(m.key === "ph" ? 2 : 1) : "—"
        } ${m.unit}. Tendencia ${m.trend.dir} (m=${m.trend.slope.toFixed(3)}).`;
        push(t, `Evidencia: ${reasons.join(", ")}.`, 4, 2, 0.85);
      }
    }

    /* playbook rápido para pH */
    const ph = meta.find((x) => x.key === "ph");
    if (ph && isNum(ph.lastVal) && (ph.lastVal < 6.5 || ph.lastVal > 8.5)) {
      push(
        ph.lastVal < 6.5
          ? "pH bajo: dosificar alcalinizante, revisar CO₂, validar alcalinidad."
          : "pH alto: aplicar corrector ácido y revisar balance alcalinidad/CO₂.",
        "Regla operativa de calidad (6.5–8.5).",
        5,
        2,
        0.9,
      );
    }

    actions.sort((a, b) => b.score - a.score);
    return { meta, score, actions };
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* resumen */}
      <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-200">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-sm text-gray-500">Puntuación General</div>
            <div className="mt-1 flex items-end gap-3">
              <div className="text-4xl font-bold">
                {analysis.score}
                <span className="ml-1 text-xl">%</span>
              </div>
              <div
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  analysis.score >= 85
                    ? "bg-green-100 text-green-700"
                    : analysis.score >= 60
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-red-100 text-red-700"
                }`}
              >
                {analysis.score >= 85
                  ? "Excelente"
                  : analysis.score >= 60
                    ? "Aceptable"
                    : "Crítico"}
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              % de lecturas dentro de rangos operativos (filtro actual).
            </div>
          </div>
          <div className="text-sm text-gray-600">
            Parámetros con datos:{" "}
            <b>{analysis.meta.filter((m) => m.values.some(isNum)).length}</b>
          </div>
        </div>
      </div>

      {/* tendencias + salud por parámetro */}
      <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-200">
        <div className="mb-3 text-lg font-semibold">Tendencias</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {analysis.meta.map((m) => {
            const state = !isNum(m.lastVal)
              ? "—"
              : inRangeSoft(m.label, m.lastVal)
                ? "OK"
                : "Fuera";
            const stateCls =
              state === "OK"
                ? "text-emerald-600"
                : state === "Fuera"
                  ? "text-red-600"
                  : "text-gray-500";
            const sig = Math.abs(m.trend.z) >= 2;

            return (
              <div
                key={m.key}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="font-medium text-gray-800">{m.label}</div>
                  <div className={`text-sm font-semibold ${stateCls}`}>{state}</div>
                </div>

                <div className="text-sm text-gray-600">
                  Último:{" "}
                  <b>
                    {isNum(m.lastVal) ? m.lastVal.toFixed(m.key === "ph" ? 2 : 1) : "—"}
                    {isNum(m.lastVal) ? ` ${m.unit}` : ""}
                  </b>
                </div>

                <div className="mt-1 text-xs text-gray-600">
                  Tendencia:{" "}
                  <b
                    className={
                      m.trend.dir === "alza"
                        ? "text-emerald-600"
                        : m.trend.dir === "baja"
                          ? "text-orange-700"
                          : "text-gray-700"
                    }
                  >
                    {m.trend.dir}
                  </b>{" "}
                  (m={m.trend.slope.toFixed(3)}){" "}
                  {sig ? (
                    <span className="font-semibold text-purple-700">• significativa</span>
                  ) : null}
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  SPC z={m.spc.z.toFixed(2)} {m.spc.out ? "• fuera de control" : "• ok"} ·
                  EWMA {m.ewma.flag ? "desvío" : "ok"} · CUSUM{" "}
                  {m.cusum.flag ? "cambio" : "ok"}
                </div>

                <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{ width: `${clamp(m.compliance, 0, 100)}%` }}
                    title={`Cumplimiento: ${m.compliance}%`}
                  />
                </div>

                <div className="mt-3">
                  <MiniBars values={m.forecast} label="Pronóstico 24h" unit={m.unit} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* recomendaciones accionables */}
      <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-gray-200">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-lg font-semibold">Recomendaciones operativas (IA)</div>
          <div className="text-xs text-gray-500">priorizadas por impacto/confianza</div>
        </div>
        <ul className="list-disc space-y-2 pl-6 text-gray-800">
          {analysis.actions.length ? (
            analysis.actions.slice(0, 8).map((a, i) => (
              <li key={i}>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs font-semibold text-blue-700">
                    score {a.score}
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  {a.why} · impacto {a.impact}/5 · esfuerzo {a.effort}/5 · confianza{" "}
                  {(a.confidence * 100).toFixed(0)}%
                </div>
              </li>
            ))
          ) : (
            <li className="text-gray-500">
              Sin hallazgos críticos. Mantén el monitoreo y el mantenimiento preventivo.
            </li>
          )}
        </ul>
        <div className="mt-3 text-xs text-gray-500">
          Derivado de tendencias (OLS), SPC (μ±3σ), EWMA, CUSUM y rangos operativos.
        </div>
      </div>
    </div>
  );
}

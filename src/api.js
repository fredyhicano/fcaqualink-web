// src/lib/api.js
export function getApiBase() {
  const host = process.env.REACT_APP_API_HOST || "raspberry-fredyhi.local";
  const port = process.env.REACT_APP_API_PORT || "1880";
  const https = typeof window !== "undefined" && window.location.protocol === "https:";
  const proto = https ? "https" : "http";
  return `${proto}://${host}:${port}`;
}

export async function fetchHistorial({ modo, fecha, mes, anio }) {
  const base = getApiBase();
  const params = new URLSearchParams();

  if (modo === "dia" || modo === "fecha") {
    // Ejemplo esperado por tu endpoint: "27/08/2025"
    params.set("fecha", fecha);
  } else if (modo === "mes") {
    params.set("mes", mes);
    params.set("anio", anio);
  }

  const url = `${base}/api/sensores/historial?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

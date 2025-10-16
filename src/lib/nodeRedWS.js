// src/lib/nodeRedWS.js
// URL del WebSocket (cámbiala por la IP/host de tu Node-RED)
// Puedes sobreescribir con REACT_APP_WS_URL en .env
export const WS_URL = process.env.REACT_APP_WS_URL || "ws://192.168.0.9:1880/ws/sensores"; // <-- AJUSTA TU IP/PUERTO

/**
 * Abre un WebSocket con reconexión exponencial.
 * onMessage: (msg | string) => void
 * onStatus: (status: 'connecting'|'open'|'closed'|'error') => void
 * Devuelve: () => void para cerrar.
 */
export function openSocket(onMessage, onStatus) {
  let ws = null;
  let closedByUser = false;
  let retry = 0;
  let retryTimer = null;

  const connect = () => {
    try {
      onStatus && onStatus("connecting");
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        retry = 0;
        onStatus && onStatus("open");
      };

      ws.onmessage = (ev) => {
        // Entregamos raw string y el JSON si parsea
        const raw = ev.data;
        try {
          const obj = JSON.parse(raw);
          onMessage && onMessage(obj);
        } catch {
          onMessage && onMessage(raw);
        }
      };

      ws.onerror = () => {
        onStatus && onStatus("error");
      };

      ws.onclose = () => {
        ws = null;
        if (closedByUser) {
          onStatus && onStatus("closed");
          return;
        }
        onStatus && onStatus("closed");
        const backoff = Math.min(10000, 1000 * Math.pow(2, retry++)); // 1s,2s,4s... máx 10s
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, backoff);
      };
    } catch {
      onStatus && onStatus("error");
    }
  };

  connect();

  return () => {
    closedByUser = true;
    clearTimeout(retryTimer);
    try {
      ws && ws.close();
    } catch {}
  };
}

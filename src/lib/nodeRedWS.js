// src/lib/nodeRedWS.js

// Construye la URL automáticamente según dónde se carga la web.
// Si existe REACT_APP_WS_URL, la usa como override.
const buildWsUrl = () => {
  const manual = (process.env.REACT_APP_WS_URL || "").trim();
  if (manual) return manual; // ej: ws://192.168.1.10:1880/ws/sensores

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const proto = isHttps ? "wss:" : "ws:";
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const port = process.env.REACT_APP_WS_PORT || 1880; // por defecto 1880
  const path = "/ws/sensores"; // tu endpoint en Node-RED

  return `${proto}//${host}:${port}${path}`;
};

export const WS_URL = buildWsUrl();

/**
 * Abre un WebSocket con reconexión exponencial.
 * @param {(data:any)=>void} onMessage callback cuando llega un mensaje
 * @param {(status:'connecting'|'open'|'closed'|'error')=>void} onStatus callback de estado
 * @returns {() => void} función para cerrar el socket manualmente
 */
export function openSocket(onMessage, onStatus) {
  let retry = 0;
  let ws;
  let closedByUser = false;

  const connect = () => {
    onStatus && onStatus("connecting");
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      retry = 0;
      onStatus && onStatus("open");
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        onMessage && onMessage(data);
      } catch {
        // si no es JSON, envíalo crudo
        onMessage && onMessage(ev.data);
      }
    };

    ws.onerror = () => {
      onStatus && onStatus("error");
    };

    ws.onclose = () => {
      onStatus && onStatus("closed");
      if (closedByUser) return;

      // backoff exponencial con tope
      retry = Math.min(retry + 1, 6); // 0..6
      const wait = 500 * Math.pow(2, retry); // 0.5s,1s,2s,4s,8s,16s
      setTimeout(connect, wait);
    };
  };

  connect();

  const api = {
    send(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
    },
    close() {
      closedByUser = true;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
      ) {
        ws.close();
      }
    },
  };

  // Devuelve cleanup
  return () => api.close();
}

// Export nombrado + default (evita "no-anonymous-default-export")
const nodeRedWS = { WS_URL, openSocket };
export default nodeRedWS;

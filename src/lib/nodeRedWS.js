// src/lib/nodeRedWS.js

// Construye la URL automáticamente según dónde se carga la web.
// Si existe REACT_APP_WS_URL, la usa como override.
const buildWsUrl = () => {
  const envUrl = process.env.REACT_APP_WS_URL?.trim();
  if (envUrl) return envUrl;

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname; // p.ej. 192.168.1.50
  const port = process.env.REACT_APP_WS_PORT || 1880; // por defecto 1880
  const path = "/ws/sensores"; // tu endpoint en Node-RED

  return `${proto}//${host}:${port}${path}`;
};

export const WS_URL = buildWsUrl();

/**
 * Abre un WebSocket con reconexión exponencial.
 * @param {function(object):void} onMessage callback cuando llega un mensaje
 * @param {function(string):void} onStatus  callback de estado: 'connecting'|'open'|'closed'|'error'
 * @returns {function():void} función para cerrar el socket manualmente
 */
export function openSocket(onMessage, onStatus) {
  let retry = 0;
  let ws;
  let closedByUser = false;

  const connect = () => {
    onStatus?.("connecting");
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      retry = 0;
      onStatus?.("open");
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        onMessage?.(data);
      } catch {
        // si no es JSON, envíalo crudo
        onMessage?.(ev.data);
      }
    };

    ws.onerror = () => {
      onStatus?.("error");
      // dejar que onclose maneje la reconexión
    };

    ws.onclose = () => {
      onStatus?.("closed");
      if (closedByUser) return;
      // backoff exponencial con tope
      retry = Math.min(retry + 1, 6); // 0..6
      const wait = 500 * Math.pow(2, retry); // 0.5s,1s,2s,4s,8s,16s
      setTimeout(connect, wait);
    };
  };

  connect();

  // API de control
  const api = {
    send: (msg) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const payload = typeof msg === "string" ? msg : JSON.stringify(msg);
        ws.send(payload);
      }
    },
    close: () => {
      closedByUser = true;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
      ) {
        ws.close();
      }
    },
  };

  // devolver función de limpieza
  return () => api.close();
}

export default { WS_URL, openSocket };

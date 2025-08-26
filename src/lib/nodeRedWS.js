export const getWSURL = () => {
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const proto = isHttps ? "wss" : "ws";
  const host = isHttps ? window.location.host : "raspberry-fredyhi.local:1880";
  return `${proto}://${host}/ws/sensores`;
};

export const WS_URL = getWSURL();

export function openSocket(onMessage, onStatus) {
  let stopped = false;
  let retry = 0;
  let kaTimer = null;
  let reconnectTimer = null;
  let ws = null;

  const setStatus = (s) => {
    if (onStatus) onStatus(s);
  };

  const connect = () => {
    setStatus("connecting");
    const url = getWSURL();
    ws = new WebSocket(url);

    ws.onopen = () => {
      retry = 0;
      setStatus("open");
      clearInterval(kaTimer);
      kaTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 30000);
    };

    ws.onmessage = (e) => {
      if (!onMessage) return;
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        onMessage(e.data);
      }
    };

    ws.onclose = (ev) => {
      clearInterval(kaTimer);
      setStatus("closed");
      if (stopped) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, retry++));
      reconnectTimer = setTimeout(connect, delay);
      console.warn("WS closed", ev.code, ev.reason, "retry in", delay, "ms");
    };

    ws.onerror = () => {
      setStatus("error");
      try {
        ws.close();
      } catch {}
    };
  };

  connect();

  return () => {
    stopped = true;
    clearInterval(kaTimer);
    clearTimeout(reconnectTimer);
    try {
      if (ws) ws.close();
    } catch {}
  };
}

import { useEffect, useRef, useState } from "react";

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

/**
 * Abre WebSocket probando varias URLs en paralelo.
 * Se queda con la primera que conecte, cierra el resto y se reconecta si cae.
 */
export default function useNodeRedWS() {
  const [status, setStatus] = useState("idle"); // idle | connecting | open | closed | error
  const [lastMessage, setLastMessage] = useState(null);
  const [wsUrl, setWsUrl] = useState(null);

  const socketsRef = useRef([]);
  const chosenRef = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    const envList = (process.env.REACT_APP_WS_URLS || "").split(",").map((s) => s.trim());

    // También intentamos con el hostname donde corre la web
    const autoHost = `ws://${window.location.hostname}:1880/ws/sensores`;

    const candidates = unique([autoHost, ...envList]);

    function cleanupAll() {
      socketsRef.current.forEach((s) => {
        try {
          s.onopen = s.onmessage = s.onerror = s.onclose = null;
          s.close();
        } catch {}
      });
      socketsRef.current = [];
    }

    function connectToAny() {
      cleanupAll();
      chosenRef.current = null;
      setStatus("connecting");

      candidates.forEach((url) => {
        try {
          const ws = new WebSocket(url);

          ws.onopen = () => {
            if (!chosenRef.current) {
              // Este es el primero que abrió: lo elegimos
              chosenRef.current = ws;
              setWsUrl(url);
              setStatus("open");

              // Cerramos los demás
              socketsRef.current.forEach((other) => {
                if (other !== ws) {
                  try {
                    other.onopen = other.onmessage = other.onerror = other.onclose = null;
                    other.close();
                  } catch {}
                }
              });
              socketsRef.current = [ws];
            } else {
              // Ya hay elegido: cerramos este extra
              try {
                ws.close();
              } catch {}
            }
          };

          ws.onmessage = (ev) => {
            if (chosenRef.current === ws) {
              let data = ev.data;
              try {
                data = JSON.parse(ev.data);
              } catch {}
              setLastMessage(data);
            }
          };

          ws.onerror = () => {
            // Si no era el elegido, ignoramos; si lo era, onclose hará el retry
          };

          ws.onclose = () => {
            if (chosenRef.current === ws) {
              setStatus("closed");
              chosenRef.current = null;
              clearTimeout(retryRef.current);
              retryRef.current = setTimeout(connectToAny, 1500);
            }
          };

          socketsRef.current.push(ws);
        } catch {
          // falló crear el socket para esta URL, seguimos con las demás
        }
      });
    }

    connectToAny();

    return () => {
      clearTimeout(retryRef.current);
      cleanupAll();
    };
  }, []);

  return { status, lastMessage, wsUrl };
}

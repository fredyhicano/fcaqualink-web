// src/hooks/useNodeRedWS.js
import { useEffect, useRef, useState } from "react";
import { openSocket, WS_URL } from "../lib/nodeRedWS";

export default function useNodeRedWS() {
  const [status, setStatus] = useState("idle"); // 'idle'|'connecting'|'open'|'closed'|'error'
  const [lastMessage, setLastMessage] = useState(null);
  const closeRef = useRef(null);

  useEffect(() => {
    // abre el socket y guarda la función de cierre
    closeRef.current = openSocket(
      (msg) => setLastMessage(msg),
      (st) => setStatus(st),
    );

    // cleanup al desmontar
    return () => {
      if (closeRef.current) closeRef.current();
    };
  }, []);

  // placeholder por si luego quieres enviar mensajes
  const send = () => {
    console.warn("send() no implementado en este hook (unidireccional).");
  };

  return { status, lastMessage, wsUrl: WS_URL, send };
}

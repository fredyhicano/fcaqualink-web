import React, { useState, useEffect } from 'react';
import GaugeChart from 'react-gauge-chart';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import useNodeRedWS from '../hooks/useNodeRedWS'; // <<--- usamos el hook

// Mapa entre etiqueta visible y clave interna
const KEY_BY_NAME = {
  ORP: 'orp',
  Conductividad: 'conduct',
  Turbidez: 'turbidez',
  pH: 'ph',
  Temperatura: 'temp',
  TDS: 'tds',
};

// ------------------ Umbrales de calidad (ajústalos si hace falta) ------------------
function calcQuality(name, value) {
  if (value == null || Number.isNaN(Number(value))) return 'Desconocida';
  const v = Number(value);

  switch (name) {
    case 'pH':
      if (v >= 6.5 && v <= 8.5) return 'Buena';
      if (v >= 6.0 && v <= 9.0) return 'Regular';
      return 'Mala';
    case 'ORP':
      if (v > 300) return 'Buena';
      if (v >= 100) return 'Regular';
      return 'Mala';
    case 'Turbidez':
      if (v < 1) return 'Buena';
      if (v <= 5) return 'Regular';
      return 'Mala';
    case 'Conductividad':
      if (v < 500) return 'Buena';
      if (v <= 1000) return 'Regular';
      return 'Mala';
    case 'Temperatura':
      if (v >= 15 && v <= 30) return 'Buena';
      if ((v >= 10 && v < 15) || (v > 30 && v <= 35)) return 'Regular';
      return 'Mala';
    case 'TDS':
      if (v < 500) return 'Buena';
      if (v <= 1000) return 'Regular';
      return 'Mala';
    default:
      return 'Desconocida';
  }
}

// ------------------ Dashboard ------------------
const DashboardSensors = () => {
  const [sensors, setSensors] = useState([
    { id: 1, name: 'ORP', value: 0, unit: 'mV', quality: 'Desconocida' },
    { id: 2, name: 'Conductividad', value: 0, unit: 'µS/cm', quality: 'Desconocida' },
    { id: 3, name: 'Turbidez', value: 0, unit: 'NTU', quality: 'Desconocida' },
    { id: 4, name: 'pH', value: 0, unit: '', quality: 'Desconocida' },
    { id: 5, name: 'Temperatura', value: 0, unit: '°C', quality: 'Desconocida' },
    { id: 6, name: 'TDS', value: 0, unit: 'ppm', quality: 'Desconocida' }
  ]);

  // ---------- WebSocket con hook ----------
  const { status, lastMessage, wsUrl } = useNodeRedWS();

  // Normaliza cualquier payload entrante -> objeto { ph, orp, ... }
  const normalizeIncoming = (raw) => {
    if (!raw) return null;

    // 1) Formato Node-RED normalizado (1 muestra)
    //    { ts, thingId, propertyId, name, value, unit }
    if (
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      ('propertyId' in raw) &&
      ('value' in raw)
    ) {
      const key = String(raw.propertyId).toLowerCase(); // ej. "ph"
      return { [key]: Number(raw.value) };
    }

    // 2) Objeto directo { ph, orp, ... }
    if (!Array.isArray(raw) && typeof raw === 'object') {
      return raw;
    }

    // 3) Array de objetos con name/value o Sensor/Valor
    if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object' && ('name' in raw[0] || 'Sensor' in raw[0])) {
      const obj = {};
      for (const item of raw) {
        const label = item.name || item.Sensor || item.sensor || '';
        const key = KEY_BY_NAME[label];
        if (key) obj[key] = Number(item.value ?? item.Valor ?? item.val ?? 0);
      }
      return obj;
    }

    // 4) Array posicional en el orden de UI
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

  // Cuando llega un mensaje, actualizamos el estado
  useEffect(() => {
    if (!lastMessage) return;
    const data = normalizeIncoming(lastMessage);
    if (!data) return;

    setSensors((prev) =>
      prev.map((s) => {
        const key = KEY_BY_NAME[s.name];
        if (!key) return s;

        const has = Object.prototype.hasOwnProperty.call(data, key);
        if (!has) return s;

        const nextVal = Number(data[key]);
        const nextQuality = calcQuality(s.name, nextVal);
        return { ...s, value: nextVal, quality: nextQuality };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage]);

  const getMaxValue = (name) => {
    switch (name) {
      case 'ORP': return 500;
      case 'Conductividad': return 1000;
      case 'Turbidez': return 10;
      case 'pH': return 14;
      case 'Temperatura': return 50;
      case 'TDS': return 1000;
      default: return 100;
    }
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      sensors.map(s => ({ Sensor: s.name, Valor: s.value, Unidad: s.unit, Calidad: s.quality }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sensores');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, `datos_sensores_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Reporte de Calidad del Agua', 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [['Sensor', 'Valor', 'Unidad', 'Calidad']],
      body: sensors.map(s => [s.name, s.value, s.unit, s.quality])
    });
    doc.save(`datos_sensores_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4 text-sm text-gray-600">
        WebSocket: <b>{status}</b> <span className="ml-2">({wsUrl})</span>
      </div>

      <h2 className="text-2xl font-bold mb-6 text-gray-800">Sensores de Calidad de Agua</h2>

      <div className="flex justify-end gap-4 mb-6">
        <button
          onClick={exportToExcel}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded"
        >
          Exportar a Excel
        </button>
        <button
          onClick={exportToPDF}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded"
        >
          Exportar a PDF
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sensors.map((sensor) => (
          <div key={sensor.id} className="bg-white shadow-lg rounded-lg p-6 hover:shadow-xl transition-shadow">
            <h3 className="text-xl font-semibold mb-4 text-blue-600">{sensor.name}</h3>

            <GaugeChart
              id={`gauge-${sensor.id}`}
              nrOfLevels={20}
              percent={Math.min(sensor.value / getMaxValue(sensor.name), 1)}
              colors={["#FF0000", "#FFBF00", "#00FF00"]}
              arcWidth={0.3}
              animate={true}
              hideText={true}
            />

            <p className="mt-4">
              Valor: <span className="font-bold">{sensor.value} {sensor.unit}</span>
            </p>
            <p>
              Calidad:{' '}
              <span
                className={`font-bold ${sensor.quality === 'Buena' ? 'text-green-600'
                    : sensor.quality === 'Regular' ? 'text-yellow-600'
                      : 'text-red-600'
                  }`}
              >
                {sensor.quality}
              </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardSensors;

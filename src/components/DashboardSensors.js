import React, { useState, useEffect } from 'react';
import GaugeChart from 'react-gauge-chart';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';

const DashboardSensors = () => {
  const [sensors, setSensors] = useState([
    { id: 1, name: 'ORP', value: 0, unit: 'mV', quality: 'Desconocida' },
    { id: 2, name: 'Conductividad', value: 0, unit: 'µS/cm', quality: 'Desconocida' },
    { id: 3, name: 'Turbidez', value: 0, unit: 'NTU', quality: 'Desconocida' },
    { id: 4, name: 'pH', value: 0, unit: '', quality: 'Desconocida' },
    { id: 5, name: 'Temperatura', value: 0, unit: '°C', quality: 'Desconocida' },
    { id: 6, name: 'TDS', value: 0, unit: 'ppm', quality: 'Desconocida' }
  ]);

  useEffect(() => {
    const fetchSensorData = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/sensores', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
          console.error(`Error HTTP: ${res.status}`);
          return;
        }

        const data = await res.json();
        if (Array.isArray(data) && data.length === sensors.length) {
          setSensors(data);
        }
      } catch (error) {
        console.error('Error al obtener datos de sensores:', error.message);
      }
    };

    fetchSensorData();
    const interval = setInterval(fetchSensorData, 5000);
    return () => clearInterval(interval);
  }, []);

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
    const worksheet = XLSX.utils.json_to_sheet(sensors.map(s => ({
      Sensor: s.name,
      Valor: `${s.value} ${s.unit}`,
      Calidad: s.quality
    })));
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
      body: sensors.map(s => [
        s.name,
        s.value,
        s.unit,
        s.quality
      ])
    });
    doc.save(`datos_sensores_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
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
              <span className={`font-bold ${sensor.quality === 'Buena'
                ? 'text-green-600'
                : sensor.quality === 'Regular'
                  ? 'text-yellow-600'
                  : 'text-red-600'
                }`}>
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

// ── Ensayo LOCAL con el script oficial del profesor ────────────────────────
// Copia de k6/script-oficial.js con un único cambio: la URL sale de la
// variable de entorno TARGET_URL (por defecto, nuestro nginx en :8080).
// La lógica (10 VUs, 1000 iteraciones, generadores, globalIndex, sleep) es
// idéntica a la oficial para que el ensayo sea representativo.
//
//   k6 run k6/script.js                                      → contra nginx local
//   k6 run -e TARGET_URL=https://.../prod/event-notification k6/script.js
import http from 'k6/http';
import { check, sleep } from 'k6' ;

export const options = {
  vus: 10,           // 10 usuarios virtuales
  iterations: 1000,  // Total de peticiones
  duration: '30s',   // Tiempo total
};

const TARGET_URL = __ENV.TARGET_URL ?? 'http://localhost:8080/events';

// Índice global para iteraciones (variable compartida entre VUs)
let globalIndex = 0;

// Bloque para incrementar el índice global de forma segura
function getGlobalIndex() {
  return globalIndex++;
}

// Generar placa de vehículo
function generateVehiclePlate() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  return `${letters.charAt(Math.floor(Math.random() * letters.length))}${letters.charAt(Math.floor(Math.random() * letters.length))}${letters.charAt(Math.floor(Math.random() * letters.length))}-${numbers.charAt(Math.floor(Math.random() * numbers.length))}${numbers.charAt(Math.floor(Math.random() * numbers.length))}${numbers.charAt(Math.floor(Math.random() * numbers.length))}`;
}

// Generar coordenadas
function generateCoordinates() {
  return {
    latitude: (Math.random() * 180 - 90).toFixed(6),
    longitude: (Math.random() * 360 - 180).toFixed(6),
  };
}

// Generar tipo de mensaje usando índice global calculado
function generateType(globalIndex) {
  return globalIndex < 999 ? 'Position' : 'Emergency';
}

// Función principal
export default function () {
  // Cálculo del índice global
  const globalIndex = (__VU - 1) * (options.iterations / options.vus) + __ITER;

  const payload = JSON.stringify({
    type: generateType(globalIndex),
    vehicle_plate: generateVehiclePlate(),
    coordinates: generateCoordinates(),
    status: 'OK',
  });

  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(TARGET_URL, payload, { headers });

  console.log(JSON.stringify({
    globalIndex,
    type: payload.type,
    timestamp: new Date().toISOString(),
    status: res.status,
    duration: res.timings.duration
  }));

  check(res, {
    'is status 200': (r) => r.status === 200,
  });

  sleep(0.1);
}

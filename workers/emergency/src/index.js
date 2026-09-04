// Worker del carril crítico — consume la cola "emergency", envía la alerta
// por Gmail SMTP (nodemailer con pool) y hace ack SOLO tras el envío exitoso.
// Error → requeue hasta 3 intentos (x-death) → DLQ. Nada muere en silencio.
import amqplib from 'amqplib';
import nodemailer from 'nodemailer';
import {
  assertTopology, log, connectWithRetry, MAX_ATTEMPTS,
} from '../shared/topology.js';

const AMQP_URL = process.env.AMQP_URL ?? 'amqp://guest:guest@localhost:5672';
const { GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_TO } = process.env;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !ALERT_TO) {
  log('CONFIG_FALTANTE', { detalle: 'GMAIL_USER / GMAIL_APP_PASSWORD / ALERT_TO en .env' });
  process.exit(1);
}

// ── Adaptador de salida: notificador SMTP con conexión persistente ──
const transporter = nodemailer.createTransport({
  pool: true,               // conexiones reutilizadas + reconexión automática
  maxConnections: 1,
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,            // STARTTLS
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

// ── Dominio: qué dice la alerta ──
function construirAlerta(event) {
  const placa = event.vehicle_plate ?? 'desconocida';
  const lat = event.coordinates?.latitude ?? '?';
  const lon = event.coordinates?.longitude ?? '?';
  return {
    from: `"Alerta Temprana Vehicular" <${GMAIL_USER}>`,
    to: ALERT_TO,
    subject: `🚨 EMERGENCIA — vehículo ${placa}`,
    text:
      `Se recibió un evento de tipo "Emergency".\n\n` +
      `Vehículo: ${placa}\n` +
      `Posición: lat ${lat}, lon ${lon}\n` +
      `Estado reportado: ${event.status ?? 'N/A'}\n` +
      `Hora de recepción del evento: ${event._recibido_ts}\n\n` +
      `Sistema de Alerta Temprana — Reto 2.`,
  };
}

const conn = await connectWithRetry(amqplib, AMQP_URL);
const channel = await conn.createChannel();
await assertTopology(channel);
await channel.prefetch(1);
log('WORKER_EMERGENCY_LISTO', {});

channel.consume('emergency', async (msg) => {
  if (!msg) return;
  const event = JSON.parse(msg.content.toString());
  log('EMERGENCY_CONSUMIDO', { placa: event.vehicle_plate ?? null, recibido_ts: event._recibido_ts });

  // 3 intentos con backoff; si todos fallan → DLQ vía DLX (nack requeue=false)
  for (let intento = 1; intento <= MAX_ATTEMPTS; intento++) {
    try {
      await transporter.sendMail(construirAlerta(event));

      // ── Log de rúbrica: envío exitoso del correo con hora exacta ──
      const enviadoTs = new Date().toISOString();
      log('CORREO_ENVIADO', {
        placa: event.vehicle_plate ?? null,
        destinatario: ALERT_TO,
        latencia_interna_ms: event._recibido_ts
          ? new Date(enviadoTs) - new Date(event._recibido_ts)
          : null,
      });
      channel.ack(msg);
      return;
    } catch (err) {
      log('CORREO_FALLIDO', { placa: event.vehicle_plate ?? null, intento, error: err.message });
      if (intento < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * intento));
    }
  }
  log('EMERGENCY_A_DLQ', { placa: event.vehicle_plate ?? null });
  channel.nack(msg, false, false); // → emergency.dlq (preservado, jamás perdido)
});

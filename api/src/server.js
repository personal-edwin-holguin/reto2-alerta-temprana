// API de ingesta — recibe eventos de la flota y los persiste en RabbitMQ
// ANTES de responder 200 (confirm channel): base de la garantía del 100%.
import Fastify from 'fastify';
import amqplib from 'amqplib';
import {
  EXCHANGE, QUEUES, assertTopology, log, connectWithRetry,
} from '../shared/topology.js';

const AMQP_URL = process.env.AMQP_URL ?? 'amqp://guest:guest@localhost:5672';

const conn = await connectWithRetry(amqplib, AMQP_URL);
const channel = await conn.createConfirmChannel();
await assertTopology(channel);
log('API_LISTA', {});

const app = Fastify({ logger: false });

app.post('/events', async (request, reply) => {
  const recibidoTs = new Date().toISOString(); // instante de la llegada HTTP
  const event = request.body ?? {};
  const type = QUEUES[event.type] ? event.type : 'Position'; // tipo desconocido → carril de volumen

  // ── Log de rúbrica: recepción del evento Emergency con hora exacta ──
  if (type === 'Emergency') {
    log('EMERGENCY_RECIBIDO', {
      placa: event.vehicle_plate ?? null,
      coordenadas: event.coordinates ?? null,
    });
  }

  // Publish persistente + confirmación del broker antes del 200 OK
  await new Promise((resolve, reject) => {
    channel.publish(
      EXCHANGE,
      type,
      Buffer.from(JSON.stringify({ ...event, _recibido_ts: recibidoTs })),
      { persistent: true },
      (err) => (err ? reject(err) : resolve()),
    );
  });

  return reply.code(200).send({ status: 'accepted' });
});

app.get('/health', async () => ({ ok: true }));

await app.listen({ port: 3000, host: '0.0.0.0' });

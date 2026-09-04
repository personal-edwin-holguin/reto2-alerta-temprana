// Worker del carril de volumen — consume la cola "position" y registra el evento.
import amqplib from 'amqplib';
import { assertTopology, log, connectWithRetry } from '../shared/topology.js';

const AMQP_URL = process.env.AMQP_URL ?? 'amqp://guest:guest@localhost:5672';

const conn = await connectWithRetry(amqplib, AMQP_URL);
const channel = await conn.createChannel();
await assertTopology(channel);
await channel.prefetch(10); // lotes: drena la ráfaga en segundos
log('WORKER_POSITION_LISTO', {});

channel.consume('position', (msg) => {
  if (!msg) return;
  try {
    const event = JSON.parse(msg.content.toString());
    log('POSITION_REGISTRADO', {
      placa: event.vehicle_plate ?? null,
      coordenadas: event.coordinates ?? null,
      estado: event.status ?? null,
      recibido_ts: event._recibido_ts,
    });
    channel.ack(msg);
  } catch (err) {
    log('POSITION_INVALIDO', { error: err.message });
    channel.nack(msg, false, false); // malformado → position.dlq
  }
});

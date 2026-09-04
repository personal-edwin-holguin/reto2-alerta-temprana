// Topología de RabbitMQ — declaración idempotente, compartida por API y workers.
// exchange "eventos" (direct) enruta por routing_key = type:
//   Emergency → cola "emergency"   |   Position → cola "position"
// Cada cola tiene DLX: tras 3 intentos fallidos el mensaje va a su DLQ (nada se pierde).

export const EXCHANGE = 'eventos';
export const DLX = 'eventos.dlx';
export const QUEUES = {
  Emergency: 'emergency',
  Position: 'position',
};
export const MAX_ATTEMPTS = 3;

export async function assertTopology(channel) {
  await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
  await channel.assertExchange(DLX, 'direct', { durable: true });

  for (const [type, queue] of Object.entries(QUEUES)) {
    await channel.assertQueue(queue, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': DLX, 'x-dead-letter-routing-key': type },
    });
    await channel.bindQueue(queue, EXCHANGE, type);

    await channel.assertQueue(`${queue}.dlq`, { durable: true });
    await channel.bindQueue(`${queue}.dlq`, DLX, type);
  }
}

export function log(evento, data = {}) {
  console.log(JSON.stringify({ evento, ts: new Date().toISOString(), ...data }));
}

export async function connectWithRetry(amqplib, url, tries = 30) {
  for (let i = 1; ; i++) {
    try {
      return await amqplib.connect(url);
    } catch (err) {
      if (i >= tries) throw err;
      log('AMQP_REINTENTO_CONEXION', { intento: i });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

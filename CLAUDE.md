# Reto 2 — Sistema de Alerta Temprana Vehicular

Contexto para Claude Code. Este proyecto implementa una arquitectura ya diseñada y cerrada
en sesión de diseño (proyecto "Arquitectura" en Claude). **No reabrir decisiones de
arquitectura sin preguntarle a Edwin** — cada una tiene justificación documentada abajo.

## Qué hace el sistema

Recibe eventos de una flota vehicular (`Position` / `Emergency`) vía HTTP, garantiza el
procesamiento del 100%, y ante un `Emergency` envía un correo a un Gmail configurado en
menos de 15 segundos, dejando logs con timestamp exacto de recepción y de envío.

Prueba de carga: script k6 con 1000 peticiones en 30s (~33 req/s). Restricciones del reto:
gateway limitado a 15 req/s (burst libre), máximo 10 instancias de procesamiento.

## Arquitectura (cerrada — no modificar sin consultar)

```
k6 → Nginx [×1] (limit_req 15r/s burst=1000 nodelay)
   → API Fastify [×2] (log EMERGENCY_RECIBIDO en llegada; publish persistente; 200 OK)
   → RabbitMQ [×1] exchange "eventos" (direct, routing_key = type)
       ├─ cola "emergency" durable +DLQ → worker-emergency [×2] → Gmail SMTP → log CORREO_ENVIADO
       └─ cola "position"  durable +DLQ → worker-position  [×4] → log JSON
```

Total: **exactamente 10 contenedores** (lectura estricta del límite: todos cuentan).
Estilo: arquitectura orientada a eventos con broker; atributo de calidad rector: **confiabilidad**.

## Decisiones clave y su porqué (resumen)

1. **Nginx `rate=15r/s burst=1000 nodelay`**: token bucket; burst absorbe la ráfaga completa
   de 1000 (cero 503), rate solo limita flujo sostenido. Sin `nodelay` la petición 1000
   esperaría ~66s dentro de nginx. NO cambiar estos valores.
2. **Publish persistente ANTES del 200 OK** (confirm channel): desde ese instante el evento
   no puede perderse aunque todo lo demás falle. Base de la garantía del 100%.
3. **Dos colas (carril rápido)**: una emergencia nunca hace fila detrás de positions.
4. **Réplicas 2/8 lógicas → aquí 2 emergency / 4 position** (+2 api) para cuadrar los 10
   contenedores totales. Los `deploy.replicas` del compose son la evidencia del límite.
5. **ack solo después del envío exitoso**; error → requeue hasta 3 intentos (header x-death),
   luego a la DLQ. Nada muere en silencio.
6. **nodemailer con `pool: true`**: conexión SMTP persistente con reconexión automática
   (~0.5s/envío). Credenciales SOLO por variables de entorno (.env, nunca commiteado).
7. **Logs JSON a stdout** (twelve-factor): la API loguea `EMERGENCY_RECIBIDO` en la llegada
   HTTP (recepción literal — requisito de rúbrica); el worker loguea `CORREO_ENVIADO` tras
   SMTP OK con la latencia calculada. El access log de nginx evidencia las 1000 entradas.
8. **Idempotencia**: entrega at-least-once ⇒ posible correo duplicado. Limitación conocida
   y documentada; NO implementar dedupe (decisión consciente de alcance).

## Comandos

```bash
cp .env.example .env        # y llenar GMAIL_USER / GMAIL_APP_PASSWORD / ALERT_TO
docker compose up --build -d
docker compose ps           # deben ser 10 contenedores
docker compose logs -f api worker-emergency   # logs de rúbrica en vivo
k6 run k6/script.js         # ensayo local (k6 instalado en el host: brew install k6)
docker compose logs > logs_ejecucion.txt      # entregable de logs
```

UI RabbitMQ: http://localhost:15672 (guest/guest). Endpoint: POST http://localhost:8080/events

## Payload del reto

```json
{ "type": "Position|Emergency", "vehicle_plate": "ABC-123",
  "coordinates": { "latitude": 12.345, "longitude": 67.890 }, "status": "OK" }
```

## Estilo de código

Node 22, ESM (`type: "module"`), sin TypeScript (alcance del reto), sin frameworks extra.
Lógica de dominio separada de adaptadores AMQP/SMTP (principio puertos-y-adaptadores en
versión mínima, sin ceremonial). Logs siempre JSON de una línea con campo `ts` ISO-8601.

## Pendientes

- [ ] Probar end-to-end con .env real y medir: último envío k6 → correo en bandeja (meta <15s)
- [ ] Ajustar k6/script.js cuando el profesor entregue el script oficial
- [ ] Documento técnico y presentación (se trabajan en la sesión de Cowork/proyecto Arquitectura)

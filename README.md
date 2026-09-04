# Reto 2 — Sistema de Alerta Temprana Vehicular

Arquitectura orientada a eventos en docker-compose (10 contenedores exactos):

```
k6 → Nginx (15 r/s, burst=1000 nodelay) → API Fastify ×2 → RabbitMQ
    ├─ cola emergency (+DLQ) → worker-emergency ×2 → Gmail SMTP
    └─ cola position  (+DLQ) → worker-position  ×4 → log JSON
```

Diseño, decisiones y justificación completa: ver `CLAUDE.md`.

## Puesta en marcha

```bash
cp .env.example .env    # llenar credenciales de Gmail (App Password)
docker compose up --build -d
docker compose ps       # verificar: 10 contenedores
```

- Endpoint: `POST http://localhost:8080/events`
- UI RabbitMQ: http://localhost:15672 (guest / guest)

## Prueba de carga

```bash
brew install k6         # si no está instalado
k6 run k6/script.js
docker compose logs -f api worker-emergency   # logs de rúbrica en vivo
```

## Entregable de logs

```bash
docker compose logs > logs_ejecucion.txt
```

Los dos logs que exige la rúbrica, en JSON con timestamp ISO:

- `EMERGENCY_RECIBIDO` — lo escribe la API en el instante de la llegada HTTP.
- `CORREO_ENVIADO` — lo escribe worker-emergency tras el envío SMTP exitoso,
  con la latencia interna calculada en ms.

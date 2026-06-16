# API-Guardian: Asynchronous Microservices & Telemetry Architecture

API-Guardian is a resilient, containerized backend infrastructure designed to process high-concurrency transaction workflows, manage decoupled asynchronous queues, and run autonomous real-time anomaly detection.

The platform relies on statistical variance analysis ($Z\text{-Score}$ algorithms) instead of static thresholds to flag downstream dependency failures and resource contention without human intervention.

---

## 📐 System Architecture

This project operates strictly as an infrastructure system layer. Below is the internal network topology mapping the synchronous identity boundaries, the durable message broker queues, and the automated observability plane.

```mermaid
graph TD
    %% Nodes
    Client([Load Test Script])
    Order[Order Service]
    Auth[Auth Service]
    Queue[(Redis / BullMQ)]
    Payment[Payment Service <br/><i>Failure Simulator</i>]
    
    %% Telemetry Layer
    subgraph Telemetry Layer
        Prom[Prometheus Scraper]
        Grafana[Grafana Dashboard]
        AI[AI Anomaly Service <br/><i>Z-Score Engine</i>]
        DB[(In-Memory Incidents)]
    end

    %% Flows
    Client -->|HTTP POST Loop| Order
    Order -->|Sync HTTP JWT Auth| Auth
    Order -->|Async Queue Enqueue| Queue
    Queue -->|Worker Polling| Payment
    
    %% Metrics Flows
    Auth -.->|Metrics Scrape| Prom
    Order -.->|Metrics Scrape| Prom
    Payment -.->|Metrics Scrape| Prom
    
    Prom --> Grafana
    Prom -->|Telemetry Stream| AI
    AI -->|State Persistence| DB

    %% Styling
    style Telemetry Layer fill:#1f1f1f,stroke:#333,stroke-width:2px,color:#fff
    style Payment fill:#a32a2a,stroke:#ff5555,stroke-width:1px,color:#fff
    style AI fill:#1a5f7a,stroke:#57c5b6,stroke-width:1px,color:#fff
```

## 📊 Live Telemetry & Incident Logs

> [!NOTE]
> Below is the diagnostic state captured when a $40\%$ artificial fault rate was injected into the payment isolation zone while under a $60\text{-order}$ bulk traffic load loop.

### 🔴 Metrics Outage Spike & Automated Detection

![Grafana Telemetry Spike & Terminal Incidents](./assets/Latency_visual.png)
![Error Rate](./assets/Error_rate.png)
![Request Rate](./assets/Traffic_rate.png)

* **Telemetry Proof:** The visualization shows `order-service` and `auth-service` P99 latencies shifting upwards and plateauing at **453ms** under high-concurrency pressure, followed by a graceful drop to baseline once the queue cleared.
* **Cascading Failure Visibility:** Due to synchronous dependencies on the identity ingress check, the downstream failure caused transit socket exhaustion that surfaced an error rate spike up to **72%** within the metrics monitoring pipeline.

---
## 🏗️ Core Architectural Components

* **Ingress Layer (Order Service):** Exposes high-throughput API endpoints to accept client payloads, routing them through identity validation before staging.
* **Decoupling Layer (Redis & BullMQ):** Acts as a durable, memory-backed message broker to throttle order fulfillment and protect internal systems from dropping states during unexpected traffic floods.
* **Worker Pool (Payment Service):** Consumes event queue jobs asynchronously. Includes an integrated simulation hook to alter application stability profiles dynamically via environment runtime configurations (`FAILURE_RATE=0.40`).
* **Telemetry Engine (AI Service):** Runs continuous tracking routines directly against Prometheus databases. Evaluates sliding time-windows to compute real-time standard deviation metrics over incoming cluster updates.

---

## 📡 Observability Framework

Every container in the cluster exposes continuous telemetry counters to map active service profiles:
* **Prometheus Engine:** Regularly scrapes service `/metrics` handlers across a sliding 2-minute context.
* **Grafana Dashboards:** Aggregates time-series queries to generate production panels tracking request volume rates, error rate percentages, and P99 latency variances.

---

## 🚀 Local Replication & Simulation Testing

To recreate the cluster layout and execute the load validation suite on your local device, run this sequence:

### 1. Boot up the Container Network

# Initialize and background the isolated container network configuration
docker compose up -d

### 2. Inject Runtime failure Conditions
set FAILURE_RATE=0.40&& docker compose up -d payment-service

### 3.Generate High-Volume Traffic Flood
for /L %i in (1,1,60) do (curl -s -X POST http://localhost:3003/orders -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhMzBmYWQ4ZDI4NjAyNDIwNGU3Nzk4NiIsImlhdCI6MTc4MTU5NDg0MSwiZXhwIjoxNzgyMTk5NjQxfQ.G9vHbcYnzkOufRi3N6oUmEXMQKuck5YoBeqx5Mz72Tk" -H "Content-Type: application/json" -d "{\"items\":[{\"productId\":\"sim-%i\",\"name\":\"Error Test\",\"quantity\":1,\"price\":99}]}" > null & echo [Order %i/60] Processing... & timeout /t 1 > null)

### 4. Fetch results
curl -s http://localhost:3004/incidents | python -m json.tool
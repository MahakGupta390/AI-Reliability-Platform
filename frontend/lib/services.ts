export type ServiceStatus = "UP" | "DOWN"

export type Service = {
  id: string
  name: string
  region: string
  status: ServiceStatus
  /** P99 latency in milliseconds */
  latency: number
  /** trend of latency vs previous window */
  latencyTrend: "up" | "down"
  /** error rate as a percentage, e.g. 0.04 */
  errorRate: number
  /** normalized P99 sparkline samples (0-1), oldest -> newest */
  series: number[]
  /** CPU utilization percentage */
  cpu: number
  /** memory footprint label, e.g. "1.2GB" */
  mem: string
  /** requests per second throughput */
  rps: string
}

export const SERVICES: Service[] = [
  {
    id: "auth",
    name: "Auth Service",
    region: "us-east-1",
    status: "UP",
    latency: 124,
    latencyTrend: "down",
    errorRate: 0.04,
    series: [0.42, 0.5, 0.38, 0.46, 0.4, 0.34, 0.44, 0.3, 0.36, 0.28],
    cpu: 14,
    mem: "1.2GB",
    rps: "8.4k",
  },
  {
    id: "payments",
    name: "Payment Gateway",
    region: "us-west-2",
    status: "UP",
    latency: 212,
    latencyTrend: "up",
    errorRate: 0.0,
    series: [0.3, 0.34, 0.4, 0.36, 0.44, 0.42, 0.5, 0.48, 0.56, 0.6],
    cpu: 27,
    mem: "2.1GB",
    rps: "3.1k",
  },
  {
    id: "orders",
    name: "Order Processor",
    region: "eu-central-1",
    status: "UP",
    latency: 96,
    latencyTrend: "down",
    errorRate: 0.12,
    series: [0.5, 0.44, 0.48, 0.4, 0.42, 0.36, 0.38, 0.32, 0.34, 0.26],
    cpu: 9,
    mem: "780MB",
    rps: "12.7k",
  },
]

/** Spiking sparkline used when a service enters a CRITICAL state. */
export const CRITICAL_SERIES = [
  0.3, 0.34, 0.32, 0.4, 0.46, 0.62, 0.78, 0.88, 0.95, 1,
]

export const ANOMALY = {
  latency: 2450,
  errorRate: 42.8,
  cpu: 97,
  mem: "5.8GB",
  rps: "0.2k",
}

export type ActivityItem = {
  id: string
  time: string
  message: string
  level: "ok" | "warn" | "error"
}

export const ACTIVITY: ActivityItem[] = [
  {
    id: "a1",
    time: "2m ago",
    message: "AI optimized DB connection pooling limits on auth-service",
    level: "ok",
  },
  {
    id: "a2",
    time: "14m ago",
    message: "checkout-service latency spike auto-resolved",
    level: "ok",
  },
  {
    id: "a3",
    time: "38m ago",
    message: "Elevated 5xx rate detected on order-processor region eu-central-1",
    level: "warn",
  },
  {
    id: "a4",
    time: "1h ago",
    message: "Payment Gateway TLS certificate rotated successfully",
    level: "ok",
  },
  {
    id: "a5",
    time: "3h ago",
    message: "Failover triggered for us-west-2 replica node",
    level: "error",
  },
]

# Future Plan: Cassandra Multi-IP & IP Range Support

## 1. Background & Context

- **Cassandra 2.2 Environment**: The production cluster runs Cassandra 2.2, which utilizes **CQL Binary Protocol v4** and CQL specification `3.3.1`.
- **Driver Considerations**: The official `gocql` driver (now under `apache/cassandra-gocql-driver`) sunset official support for legacy Cassandra 2.2 starting from `v1.3.0`.
- **Current Custom Driver**: To maintain clean compatibility with Cassandra 2.2 without external dependency conflicts or protocol version mismatches, this repository uses a custom, zero-dependency CQL v4 client ([`server/db/cql_client.go`](file:///root/downloads/micaps-web/server/db/cql_client.go)).
- **Current Limitation**: Currently, the server accepts only a single host via the `-host` CLI flag (e.g. `-host 192.168.1.103`), and `CQLClient` maintains a single TCP socket address. Providing comma-separated IPs or IP ranges fails at `net.DialTimeout`.

---

## 2. Goals & Scope

Add native support for multiple Cassandra seed node IPs and IP range formats in CLI flags, configuration, and the custom CQL client, enabling high availability, seed node pooling, and automatic failover.

### Supported Input Formats
1. **Single IP / Hostname**:
   ```bash
   ./micaps-server -host 192.168.1.103 -cport 9042
   ```
2. **Comma-Separated List**:
   ```bash
   ./micaps-server -host 192.168.1.103,192.168.1.104,192.168.1.105 -cport 9042
   ```
3. **IP Range Notation**:
   ```bash
   ./micaps-server -host 192.168.1.103-105 -cport 9042
   ```
   *(Expands automatically into `192.168.1.103`, `192.168.1.104`, `192.168.1.105`)*
4. **Mixed Host/Port Combinations**:
   ```bash
   ./micaps-server -host 192.168.1.103:9042,192.168.1.104:9043
   ```

---

## 3. Architecture & Design

### A. Host & Range Parsing (`server/config/config.go`)
Introduce a host string parser `ParseCassandraHosts(hostStr string, defaultPort int) ([]string, error)`:
- Detects hyphens in the last octet (e.g., `192.168.1.103-105`) and generates the sequential IP slice (`103` through `105`).
- Splits comma-separated items and trims whitespace.
- Attaches the default CQL port (`defaultPort`, e.g. `9042`) if no port is explicitly specified.

### B. Seed Node Pool & Failover in CQL Client (`server/db/cql_client.go`)
Update `CQLClient` struct:
```go
type CQLClient struct {
    addrs       []string
    activeIdx   int
    conn        net.Conn
    mu          sync.Mutex
    timeout     time.Duration
}
```

- **Constructor**:
  ```go
  func NewCQLClient(addrs []string, timeout time.Duration) (*CQLClient, error)
  ```
- **Connection & Reconnection Strategy**:
  1. Try the current `activeIdx` address.
  2. If dial or CQL `STARTUP` fails, iterate through remaining `addrs` in round-robin fashion.
  3. Mark the successful endpoint as `activeIdx` and log the connected cluster node.
  4. Return an error only if all candidate seed nodes are unreachable.
- **Query-Level Automatic Failover**:
  - When `Query()` encounters a broken connection or network timeout, automatically invoke `reconnect()` across the candidate pool and retry the query before failing.

---

## 4. Implementation Steps & Checklist

- [ ] **Step 1: Implement Host Parser**
  - Add `ParseCassandraHosts` in `server/config/` with test cases for single host, comma-separated lists, and IP ranges (`192.168.1.103-105`).
- [ ] **Step 2: Update Config & Startup Flow**
  - Update `Config` struct and [`server/cmd/main.go`](file:///root/downloads/micaps-web/server/cmd/main.go) to parse and pass `[]string` endpoints to `db.NewCQLClient`.
- [ ] **Step 3: Update `CQLClient` for Multi-Address Failover**
  - Modify `CQLClient` in [`server/db/cql_client.go`](file:///root/downloads/micaps-web/server/db/cql_client.go) to store `addrs []string`.
  - Implement loop-based dialing and failover across candidate seed nodes.
- [ ] **Step 4: Verification & Tests**
  - Add unit tests verifying:
    - Host range expansion logic.
    - Failover when the primary seed node is unreachable and secondary seed node is alive.
    - Graceful fallback to offline mock mode when all nodes are down.

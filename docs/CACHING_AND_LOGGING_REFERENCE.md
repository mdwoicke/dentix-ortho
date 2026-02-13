# Caching & Logging Reference

Complete reference for the Redis slot cache, alert engine, heartbeat service, Slack notifications, and related API endpoints.

---

## 1. Redis Slot Cache Architecture

The slot cache stores pre-fetched appointment availability from Cloud9 in Redis, organized into 3 tiers by date range.

### Tiers

| Tier | Date Range | Purpose |
|------|-----------|---------|
| **Tier 1** | Near-term (e.g., next 7 days) | Most frequently requested slots |
| **Tier 2** | Mid-term (e.g., 8-28 days) | Secondary availability |
| **Tier 3** | Long-term (e.g., 29-56 days) | Extended scheduling |

### Redis Key Format

```
SlotCache-{locationGUID}-Tier{1|2|3}
SlotCache-{locationGUID}-Tier{1|2|3}-PreGrouped
```

Location GUID (CDH Allegheny 202): `1fef9297-7c8b-426b-b0d1-f2275136e48b`

### Cache Data Structure

Each key stores JSON with:
- `slots` — array of slot objects (flat or grouped-by-date)
- `fetchedAt` — ISO timestamp of when data was fetched
- `tierDays` — number of days covered
- `dateRange` — start/end dates

### Staleness Threshold

Cache is considered **stale** if `cacheAgeSeconds > 600` (10 minutes).

### Refresh Logic

- Refresh is triggered via the Node-RED `/cache/refresh` endpoint or the `/trigger` endpoint
- The trigger endpoint has v2 retry logic built in
- Refresh can be forced (bypasses business hours) via the backend API

---

## 2. Cache Endpoints

All under `GET/POST/DELETE /api/test-monitor/cache-health/*`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cache-health` | Get cache health status (proxies Node-RED `/cache-health`) |
| `POST` | `/cache-health/refresh` | Force cache refresh. Body: `{ "tier": "all" \| 1 \| 2 \| 3 }` |
| `DELETE` | `/cache-health/cache` | Clear cache. Query: `?tier=1` (optional) |
| `GET` | `/cache-health/tier/:tier/slots` | Get all cached slots for tier 1, 2, or 3 |
| `POST` | `/cache-health/purge-and-refresh` | Purge all 6 keys (3 tiers x 2 variants) then refresh all tiers |

### Purge-and-Refresh Flow

1. Sets each of the 6 cache keys to `null` with 1-second TTL via `redisSet`
2. Waits 2 seconds for TTL expiry
3. Triggers full refresh via Node-RED trigger endpoint
4. Returns summary with purge/refresh success counts and total slots cached

---

## 3. Node-RED Cache Flows

### Endpoints (Node-RED)

Base URL: `https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cache-health` | GET | Returns tier status array; 503 if unhealthy (data still valid) |
| `/cache/refresh` | POST | Trigger cache refresh. Body: `{ "tier": "all" }` |
| `/cache` | DELETE | Clear cache. Query: `?tier=N` |
| `/redisGet?key=...` | GET | Read a specific Redis key |
| `/redisSet` | POST | Write a Redis key. Body: `{ "key", "value", "ttl" }` |

Trigger endpoint (separate path):
```
POST /FabricWorkflow/api/test/redis-slot-cache/trigger
```

Authentication: Basic auth (`workflowapi` user).

---

## 4. Alert Engine

**Source:** `backend/src/services/alertEngine.ts`

The `AlertEngine` class evaluates metrics from production trace data and determines which alerts should fire.

### Metric Categories

**Production metrics** (real-time sliding window):

| Metric Type | Description | Unit |
|-------------|-------------|------|
| `api_errors` | Count of 502/500 errors from Cloud9 | count |
| `avg_latency` | Average tool call latency | ms |
| `slot_failures` | Percentage of failed slot fetches | percent |
| `abandonment_rate` | Sessions with <= 3 turns | percent |
| `empty_guid_errors` | Booking with empty patientGUID | count |
| `escalation_count` | Escalations to human agent | count |
| `cost_per_session` | Average cost per session | dollars |
| `booking_conversion` | Patient-to-booking conversion rate | percent |

**Langfuse-sourced metrics** (incremental alerting — only alerts on NEW issues since last successful alert):

| Metric Type | Description | Unit |
|-------------|-------------|------|
| `langfuse_empty_guid` | Empty patientGUID in booking call | count |
| `langfuse_gateway_errors` | HTTP 502/500 from Cloud9 | count |
| `langfuse_api_failure` | Cloud9 returned `success:false` (non-slot) | count |
| `langfuse_payload_leak` | Raw JSON exposed to caller (`PAYLOAD:` in generation) | count |
| `langfuse_slot_failures` | Slot fetch returned `success:false` | count |
| `langfuse_escalations` | Human escalation requests (filtered for real escalations) | count |
| `langfuse_conversation_loop` | Sessions with 19+ turns (potential loop) | count |

**Goal testing metrics:**

| Metric Type | Description | Unit |
|-------------|-------------|------|
| `goal_test_failures` | Failed goal tests (incremental) | count |

### Incremental Alerting Pattern

Langfuse and goal test metrics use incremental queries:
1. Look up the alert's last successful Slack notification timestamp from `heartbeat_alert_history`
2. Only query for issues **after** that timestamp
3. This prevents re-alerting on the same issues

### Condition Operators

`gt`, `lt`, `gte`, `lte`, `eq` — compared against `thresholdValue`.

### Cooldown

After a non-suppressed alert fires, it enters cooldown for `cooldownMinutes`. During cooldown, the alert evaluates but is marked `suppressed`.

### Resolution Suggestions

Langfuse alerts include resolution objects with:
- `suggestion` — short description
- `steps` — array of remediation steps

Resolution types: `API_FAILURE_RESOLUTIONS`, `GATEWAY_ERROR_RESOLUTIONS`, `PAYLOAD_LEAK_RESOLUTION`, `EMPTY_GUID_RESOLUTION`, `SLOT_FAILURE_RESOLUTION`, `ESCALATION_RESOLUTION`, `CONVERSATION_LOOP_RESOLUTION`

---

## 5. Heartbeat Service

**Source:** `backend/src/services/heartbeatService.ts`

Singleton service that orchestrates periodic alert evaluation and notification.

### How It Works

1. **Service interval** runs every `intervalMinutes` (default: 1 minute base interval)
2. Each tick, it calls `evaluateAlerts(configId, onlyDue=true, markChecked=true)`
3. Only alerts whose `check_interval_minutes` has elapsed since `last_checked_at` are evaluated
4. Triggered (non-suppressed) alerts are sent to Slack as a batch
5. All results are recorded in `heartbeat_runs` and `heartbeat_alert_history`

### Per-Alert Check Frequency

Default check intervals by severity:
- **critical**: 2 minutes
- **warning**: 5 minutes
- **info**: 15 minutes

Each alert has its own `check_interval_minutes` field.

### Run Tracking

Each heartbeat run creates a record in `heartbeat_runs` with:
- `started_at`, `completed_at`, `duration_ms`
- `alerts_checked`, `alerts_triggered`, `alerts_sent`, `alerts_suppressed`
- `status` (`completed` | `error`), `error_message`

---

## 6. Slack Notifications

**Source:** `backend/src/services/slackNotifier.ts`

### Configuration

Stored in `heartbeat_slack_config` table:
- `webhook_url` — Slack incoming webhook URL
- `default_channel` — default channel for warnings/info
- `critical_channel` — override channel for critical alerts
- `enabled` — boolean toggle

### Channel Routing

- **Critical** severity alerts go to `criticalChannel` (if configured), otherwise `defaultChannel`
- All other severities go to `defaultChannel`

### Message Format (Block Kit)

1. **Header** — severity emoji + "Dentix Ortho Alert Summary"
2. **Context** — severity badge, alert count, timestamp
3. **Per-alert sections** — name, description, value vs threshold, lookback window
   - Goal test failures: includes failed test IDs with links to run detail + Langfuse trace
   - Langfuse alerts: includes error details with timestamps, actions, trace links
   - Langfuse alerts: includes resolution suggestion with steps
4. **Action buttons** — View Dashboard, View Traces, Manage Alerts

### Resolution Notifications

`sendResolutionNotification(alertName, resolvedAt)` sends a green checkmark message when an alert clears.

---

## 7. Heartbeat / Alert API

All under `/api/heartbeat/*`

### Service Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status` | Service status (isRunning, interval, lastRun, alertCounts, langfuseConfig) |
| `POST` | `/start` | Start service. Body: `{ "intervalMinutes": 5 }` |
| `POST` | `/stop` | Stop service |
| `POST` | `/reset` | Reset singleton (reinitialize with fresh DB config) |
| `POST` | `/run` | Trigger manual heartbeat check |
| `GET` | `/history` | Run history. Query: `?limit=50&offset=0` |

### Alert Configuration

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/alerts` | List all alert definitions |
| `POST` | `/alerts` | Create alert. Required: `name`, `metricType`, `conditionOperator`, `thresholdValue` |
| `PUT` | `/alerts/:id` | Update alert fields |
| `DELETE` | `/alerts/:id` | Delete alert |
| `POST` | `/alerts/:id/toggle` | Enable/disable. Body: `{ "enabled": true }` |
| `GET` | `/alerts/:id/history` | Trigger history for one alert |
| `GET` | `/alerts/history` | All alert trigger history |

### Slack Integration

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/slack/status` | Connection status (configured, enabled, channels, lastTest) |
| `POST` | `/slack/test` | Send test message |
| `PUT` | `/slack/config` | Update webhook/channels/enabled |

### Langfuse Config

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/langfuse-configs` | List available Langfuse configs |
| `PUT` | `/langfuse-config` | Set config for monitoring. Body: `{ "configId": 1 }` |

### Metric Utilities

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/metrics` | List available metric types with descriptions |
| `GET` | `/metrics/:metricType/current` | Current value. Query: `?lookback=15` (minutes) |

---

## 8. Frontend Pages

### CacheHealthPage

Tabs:
- **Overview** — tier health cards with status, slot counts, cache age, freshness indicator
- **Tier Details** — slot browser for each tier with date grouping
- **Actions** — refresh, clear, purge-and-refresh buttons

Auto-refresh: polls `/api/test-monitor/cache-health` periodically.

### AlertsPage

Tabs:
- **Dashboard** — active alerts, recent triggers, metric summaries
- **History** — alert trigger history timeline
- **Settings** — alert CRUD, Slack config, Langfuse config selector, heartbeat service controls

---

## 9. Configuration Reference

### Cache TTLs & Thresholds

| Setting | Value | Location |
|---------|-------|----------|
| Staleness threshold | 600 seconds (10 min) | `testMonitorController.ts:10645` |
| Purge TTL | 1 second | `testMonitorController.ts:10691` |
| Purge wait before refresh | 2 seconds | `testMonitorController.ts:10712` |

### Heartbeat Defaults

| Setting | Value |
|---------|-------|
| Base service interval | 1 minute |
| Default start interval | 5 minutes (configurable via `/start`) |
| Critical alert check interval | 2 minutes |
| Warning alert check interval | 5 minutes |
| Info alert check interval | 15 minutes |
| Default cooldown | 30 minutes |
| Default lookback | 15 minutes |
| Conversation loop threshold | 19+ turns |
| Abandonment threshold | <= 3 turns |

### Slack Config Defaults

| Setting | Value |
|---------|-------|
| Dashboard base URL | `http://localhost:5174` (from `app_settings` table) |
| Langfuse host/project | from `app_settings` table |

---

## 10. Verification Checklist

### Cache Health

- [ ] `curl http://localhost:3002/api/test-monitor/cache-health` returns `success: true` with `tiers` array
- [ ] Each tier shows `fetchedAt` timestamp and slot counts
- [ ] `POST /api/test-monitor/cache-health/refresh` triggers refresh successfully
- [ ] `GET /api/test-monitor/cache-health/tier/1/slots` returns slot data
- [ ] `POST /api/test-monitor/cache-health/purge-and-refresh` purges 6/6 keys and refreshes

### Heartbeat Service

- [ ] `GET /api/heartbeat/status` returns service state
- [ ] `POST /api/heartbeat/start` starts the service (check `isRunning: true`)
- [ ] `POST /api/heartbeat/run` executes a manual check and returns results
- [ ] `GET /api/heartbeat/history` shows run records
- [ ] `POST /api/heartbeat/stop` stops the service

### Alerts

- [ ] `GET /api/heartbeat/alerts` lists all configured alerts
- [ ] `GET /api/heartbeat/metrics` lists all metric types with descriptions
- [ ] `GET /api/heartbeat/metrics/api_errors/current?lookback=60` returns current value
- [ ] Creating, updating, toggling, and deleting alerts works via API

### Slack

- [ ] `GET /api/heartbeat/slack/status` shows configuration state
- [ ] `PUT /api/heartbeat/slack/config` updates webhook URL
- [ ] `POST /api/heartbeat/slack/test` sends test message successfully
- [ ] Triggered alerts appear in Slack with Block Kit formatting and trace links

### Frontend

- [ ] Cache Health page loads and shows tier status
- [ ] Alerts page Dashboard tab shows active alerts
- [ ] Alerts page Settings tab allows alert CRUD and Slack config

# Dominos Call-to-Order Linkage Analysis

**Date:** 2026-02-12
**Status:** Research complete — no existing linkage found

---

## Executive Summary

The Dominos call tracing (Langfuse) and order logging (CSV import) systems are **two completely independent data pipelines** with **zero shared identifiers**. There is currently no way to do a direct 1:1 join between a call session and its resulting order. This document details the findings and proposes solutions.

---

## Architecture: Two Independent Pipelines

### Pipeline 1: Langfuse Traces (Real-Time)

```
Caller → Flowise IVA (gpt-4.1 on Azure) → Langfuse API → imported into production_traces/sessions
```

- **Database:** `test-agent/data/test-results.db`
- **Tables:** `production_traces`, `production_trace_observations`, `production_sessions`
- **Langfuse Config:** `id=5` ("Dominos Prod")
- **Session ID Format:** `conv_5_+17208899120_1770832209115` (conv_{configId}_{phone}_{epochMs})
- **Import Method:** Langfuse API polling via `GET /api/public/traces`

### Pipeline 2: Dominos Order Logs (Batch CSV Import)

```
Dominos call center → CSV export (sites/call_info_and_orders.csv) → import-dominos-csv.js → dominos_order_logs
```

- **Database:** `backend/dentix.db`
- **Table:** `dominos_order_logs`
- **Session ID Format:** `1770689680-000000000001025565-SR-000-000000000000DEN140-6A81B186` (telephony format)
- **Import Script:** `test-agent/scripts/import-dominos-csv.js`

---

## Data Inventory

### What Each Pipeline Contains

| Data Point | Langfuse Trace | Dominos Order Log |
|------------|---------------|-------------------|
| Phone number | `+17208899120` (in `user_id` and session_id) | `7204148925` (in `customer_phone`) |
| Timestamp | Epoch ms in session_id | Epoch sec in session_id |
| Store ID | In PAYLOAD `orderDataBody.store_number` | `store_id` column |
| Order items | In PAYLOAD `CD` field + `orderDataBody.cart.products` | `order_summary` + `response_body` JSON |
| Order total | In PAYLOAD `TOT` field | `order_total` column |
| Dominos OrderID | **NOT present** | In `response_body` at `$.createOrderData.order.OrderID` |
| Telephony session ID | **NOT present** | `session_id` column |
| `elly_session_id` (UUID) | **NOT present** | In `request_body` at `$.elly_session_id` |
| `AdvanceOrderID` | **NOT present** | In `response_body` at `$.createOrderData.order.AdvanceOrderID` (equals `elly_session_id`) |
| Langfuse trace metadata | `{}` (empty on all traces) | N/A |
| Langfuse trace tags | `[]` (empty on all traces) | N/A |
| Conversation transcript | Full multi-turn in trace input/output | `utterance` column (single field) |
| Customer name | Extractable from conversation | `customer_name` column |
| Customer address | Extractable from conversation | `customer_address` column |

### Dominos Order Log Schema (`dominos_order_logs`)

39 columns total. Key fields:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment record ID |
| `tenant_id` | INTEGER | Multi-tenancy |
| `session_id` | TEXT | Telephony session ID (NOT Langfuse) |
| `request_id` | TEXT | Unique request identifier |
| `timestamp` / `timestamp_cst` | TEXT | Order timestamp |
| `store_id` | TEXT | Dominos store number |
| `order_total` | REAL | Order amount |
| `items_count` | INTEGER | Number of items |
| `success` | INTEGER | 1=success, 0=failure |
| `customer_name` | TEXT | Customer name |
| `customer_phone` | TEXT | Customer phone (unformatted) |
| `customer_address` | TEXT | Delivery address |
| `order_type` | TEXT | Delivery/Carryout |
| `order_confirmed` | INTEGER | 1=confirmed |
| `payment_type` | TEXT | Cash/Card |
| `request_body` | TEXT | Full request JSON (contains `elly_session_id`, `sessionId`, `orderDataBody`) |
| `response_body` | TEXT | Full response JSON (contains `createOrderData.order.OrderID`) |
| `ai_agent_order_output` | TEXT | AI agent response (rarely populated) |

### Langfuse Trace Structure (Dominos Sessions)

Each trace output follows: `ANSWER: <spoken text>\nPAYLOAD: <JSON>`

**PAYLOAD fields per turn:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `TC` | int | Turn Count | `1`, `13` |
| `IC` | int | Item Count | `0`, `1` |
| `TOT` | float | Running order total | `16.99` |
| `CD` | string | Cart Description (product codes) | `"P14IRESC(1)"` |
| `PT` | string | Product Tracking | `"P1:7/7"` |
| `ET` | bool | Escalation Transfer | `false` |
| `TL` | bool | Transfer Live | `true` |
| `VM` | bool | Valid Menu item | `false` |
| `orderConfirmed` | string | Order placed flag | `"true"` |
| `orderDataBody` | object | Full cart with products | `{store_number, cart: {products: [...]}}` |

**Observation types per trace:**

| Type | Name | Purpose |
|------|------|---------|
| SPAN | `AgentExecutor` | Top-level span |
| SPAN | `ChatPromptTemplate` | Full system prompt |
| **GENERATION** | **`AzureChatOpenAI`** | LLM call (gpt-4.1) — contains ANSWER+PAYLOAD |
| SPAN | `ToolCallingAgentOutputParser` | Output parsing |

**Generation metadata:**
```json
{
  "ls_provider": "azure",
  "ls_model_name": "gpt-4.1",
  "ls_model_type": "chat",
  "ls_temperature": 0
}
```

---

## Linkage Verification Results

### Test 1: Direct Session ID Match

```
Unique sessions with confirmed orders: 857
Matched to production_sessions: 0  (ZERO)
```

**Result:** Complete mismatch. The telephony session IDs and Langfuse session IDs use entirely different formats.

### Test 2: `elly_session_id` in Langfuse

Searched for `elly_session_id` UUIDs from order logs across all Langfuse data:
- In trace metadata: **Not found**
- In observation outputs: **Not found**
- In observation inputs: **Not found**

**Result:** The `elly_session_id` is never sent to Langfuse.

### Test 3: Telephony Session ID in Langfuse

Searched for telephony session ID patterns (`SR-000`, `DEN1`) in observations:
- In observation outputs: **Not found** (false positives only — the word "session" in system prompt text)
- In observation inputs: **Not found**

**Result:** Telephony IDs never appear in Langfuse data.

### Test 4: Phone + Time Window Fuzzy Match

Attempted matching on normalized phone number + 30-minute time window:
```
Matched: 0 / 30 (tested most recent 30 orders)
```

**Root cause:** The 857 orders (Feb 4-10) are from different phones/time periods than the 9 Langfuse sessions (Feb 10-11). The orders use test phones (`7204148925`, `2058319956`) while Langfuse has real callers (`+17208899120`, `+13053951075`).

### Test 5: Order Uniqueness

```
Orders per session: Always exactly 1 (1:1 relationship)
Dominos OrderIDs: All unique (no duplicates)
session_id column matches request_body.sessionId: 856/857 (1 null)
elly_session_id == AdvanceOrderID: true (always match)
```

**Result:** Within each pipeline, the data is clean and 1:1. The problem is purely cross-pipeline.

---

## Key IDs Available in Each System

### In Dominos Order Logs

| ID | Location | Uniqueness | Example |
|----|----------|------------|---------|
| `session_id` (telephony) | Column | Unique per order | `1770689680-...-DEN140-6A81B186` |
| `elly_session_id` | `request_body` JSON | Unique per order | `7ecad0fc-255a-4e65-9c3a-88807e8a1ea2` |
| `OrderID` (Dominos) | `response_body` JSON | Unique per order | `BC0xbYj7w_C3pNr8dOir` |
| `AdvanceOrderID` | `response_body` JSON | Equals `elly_session_id` | `7ecad0fc-255a-4e65-9c3a-88807e8a1ea2` |
| `PulseOrderGuid` | `response_body` JSON | Sometimes empty | `395638a5-1df7-4cb2-afe1-f225a07c00b6` |
| `customer_phone` | Column | Not unique (same caller, multiple orders) | `7204148925` |

### In Langfuse Traces

| ID | Location | Uniqueness | Example |
|----|----------|------------|---------|
| `session_id` (Langfuse) | Column | Unique per conversation | `conv_5_+17208899120_1770832209115` |
| `trace_id` | Column | Unique per turn | `3862c7dd-09b5-...` |
| `user_id` (phone) | Column | Not unique (same caller, multiple calls) | `+17208899120` |
| `observation_id` | Observations table | Unique per tool call / generation | UUID |

---

## Proposed Solutions

### Option A: Inject Telephony Session ID into Langfuse (Upstream)

**Approach:** The Flowise IVA likely receives the telephony session ID when the call is initiated. Pass it as `metadata.telephonySessionId` on the Langfuse trace.

**Pros:**
- Direct 1:1 join key
- Cleanest long-term solution
- No fuzzy matching needed

**Cons:**
- Requires changes to the Flowise chatflow or the calling platform integration
- Only works for future data (not retroactive)

**Join query (after implementation):**
```sql
SELECT * FROM production_traces pt
JOIN dominos_order_logs ol
  ON json_extract(pt.metadata_json, '$.telephonySessionId') = ol.session_id
```

### Option B: Inject Langfuse Session ID into Order API Call (Upstream)

**Approach:** When Flowise triggers the Dominos order API, include the Langfuse `sessionId` in the request payload. The CSV export would then contain this field.

**Pros:**
- Direct 1:1 join key
- Leverages existing `elly_session_id` pattern

**Cons:**
- Requires changes to the Dominos ordering tool in Flowise
- Requires the CSV export format to include this new field
- Only works for future data

### Option C: Fuzzy Match on Phone + Time + Order Details (No Upstream Changes)

**Approach:** Normalize phone numbers (strip `+1` prefix), match within a configurable time window, and verify with store ID + order total.

**Match criteria:**
1. Phone: last 10 digits match
2. Timestamp: within 30-minute window (order epoch ± 30 min of Langfuse session epoch)
3. Store: `orderDataBody.store_number` matches `store_id`
4. Total: PAYLOAD `TOT` approximately matches `order_total`

**Pros:**
- No upstream changes needed
- Can work retroactively if data overlaps

**Cons:**
- Fragile — multiple orders from same phone in short window = ambiguous
- Only works when both pipelines have temporally overlapping data
- Current data has almost zero overlap (different time periods, different phones)

### Option D: Parse PAYLOAD at Langfuse Import Time

**Approach:** When importing Langfuse traces, parse the `orderConfirmed: "true"` PAYLOAD to extract order details (store, items, total, cart description). Store in a new `langfuse_order_extracts` table. When importing CSV orders, attempt fuzzy match against this table.

**New table:**
```sql
CREATE TABLE langfuse_order_extracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,        -- Langfuse session_id
  trace_id TEXT NOT NULL,          -- Trace containing the order
  phone TEXT,                      -- Normalized phone from user_id
  store_number TEXT,               -- From orderDataBody
  order_total REAL,                -- From TOT field
  items_count INTEGER,             -- From product count
  cart_description TEXT,           -- From CD field
  order_summary TEXT,              -- From summary field
  order_confirmed_at TEXT,         -- Trace timestamp
  matched_order_log_id INTEGER,    -- FK to dominos_order_logs.id (once matched)
  match_confidence TEXT,           -- 'exact', 'high', 'low'
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Pros:**
- No upstream changes needed
- Structured extraction makes fuzzy matching more reliable
- Can work retroactively

**Cons:**
- Still a fuzzy match (no guaranteed 1:1)
- Requires overlapping data between pipelines

---

## Recommendation

**Short-term:** Option D — parse and extract order details from Langfuse PAYLOAD during import, enabling best-effort fuzzy matching.

**Long-term:** Option A — inject the telephony session ID into Langfuse trace metadata at the Flowise/platform level. This creates a guaranteed 1:1 join key with zero ambiguity.

Both can coexist: Option D provides immediate value with existing data, while Option A ensures perfect linkage going forward.

---

## Database Locations

| Database | Path | Contains |
|----------|------|----------|
| Main app DB | `backend/dentix.db` | `dominos_order_logs`, `tenants`, `users` |
| Test results DB | `test-agent/data/test-results.db` | `production_traces`, `production_trace_observations`, `production_sessions`, `langfuse_configs` |

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/models/DominosOrderLog.ts` | Order log model (schema + queries) |
| `backend/src/controllers/dominosProxyController.ts` | Dashboard endpoints + order proxy |
| `backend/src/services/langfuseTraceService.ts` | Langfuse trace import + session stats |
| `backend/src/controllers/traceAnalysisController.ts` | Trace analysis + call reports |
| `backend/src/database/migrations/005_add_dominos_order_tables.ts` | Order table schema |
| `test-agent/scripts/import-dominos-csv.js` | CSV order import script |
| `frontend/src/pages/Dominos/` | Dominos dashboard UI |

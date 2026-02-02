# Phase 3: Trace Analysis UI - Research

**Researched:** 2026-02-02
**Domain:** React frontend page for interactive trace analysis, consuming existing backend APIs
**Confidence:** HIGH

## Summary

This phase adds a dedicated "Trace Analysis" page to the App UI that lets users interactively investigate any call trace. The backend APIs already exist (Phase 1/2): `GET /api/trace-analysis/:sessionId` returns intent classification, tool sequence, transcript, and optional fulfillment verification. The frontend work is purely UI: a new page, route, tab entry, and API client functions.

The existing codebase uses React + react-router-dom + Tailwind CSS + inline SVG icons. Pages follow a consistent pattern: functional components with hooks, `PageHeader` + `Card` layout components, and API functions in `frontend/src/services/api/testMonitorApi.ts`. The AnalysisPage already has trace/session search modals with similar functionality but embedded in a workflow context -- this phase creates a standalone, focused page.

**Primary recommendation:** Create a single new page component at `frontend/src/pages/TestMonitor/TraceAnalysisPage.tsx` following the exact patterns of `CallTracePage.tsx` and `AnalysisPage.tsx`. Wire it into the existing routing and tab navigation. Consume the existing `/api/trace-analysis/:sessionId` endpoints via new API client functions.

## Standard Stack

### Core (already in project -- no new dependencies)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| React 18 | UI framework | Already in project |
| react-router-dom v6 | Routing, `useSearchParams` for deep linking | Already in project |
| Tailwind CSS | Styling | Already in project, all pages use it |
| Redux Toolkit | State management (only if needed) | Already in project, but this page can use local state |

### Supporting (already available)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `PageHeader` component | Page title/subtitle | Every page uses it |
| `Card` component | Content containers | Every page uses it |
| `Button` component | Actions | Standard UI component |
| `Spinner` component | Loading states | Standard UI component |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local state | Redux slice | Overkill for a read-only page; AnalysisPage uses Redux but CallTracePage uses local state. Local state is simpler and sufficient |
| New component library | Existing inline SVG icons | Codebase uses inline SVGs everywhere, no icon library |

**Installation:** None needed. All dependencies are already present.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
  pages/TestMonitor/
    TraceAnalysisPage.tsx        # NEW - main page component
  services/api/
    testMonitorApi.ts            # ADD functions for /api/trace-analysis endpoints
  types/
    testMonitor.types.ts         # ADD TypeScript interfaces for API responses
  routes/
    AppRouter.tsx                # ADD route: <Route path="trace-analysis" element={<TraceAnalysisPage />} />
  pages/TestMonitor/
    index.tsx                    # ADD tab entry + re-export
```

### Pattern 1: Page Component Structure
**What:** Every TestMonitor page follows this pattern
**When to use:** Always for new pages
**Example:**
```typescript
// Source: Verified from CallTracePage.tsx, AnalysisPage.tsx
export default function TraceAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TraceAnalysisResponse | null>(null);

  // Handle URL params for deep linking (e.g., ?sessionId=xxx)
  useEffect(() => {
    const param = searchParams.get('sessionId');
    if (param) { /* auto-load */ }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <PageHeader title="Trace Analysis" subtitle="..." />
      <Card>...</Card>
    </div>
  );
}
```

### Pattern 2: API Client Functions
**What:** All API calls go through `testMonitorApi.ts` using the `get`/`post` helpers
**When to use:** For every backend call
**Example:**
```typescript
// Source: Verified from testMonitorApi.ts patterns
export interface TraceAnalysisResponse {
  sessionId: string;
  traces: Array<{ traceId: string; timestamp: string; name: string }>;
  transcript: ConversationTurn[];
  intent: CallerIntent | null;
  toolSequence: ToolSequenceResult | null;
  verification?: FulfillmentVerdict;
  analyzedAt: string;
  cached: boolean;
}

export async function getTraceAnalysis(
  sessionId: string,
  options?: { verify?: boolean; force?: boolean; configId?: number }
): Promise<TraceAnalysisResponse> {
  const params = new URLSearchParams();
  if (options?.verify) params.append('verify', 'true');
  if (options?.force) params.append('force', 'true');
  if (options?.configId) params.append('configId', options.configId.toString());
  const qs = params.toString();
  const response = await get<TestMonitorApiResponse<TraceAnalysisResponse>>(
    `/trace-analysis/${sessionId}${qs ? `?${qs}` : ''}`
  );
  return response.data;
}
```

### Pattern 3: Route + Tab Registration
**What:** Adding a new page requires 3 touch points
**When to use:** Always
**Steps:**
1. Add route constant in `frontend/src/utils/constants.ts`
2. Add `<Route>` in `AppRouter.tsx` under test-monitor
3. Add tab in `TestMonitor/index.tsx` tabs array
4. Add re-export in `TestMonitor/index.tsx`

### Pattern 4: Deep Linking from Other Pages
**What:** CallTracePage already links to AnalysisPage via `?sessionId=xxx`. The new page should support same pattern.
**Example from CallTracePage line 1666:**
```typescript
href={`/test-monitor/analysis?sessionId=${session.sessionId}`}
```
The new page should be linkable as:
```
/test-monitor/trace-analysis?sessionId=xxx
```

### Anti-Patterns to Avoid
- **Inline API calls without error handling:** Always wrap in try/catch with loading/error state
- **New dependencies:** Do not add any new npm packages; everything needed is already in the project
- **Redux for simple read-only data:** Local state with useState/useEffect is preferred for pages that don't need shared state (see CallTracePage pattern)
- **Custom scrollbar/layout components:** Use existing `Card`, `PageHeader` components

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Layout/cards | Custom divs | `Card`, `PageHeader` components | Consistency with rest of app |
| Loading spinners | Custom animation | `Spinner` component | Already exists |
| Buttons | Styled divs | `Button` component | Already exists |
| Transcript display | Custom renderer | `TranscriptViewer` component | Already exists in `components/features/testMonitor/` |
| Tree visualization for traces | Custom tree | Simple nested divs with indent | Backend returns flat trace list, not deep tree |
| JSON display for diagnostic report | Custom formatter | `<pre>` with `JSON.stringify(data, null, 2)` | Simple, effective |

**Key insight:** Nearly all UI components needed already exist in the codebase. The page is primarily composition of existing components with new data from the trace-analysis API.

## Common Pitfalls

### Pitfall 1: Not Handling Missing Optional Data
**What goes wrong:** Backend returns `intent: null` or `toolSequence: null` when LLM classification fails
**Why it happens:** Anthropic API may be unavailable or rate-limited
**How to avoid:** Check for null in every section; show "Not available" or "Run Analysis" button
**Warning signs:** Blank sections or React errors on null property access

### Pitfall 2: Vite Proxy Not Configured for New Route
**What goes wrong:** API calls to `/api/trace-analysis/*` fail with 404
**Why it happens:** The Vite dev server proxy in `vite.config.ts` routes `/api` to backend already
**How to avoid:** The existing `/api` proxy covers all API routes. No vite config change needed.

### Pitfall 3: Deep Link URL Params Consumed Once
**What goes wrong:** URL params persist causing re-fetch on navigation
**Why it happens:** `searchParams` not cleared after reading
**How to avoid:** Follow CallTracePage pattern: `setSearchParams({}, { replace: true })` after reading

### Pitfall 4: Forgetting to Export from index.tsx
**What goes wrong:** Import error in AppRouter
**Why it happens:** New page not re-exported from `TestMonitor/index.tsx`
**How to avoid:** Always add export in index.tsx alongside the tab entry

## Code Examples

### Backend API Response Shape (verified from traceAnalysisController.ts)
```typescript
// GET /api/trace-analysis/:sessionId response
{
  sessionId: string;
  traces: Array<{ traceId: string; timestamp: string; name: string }>;
  transcript: ConversationTurn[];  // { role: 'user'|'assistant', content: string }
  intent: {
    type: 'booking' | 'inquiry' | 'cancellation' | 'reschedule' | 'other';
    confidence: number;  // 0-1
    summary: string;
    bookingDetails?: { patientName?: string; date?: string; time?: string };
  } | null;
  toolSequence: {
    steps: Array<{ tool: string; status: string; output?: any }>;
    completionRate: number;
  } | null;
  verification?: {
    status: 'fulfilled' | 'partially_fulfilled' | 'not_fulfilled' | 'error';
    checks: Array<{ name: string; passed: boolean; details: string }>;
    verifiedAt: string;
  };
  analyzedAt: string;
  cached: boolean;
}
```

### UI Section Layout (recommended)
```typescript
// Top: Session ID input + search button
// Section 1: Intent Classification card (type badge, confidence bar, summary)
// Section 2: Transcript (reuse TranscriptViewer component)
// Section 3: Tool Sequence (step-by-step with status badges)
// Section 4: Fulfillment Verdict (status badge + check list)
// Section 5: Diagnostic Report (shown when verification data exists)
// Bottom: "Run Deep Analysis" button triggers ?verify=true re-fetch
```

### Linking from CallTracePage (add to session actions)
```typescript
<a
  href={`/test-monitor/trace-analysis?sessionId=${session.sessionId}`}
  className="p-1.5 text-gray-400 hover:text-indigo-600 ..."
  title="Trace Analysis"
>
  {/* analysis icon */}
</a>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Trace analysis only via API/CLI | Phase 1/2 added backend endpoints | Current milestone | Backend ready, needs UI |
| Analysis embedded in AnalysisPage modal | Dedicated standalone page | This phase | Better UX for investigation |

## Open Questions

1. **Diagnostic report format (UI-03)**
   - What we know: Backend returns `verification` with status, checks array, and verifiedAt
   - What's unclear: Whether "root cause, affected artifact, proposed diff" comes from a different endpoint or is part of the existing verification response. The existing `diagnoseProductionTrace` and `diagnoseProductionSession` functions return `DiagnosisResult` with root cause and fixes.
   - Recommendation: Display verification data from trace-analysis endpoint in Section 4. For "proposed diff" from diagnosis, add a "Diagnose" button that calls the existing `/test-monitor/production-calls/:traceId/diagnose` endpoint (already wired in AnalysisPage). This avoids building a new endpoint.

2. **Manual trigger of deep analysis (UI-04)**
   - What we know: `?verify=true` triggers fulfillment verification. `POST /test-monitor/production-calls/:traceId/diagnose` generates fixes.
   - What's unclear: Whether "deep analysis" means just verification or full diagnosis with fix generation
   - Recommendation: Two buttons: "Verify Fulfillment" (calls trace-analysis with verify=true) and "Diagnose & Generate Fixes" (calls existing diagnose endpoint). Matches AnalysisPage pattern.

## Sources

### Primary (HIGH confidence)
- `backend/src/controllers/traceAnalysisController.ts` - Verified API response shape, endpoints, caching behavior
- `backend/src/routes/traceAnalysis.ts` - Verified route definitions: GET /:sessionId, /:sessionId/intent, /:sessionId/verify
- `frontend/src/pages/TestMonitor/CallTracePage.tsx` - Verified page patterns, component usage, deep linking
- `frontend/src/pages/TestMonitor/AnalysisPage.tsx` - Verified trace search, diagnosis flow, modal patterns
- `frontend/src/pages/TestMonitor/index.tsx` - Verified tab registration and export patterns
- `frontend/src/routes/AppRouter.tsx` - Verified route registration pattern
- `frontend/src/services/api/testMonitorApi.ts` - Verified API client patterns, existing analysis functions

### Secondary (MEDIUM confidence)
- None needed - all findings from direct codebase inspection

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Directly verified from existing codebase, no new dependencies
- Architecture: HIGH - Patterns extracted from 5+ existing pages in the same codebase
- Pitfalls: HIGH - Based on actual patterns observed in existing code

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (stable - internal project, patterns won't change)

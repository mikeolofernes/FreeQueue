# FreeQueue Top Six Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the top six prioritized FreeQueue improvements from the research report: public display board, SMS almost-up notifications, kiosk idle/attract screen, prominent wait estimate, kiosk form inactivity timeout, and public endpoint rate limiting.

**Architecture:** Keep the existing single frontend in `customer-app` and the .NET 8 API in `src/FreeQueue.Api`. Add small focused frontend hooks/components for kiosk inactivity and display-board behavior, and add backend services for notification delivery and rate limiting without restructuring the queue domain.

**Tech Stack:** .NET 8, ASP.NET Core controllers/middleware, EF Core/Npgsql, Redis/SignalR, React 18, TypeScript, Vite, Tailwind.

---

## Verification Of Priority Items 1-6

| Priority | Claim | Current status | Evidence |
|---|---|---|---|
| 1 | Queue display board (`/display?branch=X`) | Not done | `customer-app/src/App.tsx` has `/join`, `/ticket/:ticketId`, `/staff/*`; no `/display` route exists. |
| 2 | SMS "you're almost up" notifications | Not done | `QueueTicket.Phone` and `JoinQueueRequest.Phone` exist, but no Twilio/Vonage package, SMS service, notification opt-in, or notification state exists. |
| 3 | Idle/attract screen on kiosk with live wait info | Not done | `JoinPage.tsx` renders the form immediately; no attract screen or inactivity timer exists. |
| 4 | Prominent wait estimate on ticket page | Partially done | `TicketPage.tsx` displays `~N min estimated` as small supporting text inside the ticket card; `TicketResponse.WaitEstimate` already exists. |
| 5 | Kiosk inactivity timeout during form filling | Not done | No form timeout, warning countdown, or auto-reset exists in `JoinPage.tsx`. |
| 6 | Rate limiting on join endpoint | Not done | `Program.cs` has no `AddRateLimiter`, no `UseRateLimiter`, and `QueueController.Join` has no `[EnableRateLimiting]`. |

## File Structure

### Frontend files

- Modify `customer-app/src/App.tsx`: add `/display` route.
- Modify `customer-app/src/api.ts`: add display summary and notification helper calls.
- Modify `customer-app/src/types.ts`: add display-board, join, and notification types.
- Modify `customer-app/src/pages/JoinPage.tsx`: add kiosk mode, attract screen, inactivity warning, notification opt-in, and safe reset.
- Modify `customer-app/src/pages/TicketPage.tsx`: make wait estimate the headline and expose connection/notification state.
- Create `customer-app/src/pages/DisplayPage.tsx`: read-only landscape queue display.
- Create `customer-app/src/hooks/useInactivityTimer.ts`: shared activity timer for kiosk screens.
- Create `customer-app/src/hooks/useTicketHubState.ts`: customer SignalR connection state.
- Create `customer-app/src/hooks/useDisplayHub.ts`: display-board SignalR subscription.
- Create `customer-app/src/components/WaitEstimateHero.tsx`: reusable wait estimate headline.

### Backend files

- Modify `src/FreeQueue.Api/Program.cs`: register rate limiting and notification service configuration.
- Modify `src/FreeQueue.Api/Controllers/QueueController.cs`: apply rate limiting and add notification opt-in endpoint.
- Create `src/FreeQueue.Api/Controllers/DisplayController.cs`: read-only display summary endpoint.
- Modify `src/FreeQueue.Api/Services/QueueService.cs`: return display summaries, emit notification checks when queue position changes, and avoid duplicate notification sends.
- Create `src/FreeQueue.Api/Services/INotificationSender.cs`: provider interface.
- Create `src/FreeQueue.Api/Services/NoopNotificationSender.cs`: development/default notification sender.
- Create `src/FreeQueue.Api/Services/TwilioNotificationSender.cs`: production sender behind configuration.
- Create `src/FreeQueue.Api/Services/NotificationService.cs`: notification eligibility and delivery orchestration.
- Modify `src/FreeQueue.Api/Data/AppDbContext.cs`: add notification fields/indexes to tickets.
- Modify `src/FreeQueue.Api/Models/QueueTicket.cs`: add notification opt-in and sent-at fields.
- Modify `src/FreeQueue.Api/DTOs/QueueDtos.cs`: add notification opt-in and display DTOs.

---

## Task 1: Add Public Display Board

**Files:**
- Create: `src/FreeQueue.Api/Controllers/DisplayController.cs`
- Modify: `src/FreeQueue.Api/Services/QueueService.cs`
- Modify: `src/FreeQueue.Api/DTOs/QueueDtos.cs`
- Modify: `customer-app/src/App.tsx`
- Modify: `customer-app/src/api.ts`
- Modify: `customer-app/src/types.ts`
- Create: `customer-app/src/pages/DisplayPage.tsx`
- Create: `customer-app/src/hooks/useDisplayHub.ts`

- [ ] **Step 1: Add backend display DTOs**

Add these records to `src/FreeQueue.Api/DTOs/QueueDtos.cs` after `QueueStatusResponse`:

```csharp
public record ServedTicketDto(
    int TicketNumber,
    string ServiceType,
    DateTime? ServedAt
);

public record DisplaySummaryResponse(
    string BranchId,
    int? CurrentTicketNumber,
    string? CurrentServiceType,
    int PeopleWaiting,
    WaitEstimateDto? WaitEstimate,
    IReadOnlyList<ServedTicketDto> RecentlyServed
);
```

- [ ] **Step 2: Implement display summary service method**

Add this public method to `src/FreeQueue.Api/Services/QueueService.cs` near `GetQueueStatusAsync`:

```csharp
public async Task<DisplaySummaryResponse> GetDisplaySummaryAsync(string branchId)
{
    var status = await GetQueueStatusAsync(branchId);

    var recentlyServed = await db.QueueTickets
        .Where(t => t.BranchId == branchId && t.Status == TicketStatus.Served)
        .OrderByDescending(t => t.ServedAt)
        .Take(5)
        .Select(t => new ServedTicketDto(t.TicketNumber, t.ServiceType, t.ServedAt))
        .ToListAsync();

    return new DisplaySummaryResponse(
        branchId,
        status.CurrentTicketNumber,
        status.CurrentServiceType,
        status.PeopleWaiting,
        status.WaitEstimate,
        recentlyServed
    );
}
```

- [ ] **Step 3: Add display controller**

Create `src/FreeQueue.Api/Controllers/DisplayController.cs`:

```csharp
using FreeQueue.Api.DTOs;
using FreeQueue.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace FreeQueue.Api.Controllers;

[ApiController]
[Route("api/display")]
public class DisplayController(QueueService queue) : ControllerBase
{
    [HttpGet("{branchId}")]
    public async Task<ActionResult<DisplaySummaryResponse>> Get(string branchId)
    {
        try { return Ok(await queue.GetDisplaySummaryAsync(branchId)); }
        catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
    }
}
```

- [ ] **Step 4: Add frontend types and API call**

Add to `customer-app/src/types.ts`:

```ts
export interface ServedTicket {
  ticketNumber: number
  serviceType: string
  servedAt: string | null
}

export interface DisplaySummary {
  branchId: string
  currentTicketNumber: number | null
  currentServiceType: string | null
  peopleWaiting: number
  waitEstimate: WaitEstimate | null
  recentlyServed: ServedTicket[]
}
```

Update the first import in `customer-app/src/api.ts`:

```ts
import type { BranchResponse, TicketResponse, QueueStatus, UndoResponse, DisplaySummary } from './types'
```

Add this method inside `api`:

```ts
getDisplaySummary: (branchId: string) =>
  request<DisplaySummary>(`/api/display/${encodeURIComponent(branchId)}`),
```

- [ ] **Step 5: Add display SignalR hook**

Create `customer-app/src/hooks/useDisplayHub.ts`:

```ts
import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'

const HUB_URL = `${import.meta.env.VITE_API_URL ?? ''}/hubs/queue`

interface Options {
  branchId: string
  onUpdate: () => void
}

export function useDisplayHub({ branchId, onUpdate }: Options) {
  const connRef = useRef<signalR.HubConnection | null>(null)
  const stableUpdate = useRef(onUpdate)
  stableUpdate.current = onUpdate

  const connect = useCallback(async () => {
    if (!branchId) return
    if (connRef.current) await connRef.current.stop()

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    conn.on('QueueAdvanced', () => stableUpdate.current())
    conn.on('WaitTimeUpdated', () => stableUpdate.current())

    conn.onreconnected(async () => {
      await conn.invoke('JoinBranch', branchId)
      stableUpdate.current()
    })

    await conn.start()
    await conn.invoke('JoinBranch', branchId)
    connRef.current = conn
  }, [branchId])

  useEffect(() => {
    connect().catch(() => {})
    return () => { connRef.current?.stop() }
  }, [connect])
}
```

- [ ] **Step 6: Add display page**

Create `customer-app/src/pages/DisplayPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useDisplayHub } from '../hooks/useDisplayHub'
import type { DisplaySummary } from '../types'

export function DisplayPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') ?? ''
  const [summary, setSummary] = useState<DisplaySummary | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!branchId) return
    try {
      setSummary(await api.getDisplaySummary(branchId))
      setError('')
    } catch {
      setError('Display unavailable')
    }
  }, [branchId])

  useEffect(() => { refresh() }, [refresh])
  useDisplayHub({ branchId, onUpdate: refresh })

  if (!branchId) {
    return <DisplayShell title="No branch selected" subtitle="Add ?branch=BRANCH_ID to the display URL." />
  }

  if (error) {
    return <DisplayShell title={error} subtitle="Check the branch ID and API connection." />
  }

  if (!summary) {
    return <DisplayShell title="Loading queue" subtitle={branchId} />
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-10 py-8 grid grid-cols-[1fr_360px] gap-8">
      <section className="flex flex-col justify-center">
        <p className="text-3xl font-semibold text-teal-light uppercase tracking-wide">Now serving</p>
        <div className="text-[220px] leading-none font-black text-teal-light">
          {summary.currentTicketNumber ? `#${summary.currentTicketNumber}` : '--'}
        </div>
        <p className="text-5xl font-bold text-white/80">{summary.currentServiceType ?? 'Queue is open'}</p>
      </section>

      <aside className="border-l border-white/10 pl-8 flex flex-col justify-center gap-10">
        <div>
          <p className="text-xl text-white/60">Waiting</p>
          <p className="text-7xl font-black">{summary.peopleWaiting}</p>
        </div>

        <div>
          <p className="text-xl text-white/60">Estimated wait</p>
          <p className="text-6xl font-black">
            {summary.waitEstimate ? `${summary.waitEstimate.estimatedMinutes}m` : '--'}
          </p>
        </div>

        <div>
          <p className="text-xl text-white/60 mb-4">Recently served</p>
          <div className="space-y-3">
            {summary.recentlyServed.map(ticket => (
              <div key={`${ticket.ticketNumber}-${ticket.servedAt}`} className="flex justify-between text-3xl font-bold">
                <span>#{ticket.ticketNumber}</span>
                <span className="text-white/50 text-2xl">{ticket.serviceType}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </main>
  )
}

function DisplayShell({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center text-center p-10">
      <h1 className="text-7xl font-black">{title}</h1>
      <p className="mt-6 text-2xl text-white/60">{subtitle}</p>
    </main>
  )
}
```

- [ ] **Step 7: Wire route**

Modify `customer-app/src/App.tsx`:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { JoinPage } from './pages/JoinPage'
import { TicketPage } from './pages/TicketPage'
import { DisplayPage } from './pages/DisplayPage'
import StaffApp from './staff/StaffApp'

export default function App() {
  return (
    <Routes>
      <Route path="/join" element={<JoinPage />} />
      <Route path="/ticket/:ticketId" element={<TicketPage />} />
      <Route path="/display" element={<DisplayPage />} />
      <Route path="/staff/*" element={<StaffApp />} />
      <Route path="*" element={<Navigate to="/join" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 8: Verify display board**

Run:

```powershell
dotnet build .\src\FreeQueue.Api\FreeQueue.Api.csproj
cd .\customer-app
npm run build
```

Expected: both commands complete with exit code 0.

Manual smoke test:

```text
Open /display?branch=<existing-branch-id>.
Call next from /staff.
The large "Now serving" number updates without a refresh.
```

- [ ] **Step 9: Commit**

```powershell
git add src/FreeQueue.Api/Controllers/DisplayController.cs src/FreeQueue.Api/Services/QueueService.cs src/FreeQueue.Api/DTOs/QueueDtos.cs customer-app/src/App.tsx customer-app/src/api.ts customer-app/src/types.ts customer-app/src/pages/DisplayPage.tsx customer-app/src/hooks/useDisplayHub.ts
git commit -m "feat: add public queue display board"
```

---

## Task 2: Add Kiosk Attract Screen And Form Timeout

**Files:**
- Create: `customer-app/src/hooks/useInactivityTimer.ts`
- Modify: `customer-app/src/pages/JoinPage.tsx`
- Modify: `customer-app/src/api.ts`

- [ ] **Step 1: Create shared inactivity hook**

Create `customer-app/src/hooks/useInactivityTimer.ts`:

```ts
import { useEffect, useRef, useState } from 'react'

interface Options {
  enabled: boolean
  timeoutMs: number
  warningMs?: number
  onTimeout: () => void
}

export function useInactivityTimer({ enabled, timeoutMs, warningMs = 0, onTimeout }: Options) {
  const [remainingMs, setRemainingMs] = useState(timeoutMs)
  const deadlineRef = useRef(Date.now() + timeoutMs)
  const timeoutRef = useRef(onTimeout)
  timeoutRef.current = onTimeout

  useEffect(() => {
    if (!enabled) {
      setRemainingMs(timeoutMs)
      return
    }

    const reset = () => {
      deadlineRef.current = Date.now() + timeoutMs
      setRemainingMs(timeoutMs)
    }

    const tick = window.setInterval(() => {
      const nextRemaining = Math.max(0, deadlineRef.current - Date.now())
      setRemainingMs(nextRemaining)
      if (nextRemaining === 0) {
        timeoutRef.current()
        reset()
      }
    }, 250)

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'pointerdown']
    events.forEach(event => window.addEventListener(event, reset, { passive: true }))
    reset()

    return () => {
      window.clearInterval(tick)
      events.forEach(event => window.removeEventListener(event, reset))
    }
  }, [enabled, timeoutMs])

  return {
    isWarning: enabled && warningMs > 0 && remainingMs <= warningMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    reset: () => {
      deadlineRef.current = Date.now() + timeoutMs
      setRemainingMs(timeoutMs)
    },
  }
}
```

- [ ] **Step 2: Add branch status API support**

Ensure `customer-app/src/api.ts` already has:

```ts
getStatus: (branchId: string) =>
  request<QueueStatus>(`/api/queue/${encodeURIComponent(branchId)}/status`, undefined, true),
```

Change it to public because the kiosk attract screen should not require staff JWT:

```ts
getStatus: (branchId: string) =>
  request<QueueStatus>(`/api/queue/${encodeURIComponent(branchId)}/status`),
```

- [ ] **Step 3: Add kiosk screen state to JoinPage**

In `customer-app/src/pages/JoinPage.tsx`, update imports:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useInactivityTimer } from '../hooks/useInactivityTimer'
import type { BranchResponse, QueueStatus } from '../types'
```

Add state inside `JoinPage`:

```tsx
const kioskMode = params.get('kiosk') === '1'
const [screen, setScreen] = useState<'idle' | 'form'>(() => kioskMode ? 'idle' : 'form')
const [status, setStatus] = useState<QueueStatus | null>(null)
```

Add reset function:

```tsx
const resetForm = useCallback(() => {
  setServiceType(SERVICE_TYPES[0])
  setName('')
  setPhone('')
  setError('')
  setLoading(false)
  setScreen(kioskMode ? 'idle' : 'form')
}, [kioskMode])
```

- [ ] **Step 4: Load live queue status for the attract screen**

Add to `JoinPage`:

```tsx
useEffect(() => {
  if (!branchId) return
  let cancelled = false

  async function loadStatus() {
    try {
      const nextStatus = await api.getStatus(branchId)
      if (!cancelled) setStatus(nextStatus)
    } catch {
      if (!cancelled) setStatus(null)
    }
  }

  loadStatus()
  const interval = window.setInterval(loadStatus, 15000)
  return () => {
    cancelled = true
    window.clearInterval(interval)
  }
}, [branchId])
```

- [ ] **Step 5: Add form timeout**

Add this after `resetForm`:

```tsx
const formTimer = useInactivityTimer({
  enabled: kioskMode && screen === 'form' && !loading,
  timeoutMs: 60000,
  warningMs: 10000,
  onTimeout: resetForm,
})
```

- [ ] **Step 6: Render attract screen before the form**

Before the final `return` in `JoinPage`, add:

```tsx
if (screen === 'idle') {
  return (
    <button
      type="button"
      onClick={() => setScreen('form')}
      className="min-h-screen w-full bg-teal-brand text-white flex flex-col items-center justify-center text-center px-8"
    >
      <p className="text-2xl font-semibold text-teal-light mb-4">{branch?.name ?? branchId}</p>
      <h1 className="text-6xl font-black mb-10">Touch to Begin</h1>
      <div className="grid grid-cols-2 gap-6 w-full max-w-xl">
        <div className="bg-white/15 rounded-2xl p-6">
          <p className="text-teal-light text-lg">Waiting</p>
          <p className="text-6xl font-black">{status?.peopleWaiting ?? '--'}</p>
        </div>
        <div className="bg-white/15 rounded-2xl p-6">
          <p className="text-teal-light text-lg">Estimated wait</p>
          <p className="text-6xl font-black">{status?.waitEstimate ? `${status.waitEstimate.estimatedMinutes}m` : '--'}</p>
        </div>
      </div>
    </button>
  )
}
```

- [ ] **Step 7: Add warning countdown in the form**

Inside the form JSX, immediately above the submit button block, add:

```tsx
{formTimer.isWarning && (
  <div role="status" className="bg-amber-50 border border-amber-brand text-amber-dark text-sm rounded-xl px-4 py-3">
    Still there? This screen will reset in {formTimer.remainingSeconds} seconds.
  </div>
)}
```

- [ ] **Step 8: Reset kiosk after successful join**

In `handleJoin`, after `localStorage.setItem(...)`, keep the current phone/customer behavior for non-kiosk users but reset the kiosk:

```tsx
if (kioskMode) {
  resetForm()
} else {
  navigate(`/ticket/${ticket.id}`)
}
```

- [ ] **Step 9: Verify kiosk mode**

Run:

```powershell
cd .\customer-app
npm run build
```

Expected: build exits 0.

Manual smoke test:

```text
Open /join?branch=<branch>&kiosk=1.
Attract screen appears first.
Tap/click it.
Leave the form idle for 50 seconds.
Warning appears.
After 60 seconds total, the form resets to attract screen.
```

- [ ] **Step 10: Commit**

```powershell
git add customer-app/src/hooks/useInactivityTimer.ts customer-app/src/pages/JoinPage.tsx customer-app/src/api.ts
git commit -m "feat: add kiosk attract and inactivity reset"
```

---

## Task 3: Make Wait Estimate The Ticket Headline

**Files:**
- Create: `customer-app/src/components/WaitEstimateHero.tsx`
- Modify: `customer-app/src/pages/TicketPage.tsx`

- [ ] **Step 1: Create wait estimate hero component**

Create `customer-app/src/components/WaitEstimateHero.tsx`:

```tsx
import type { WaitEstimate } from '../types'

interface Props {
  waitEstimate: WaitEstimate | null
  peopleAhead: number
  stage: 'far' | 'close' | 'next' | 'served' | 'cancelled'
}

export function WaitEstimateHero({ waitEstimate, peopleAhead, stage }: Props) {
  if (stage === 'next' || peopleAhead === 0) {
    return (
      <section className="text-center bg-white rounded-2xl shadow-sm p-5" role="status">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Your wait</p>
        <p className="text-4xl font-black text-teal-brand mt-1">Now</p>
      </section>
    )
  }

  if (!waitEstimate) {
    return (
      <section className="text-center bg-white rounded-2xl shadow-sm p-5" role="status">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Your wait</p>
        <p className="text-4xl font-black text-gray-700 mt-1">Calculating</p>
      </section>
    )
  }

  return (
    <section className="text-center bg-white rounded-2xl shadow-sm p-5" role="status">
      <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Estimated wait</p>
      <p className="text-5xl font-black text-teal-brand mt-1">~{waitEstimate.estimatedMinutes} min</p>
      <p className="text-xs text-gray-400 mt-2">{waitEstimate.confidence}</p>
    </section>
  )
}
```

- [ ] **Step 2: Use the hero on ticket page**

In `customer-app/src/pages/TicketPage.tsx`, add:

```tsx
import { WaitEstimateHero } from '../components/WaitEstimateHero'
```

Insert this just before the boarding-pass card:

```tsx
<WaitEstimateHero waitEstimate={ticket.waitEstimate} peopleAhead={ticket.peopleAhead} stage={stage} />
```

Remove the old small wait estimate paragraph from inside the boarding-pass card:

```tsx
{ticket.waitEstimate && ticket.peopleAhead > 0 && (
  <p className={`text-xs mt-3 ${stage !== 'far' ? 'opacity-70' : 'text-gray-400'}`}>
    ~{ticket.waitEstimate.estimatedMinutes} min estimated · {ticket.waitEstimate.confidence}
  </p>
)}
```

- [ ] **Step 3: Verify ticket page build**

Run:

```powershell
cd .\customer-app
npm run build
```

Expected: build exits 0.

Manual smoke test:

```text
Join a queue.
Open /ticket/<id>.
The largest informational number on the page is the estimated wait, followed by the ticket number.
When peopleAhead is 0, the wait headline reads "Now".
```

- [ ] **Step 4: Commit**

```powershell
git add customer-app/src/components/WaitEstimateHero.tsx customer-app/src/pages/TicketPage.tsx
git commit -m "feat: highlight ticket wait estimate"
```

---

## Task 4: Add Rate Limiting For Public Queue Endpoints

**Files:**
- Modify: `src/FreeQueue.Api/Program.cs`
- Modify: `src/FreeQueue.Api/Controllers/QueueController.cs`

- [ ] **Step 1: Add imports**

In `src/FreeQueue.Api/Program.cs`, add:

```csharp
using System.Threading.RateLimiting;
```

In `src/FreeQueue.Api/Controllers/QueueController.cs`, add:

```csharp
using Microsoft.AspNetCore.RateLimiting;
```

- [ ] **Step 2: Register fixed-window limiters**

In `Program.cs`, after `builder.Services.AddAuthorization();`, add:

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddFixedWindowLimiter("queue-join", limiter =>
    {
        limiter.PermitLimit = 2;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        limiter.QueueLimit = 0;
    });

    options.AddFixedWindowLimiter("ticket-read", limiter =>
    {
        limiter.PermitLimit = 30;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        limiter.QueueLimit = 0;
    });
});
```

- [ ] **Step 3: Enable middleware**

In `Program.cs`, place this after `app.UseCors();` and before `app.UseAuthentication();`:

```csharp
app.UseRateLimiter();
```

- [ ] **Step 4: Apply endpoint attributes**

In `QueueController.cs`, decorate the public join endpoint:

```csharp
[EnableRateLimiting("queue-join")]
[HttpPost("join")]
public async Task<ActionResult<TicketResponse>> Join(JoinQueueRequest req)
```

Decorate ticket reads:

```csharp
[EnableRateLimiting("ticket-read")]
[HttpGet("ticket/{ticketId:int}")]
public async Task<ActionResult<TicketResponse>> GetTicket(int ticketId)
```

- [ ] **Step 5: Verify backend build**

Run:

```powershell
dotnet build .\src\FreeQueue.Api\FreeQueue.Api.csproj
```

Expected: build exits 0.

Manual smoke test:

```powershell
1..3 | ForEach-Object {
  curl.exe -s -o NUL -w "%{http_code}`n" -X POST http://127.0.0.1:5000/api/queue/join `
    -H "Content-Type: application/json" `
    -d "{\"branchId\":\"localtest\",\"serviceType\":\"Deposit\",\"customerName\":\"Rate Test\",\"phone\":\"\"}"
}
```

Expected: first two requests are not 429; third request is `429`.

- [ ] **Step 6: Commit**

```powershell
git add src/FreeQueue.Api/Program.cs src/FreeQueue.Api/Controllers/QueueController.cs
git commit -m "feat: rate limit public queue endpoints"
```

---

## Task 5: Add SMS Almost-Up Notification Foundation

**Files:**
- Modify: `src/FreeQueue.Api/FreeQueue.Api.csproj`
- Modify: `src/FreeQueue.Api/Models/QueueTicket.cs`
- Modify: `src/FreeQueue.Api/Data/AppDbContext.cs`
- Modify: `src/FreeQueue.Api/DTOs/QueueDtos.cs`
- Modify: `src/FreeQueue.Api/Program.cs`
- Modify: `src/FreeQueue.Api/Services/QueueService.cs`
- Create: `src/FreeQueue.Api/Services/INotificationSender.cs`
- Create: `src/FreeQueue.Api/Services/NoopNotificationSender.cs`
- Create: `src/FreeQueue.Api/Services/TwilioNotificationSender.cs`
- Create: `src/FreeQueue.Api/Services/NotificationService.cs`
- Modify: `customer-app/src/types.ts`
- Modify: `customer-app/src/api.ts`
- Modify: `customer-app/src/pages/JoinPage.tsx`

- [ ] **Step 1: Add notification fields**

Modify `src/FreeQueue.Api/Models/QueueTicket.cs`:

```csharp
public bool SmsOptIn { get; set; } = false;
public DateTime? AlmostUpSmsSentAt { get; set; }
```

Place these after `Phone`.

- [ ] **Step 2: Update join DTO**

Modify `JoinQueueRequest` in `src/FreeQueue.Api/DTOs/QueueDtos.cs`:

```csharp
public record JoinQueueRequest(
    string BranchId,
    string ServiceType,
    string? CustomerName,
    string? Phone,
    bool SmsOptIn = false
);
```

- [ ] **Step 3: Persist opt-in**

In `QueueService.JoinQueueAsync`, set:

```csharp
SmsOptIn = req.SmsOptIn && !string.IsNullOrWhiteSpace(req.Phone),
```

inside the `new QueueTicket` initializer.

- [ ] **Step 4: Add idempotent schema updates**

In `Program.cs`, inside the existing DB schema block after the `StaffAccounts` SQL, add:

```csharp
await ctx.Database.ExecuteSqlRawAsync("""
    ALTER TABLE "QueueTickets"
        ADD COLUMN IF NOT EXISTS "SmsOptIn" BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE "QueueTickets"
        ADD COLUMN IF NOT EXISTS "AlmostUpSmsSentAt" TIMESTAMP NULL;
    """);
```

- [ ] **Step 5: Add notification sender interface**

Create `src/FreeQueue.Api/Services/INotificationSender.cs`:

```csharp
namespace FreeQueue.Api.Services;

public interface INotificationSender
{
    Task SendSmsAsync(string phone, string message, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 6: Add default no-op sender**

Create `src/FreeQueue.Api/Services/NoopNotificationSender.cs`:

```csharp
namespace FreeQueue.Api.Services;

public class NoopNotificationSender(ILogger<NoopNotificationSender> logger) : INotificationSender
{
    public Task SendSmsAsync(string phone, string message, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("SMS notification skipped for {Phone}: {Message}", phone, message);
        return Task.CompletedTask;
    }
}
```

- [ ] **Step 7: Add notification service**

Create `src/FreeQueue.Api/Services/NotificationService.cs`:

```csharp
using FreeQueue.Api.Data;
using FreeQueue.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FreeQueue.Api.Services;

public class NotificationService(AppDbContext db, INotificationSender sender)
{
    private const int AlmostUpThreshold = 2;

    public async Task NotifyAlmostUpAsync(string branchId)
    {
        var active = await db.QueueTickets
            .Where(t => t.BranchId == branchId && TicketStatus.Active.Contains(t.Status))
            .OrderBy(t => t.TicketNumber)
            .ToListAsync();

        foreach (var ticket in active)
        {
            if (!ticket.SmsOptIn || string.IsNullOrWhiteSpace(ticket.Phone) || ticket.AlmostUpSmsSentAt != null)
                continue;

            var peopleAhead = active.Count(t =>
                t.TicketNumber < ticket.TicketNumber &&
                TicketStatus.Active.Contains(t.Status));

            if (peopleAhead > AlmostUpThreshold)
                continue;

            var message = $"Hi {ticket.CustomerName ?? "there"}! You're almost up at {branchId}. Queue #{ticket.TicketNumber}. Please head back now.";
            await sender.SendSmsAsync(ticket.Phone, message);
            ticket.AlmostUpSmsSentAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
    }
}
```

- [ ] **Step 8: Register notification services**

In `Program.cs`, add after `builder.Services.AddScoped<QueueService>();`:

```csharp
builder.Services.AddScoped<NotificationService>();
builder.Services.AddSingleton<INotificationSender, NoopNotificationSender>();
```

- [ ] **Step 9: Invoke notification service after queue changes**

Change the `QueueService` primary constructor:

```csharp
public class QueueService(
    AppDbContext db,
    WaitTimeEstimator estimator,
    IHubContext<QueueHub> hub,
    IConnectionMultiplexer redis,
    NotificationService notifications)
```

Add this line before `await BroadcastQueueStateAsync(...)` in `JoinQueueAsync`, `AdvanceQueueAsync`, `CallNextAsync`, `StepAwayAsync`, `CheckInAsync`, `SkipAsync`, and `LeaveQueueAsync` where the branch ID is known:

```csharp
await notifications.NotifyAlmostUpAsync(branchId);
```

Use the method's branch variable. For ticket methods use `ticket.BranchId`.

- [ ] **Step 10: Add frontend opt-in**

Modify `customer-app/src/api.ts` join signature:

```ts
joinQueue: (branchId: string, serviceType: string, customerName: string, phone: string, smsOptIn: boolean) =>
  request<TicketResponse>('/api/queue/join', {
    method: 'POST',
    body: JSON.stringify({ branchId, serviceType, customerName, phone, smsOptIn }),
  }),
```

Modify `JoinPage.tsx` state:

```tsx
const [smsOptIn, setSmsOptIn] = useState(false)
```

Change submit call:

```tsx
const ticket = await api.joinQueue(branchId, serviceType, name.trim(), phone.trim(), smsOptIn)
```

Add this checkbox under the phone input:

```tsx
<label className="flex items-start gap-3 text-sm text-gray-600">
  <input
    type="checkbox"
    className="mt-1 h-5 w-5 accent-teal-brand"
    checked={smsOptIn}
    onChange={e => setSmsOptIn(e.target.checked)}
    disabled={!phone.trim()}
  />
  <span>Text me when I am almost up.</span>
</label>
```

When `phone` becomes blank, reset opt-in:

```tsx
onChange={e => {
  setPhone(e.target.value)
  if (!e.target.value.trim()) setSmsOptIn(false)
}}
```

- [ ] **Step 11: Verify notification foundation**

Run:

```powershell
dotnet build .\src\FreeQueue.Api\FreeQueue.Api.csproj
cd .\customer-app
npm run build
```

Expected: both commands exit 0.

Manual smoke test:

```text
Join a queue with phone and SMS opt-in checked.
Advance queue until the ticket has 2 or fewer people ahead.
API logs contain "SMS notification skipped" exactly once for that ticket.
Refreshing and advancing again does not log a duplicate notification for the same ticket.
```

- [ ] **Step 12: Commit**

```powershell
git add src/FreeQueue.Api/FreeQueue.Api.csproj src/FreeQueue.Api/Models/QueueTicket.cs src/FreeQueue.Api/Data/AppDbContext.cs src/FreeQueue.Api/DTOs/QueueDtos.cs src/FreeQueue.Api/Program.cs src/FreeQueue.Api/Services/QueueService.cs src/FreeQueue.Api/Services/INotificationSender.cs src/FreeQueue.Api/Services/NoopNotificationSender.cs src/FreeQueue.Api/Services/NotificationService.cs customer-app/src/api.ts customer-app/src/pages/JoinPage.tsx
git commit -m "feat: add sms almost-up notification foundation"
```

---

## Task 6: Add Real Twilio Sender Behind Configuration

**Files:**
- Modify: `src/FreeQueue.Api/FreeQueue.Api.csproj`
- Create: `src/FreeQueue.Api/Services/TwilioNotificationSender.cs`
- Modify: `src/FreeQueue.Api/Program.cs`
- Modify: `src/FreeQueue.Api/appsettings.json`

- [ ] **Step 1: Add Twilio package**

Run:

```powershell
dotnet add .\src\FreeQueue.Api\FreeQueue.Api.csproj package Twilio
```

Expected: `FreeQueue.Api.csproj` contains a `PackageReference` for `Twilio`.

- [ ] **Step 2: Add Twilio sender**

Create `src/FreeQueue.Api/Services/TwilioNotificationSender.cs`:

```csharp
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using Twilio.Types;

namespace FreeQueue.Api.Services;

public class TwilioNotificationSender(IConfiguration config) : INotificationSender
{
    public async Task SendSmsAsync(string phone, string message, CancellationToken cancellationToken = default)
    {
        var accountSid = config["Twilio:AccountSid"]
            ?? throw new InvalidOperationException("Twilio:AccountSid is required.");
        var authToken = config["Twilio:AuthToken"]
            ?? throw new InvalidOperationException("Twilio:AuthToken is required.");
        var fromPhone = config["Twilio:FromPhone"]
            ?? throw new InvalidOperationException("Twilio:FromPhone is required.");

        TwilioClient.Init(accountSid, authToken);

        await MessageResource.CreateAsync(
            to: new PhoneNumber(phone),
            from: new PhoneNumber(fromPhone),
            body: message
        );
    }
}
```

- [ ] **Step 3: Choose sender based on config**

Replace the `INotificationSender` registration in `Program.cs` with:

```csharp
if (builder.Configuration.GetValue<bool>("Twilio:Enabled"))
{
    builder.Services.AddSingleton<INotificationSender, TwilioNotificationSender>();
}
else
{
    builder.Services.AddSingleton<INotificationSender, NoopNotificationSender>();
}
```

- [ ] **Step 4: Add safe appsettings defaults**

Add to `src/FreeQueue.Api/appsettings.json`:

```json
"Twilio": {
  "Enabled": false,
  "AccountSid": "",
  "AuthToken": "",
  "FromPhone": ""
}
```

Keep real credentials in deployment environment variables only:

```text
Twilio__Enabled=true
Twilio__AccountSid=<account sid>
Twilio__AuthToken=<auth token>
Twilio__FromPhone=<twilio phone number>
```

- [ ] **Step 5: Verify build**

Run:

```powershell
dotnet build .\src\FreeQueue.Api\FreeQueue.Api.csproj
```

Expected: build exits 0.

- [ ] **Step 6: Commit**

```powershell
git add src/FreeQueue.Api/FreeQueue.Api.csproj src/FreeQueue.Api/Services/TwilioNotificationSender.cs src/FreeQueue.Api/Program.cs src/FreeQueue.Api/appsettings.json
git commit -m "feat: add configurable twilio sms sender"
```

---

## Task 7: Final Verification Pass

**Files:**
- Inspect all modified files from Tasks 1-6.

- [ ] **Step 1: Run backend build**

```powershell
dotnet build .\src\FreeQueue.Api\FreeQueue.Api.csproj
```

Expected: exit code 0.

- [ ] **Step 2: Run frontend build**

```powershell
cd .\customer-app
npm run build
```

Expected: exit code 0.

- [ ] **Step 3: Manual flow verification**

Run the local stack and verify:

```text
1. /join?branch=<branch>&kiosk=1 starts on "Touch to Begin".
2. The attract screen displays waiting count and estimated wait.
3. The form warns after inactivity and resets to attract screen.
4. Submitting with SMS opt-in stores the ticket and logs a no-op SMS notification when the ticket becomes almost up.
5. /ticket/<id> shows estimated wait as a headline.
6. /display?branch=<branch> updates when staff calls next.
7. Repeated POST /api/queue/join requests return 429 after the configured limit.
```

- [ ] **Step 4: Commit any verification fixes**

If verification requires corrections, commit only those corrections:

```powershell
git add <fixed-files>
git commit -m "fix: polish top queue improvement flows"
```

---

## Self-Review

Spec coverage:

- Priority 1 display board: Task 1.
- Priority 2 SMS almost-up notification: Tasks 5 and 6.
- Priority 3 idle/attract screen: Task 2.
- Priority 4 prominent wait estimate: Task 3.
- Priority 5 kiosk form timeout: Task 2.
- Priority 6 rate limiting: Task 4.

Current known partials:

- Client duplicate-submit prevention already exists through `loading` in `JoinPage.tsx`, but server-side rate limiting is missing.
- Wait estimates are already returned and displayed, but not in the recommended headline treatment.
- Phone capture exists, but notification opt-in and provider delivery are missing.

Execution order:

1. Task 4 can ship independently and reduces abuse risk quickly.
2. Task 3 is a low-risk UX improvement.
3. Task 2 changes kiosk flow and should be manually tested.
4. Task 1 adds a new public view without disrupting existing flows.
5. Tasks 5 and 6 add notification behavior; ship Task 5 with no-op sender first, then enable Twilio only after credentials and phone formatting are confirmed.

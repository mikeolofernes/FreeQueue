# FreeQueue — Improvement Research Report

> Generated from deep research across kiosk UX standards, enterprise queue management systems (Qmatic, Waitwhile, QLess, Wavetec), wait-time psychology research, and ASP.NET Core / SignalR technical documentation.

---

## Executive Summary

FreeQueue is a solid functional queue management system. Compared to enterprise-grade systems and established UX/accessibility standards, there are improvements across five areas: **kiosk UX**, **customer phone experience**, **staff tooling**, **missing features**, and **technical resilience**.

---

## 1. Kiosk UX

### 1.1 Idle / Attract Screen *(🔴 Priority 3 — implemented)*
**Gap:** The kiosk immediately shows the form. When unattended it looks like a broken screen to passersby.

**Best practice:** Return to an attract screen after 30–60 seconds of inactivity. The attract screen should:
- Display "Touch to Begin" (signals the kiosk is interactive)
- Show live queue info: current wait time, people in queue — sets expectations *before* the customer commits
- Prevent screen burn-in on permanently-on tablets

**Implementation:** Detect inactivity with `touchstart`/`mousemove`/`click` events; reset a timer; transition to `'idle'` screen after 45s.

---

### 1.2 Form Inactivity Timeout *(🔴 Priority 5 — implemented)*
**Gap:** The 30s countdown only applies to the QR screen. If a customer walks up, starts filling the form, then walks away mid-entry, the half-filled form blocks the next customer indefinitely.

**Fix:** Same event-listener idle detection on the form screen — timeout after 60s with a 10s warning countdown ("Still there?"), then auto-reset to the attract screen.

---

### 1.3 Accessibility (ADA / WCAG 2.1) *(Medium Effort)*
**Gap:** No explicit accessibility provisions.

| Requirement | Standard | Status |
|---|---|---|
| Touch target min 44×44px | WCAG 2.1 | Likely met, needs audit |
| Max kiosk reach height 48" | ADA physical | Deployment concern |
| Color contrast ratio ≥ 4.5:1 | WCAG 2.1 | Teal palette needs checking |
| Session timeout warning | WCAG 2.2 | Implemented via form timeout |
| Don't rely on color alone | WCAG 1.4.1 | Service buttons need audit |

**EU context:** The European Accessibility Act (EAA) requires kiosk compliance for products placed on market after June 28, 2025.

---

### 1.4 Duplicate Ticket Prevention *(🔴 Priority 6 — implemented)*
**Gap:** Nothing stops a customer (or bad actor) from submitting the form repeatedly, padding the queue with ghost tickets.

**Fixes implemented:**
1. Submit button disables during the full round-trip
2. Rate limiting on `POST /api/queue/join` — max 3 tickets per IP per minute (.NET 7+ `AddRateLimiter`)

---

## 2. Customer Phone Experience

### 2.1 Proactive SMS Notifications *(🔴 Priority 2 — implemented)*
**Gap:** Customers must keep the browser open. If they walk around the facility, they miss their call.

**Research backing:**
- Perceived wait time drives ~72% of queue satisfaction variance vs. only ~28% from actual wait time
- Real-time updates reduce frustration ~35% even when wait times don't change
- A well-communicated 20-minute wait produces *higher* satisfaction than a poorly communicated 10-minute wait

**Implemented:** Backend sends SMS via Twilio when a customer's ticket is called (`Near` status). Requires `Sms:AccountSid`, `Sms:AuthToken`, `Sms:FromNumber` config. Silently logs in dev/unconfigured mode.

---

### 2.2 Web Push Notifications *(Medium Effort)*
For customers without a phone number, Web Push (Service Worker + Push API) can notify them even when the browser is minimized. No app install needed. Chrome/Android and Safari iOS 16.4+ both support it.

**Flow:** On `/ticket/:id`, prompt "Notify me when I'm next?" → browser push permission → backend sends Web Push when called.

---

### 2.3 Prominent Wait Estimate on Ticket Page *(🔴 Priority 4 — implemented)*
**Gap:** `WaitEstimateDto` is returned from the backend but displayed as tiny grey text.

**Fix:** Dedicated, visually prominent wait time display on the ticket card — the key piece of information reducing perceived wait anxiety.

---

### 2.4 PWA Installability *(Low Effort)*
Add `manifest.json` and service worker to the customer app so it can be "Added to Home Screen." Returning customers (regular clinic patients, etc.) get a native app-like experience without the App Store.

---

## 3. Staff App Improvements

### 3.1 Public Queue Display Board *(🔴 Priority 1 — implemented)*
**Gap:** Customers in the waiting area have no visible display showing which number is being served. This creates anxiety — people hover near the counter, miss their call.

**Implemented:** `/display?branch=X` — a landscape-optimized read-only page for a TV/monitor showing:
- Current ticket number being served (very large)
- Queue length and estimated wait
- Live status indicator

This is a **near-universal feature** of all enterprise queue systems (Qmatic, Wavetec, Qtrac) and one of the highest-impact improvements for in-facility experience.

---

### 3.2 Analytics & Reporting Dashboard *(Medium Effort)*
**Gap:** No historical data surfaced to staff/managers.

Key metrics enterprise systems universally provide:
| Metric | Use |
|---|---|
| Average service time by service type | Staff training, counter allocation |
| Peak hours heatmap (by hour/day) | Staffing decisions |
| Wait time trend over days/weeks | Spot deterioration early |
| No-show / abandonment rate | Queue health indicator |
| Tickets served per day/week | Capacity planning |

**Implementation path:** All computable from existing `QueueTicket` + `QueueTransaction` data. Add `GET /api/branches/{id}/analytics?from=&to=` endpoint and read-only view in staff app.

---

### 3.3 Per-Service-Type Counter Routing *(Medium-High Effort)*
**Gap:** All staff share one queue. A Withdrawal customer and a New Account customer wait in the same line even if counters specialize.

**Simpler version:** Let staff filter their "Call Next" to specific service types.

---

### 3.4 Customer Satisfaction (CSAT) Feedback *(Low Effort)*
After the QR screen, before auto-reset, show a 1–5 star (or 3-emoji) "How was your experience?" prompt. Store rating against ticket. Gives managers aggregate satisfaction data per branch/day.

---

## 4. Missing Features vs. Enterprise Systems

### 4.1 Virtual / Remote Queuing *(High Value, High Effort)*
Customers join the queue *before arriving* — from their phone at home. They receive a real-time ETA and a "Head in now" notification. Eliminates physical crowding. A top-5 US bank reported 51% wait reduction in pilot branches using this approach.

### 4.2 Appointment Pre-Booking *(High Value, High Effort)*
Customers book a specific time slot in advance. On arrival, check in at the kiosk. 68% of consumers now expect pre-booking even for walk-in businesses (McKinsey 2024).

### 4.3 Ticket Number Daily Reset *(Low Effort)*
**Gap:** Ticket numbers are sequential DB integers that never reset — ticket #4721 on a Tuesday is confusing. Standard practice: reset counter to 001 each morning per branch.

**Implementation:** Compute as `ROW_NUMBER() OVER (PARTITION BY BranchId, DATE(JoinedAt) ORDER BY JoinedAt)` or a daily job.

### 4.4 Returning Customer Recognition *(Low Effort)*
When a customer enters their phone number, look up previous visits and pre-fill their name. Saves friction, feels personal.

---

## 5. Technical Resilience

### 5.1 Redis High Availability *(Medium Risk)*
**Gap:** If Redis goes down, SignalR **silently drops all real-time messages** with no buffering or retry. Customers stop seeing updates; staff actions stop broadcasting.

**Options (ascending complexity):**
1. **Redis Sentinel** — automatic failover, 1–2 day setup
2. **Redis Cluster** — horizontal sharding + HA, works with SignalR backplane without code changes
3. **Azure SignalR Service** — fully managed, removes Redis backplane + sticky session requirements entirely

### 5.2 Rate Limiting *(🔴 Priority 6 — implemented)*
`POST /api/queue/join` is public and unprotected. .NET 7+ built-in `AddRateLimiter` applied.

### 5.3 Kiosk Offline Resilience *(Medium Effort)*
If the API is briefly unreachable during a deploy, the kiosk shows a generic error.

**Fix:** PWA + Background Sync — queue ticket creation in IndexedDB if network fails; replay on reconnect. **Caveat:** Background Sync is Chromium-only — iPad (Safari) needs a client-side retry loop instead (3× exponential backoff: 2s, 4s, 8s).

### 5.4 SignalR Reconnect Indicator *(Low Effort)*
**Gap:** If a customer's phone loses connectivity, SignalR disconnects silently — stale data with no indication.

**Fix:** Expose hub connection state in `useTicketHub`; show "Reconnecting…" banner when hub is in `Reconnecting` or `Disconnected` state.

---

## Prioritized Implementation List

| # | Improvement | Effort | Impact | Status |
|---|---|---|---|---|
| 1 | **Queue display board** (`/display?branch=X`) | Low | Very High | ✅ Done |
| 2 | **SMS "you're called" notifications** | Medium | Very High | ✅ Done |
| 3 | **Idle/attract screen** on kiosk with live wait info | Low | High | ✅ Done |
| 4 | **Prominent wait estimate** on ticket page | Low | High | ✅ Done |
| 5 | **Kiosk form inactivity timeout** | Low | Medium | ✅ Done |
| 6 | **Rate limiting** on join endpoint | Low | Medium | ✅ Done |
| 7 | Analytics dashboard for staff/managers | Medium | High | Backlog |
| 8 | CSAT rating on kiosk after ticket QR | Low | Medium | Backlog |
| 9 | Ticket number daily reset (001 each morning) | Low | Medium | Backlog |
| 10 | Returning customer phone lookup / name prefill | Low | Medium | Backlog |
| 11 | SignalR reconnect indicator on ticket page | Low | Medium | Backlog |
| 12 | Redis Sentinel / HA setup | Medium | Medium | Backlog |
| 13 | Web Push notifications (no phone number needed) | Medium | High | Backlog |
| 14 | Virtual / remote queuing (join from home) | High | Very High | Backlog |
| 15 | Appointment pre-booking | High | High | Backlog |

---

## Sources

- [Kiosk UX/UI Design Checklist — Kiosk Industry](https://kioskindustry.org/kiosk-ux-ui-how-to-design-checklist/)
- [ADA Compliant Kiosk Guide — Shimeta Device](https://shimetadevice.com/ada-compliant-kiosk-accessibility-guide/)
- [Kiosk Accessibility — UserWay](https://userway.org/blog/kiosk-accessibility/)
- [Queue Psychology: 8 Ways to Make Waits Feel 50% Shorter — ScanQueue](https://scanqueue.com/blog/customer-queue-psychology)
- [How Actual and Perceived Waiting Time Affects Satisfaction — Qmatic](https://www.qmatic.com/blog/how-actual-and-perceived-waiting-time-affects-customer-satisfaction)
- [10 Best Queue Management Systems 2025 — Wavetec](https://www.wavetec.com/blog/queue-management/best-queue-management-system-review/)
- [Best Queue Management Systems 2026 — Qminder](https://www.qminder.com/blog/queue-management/best-queue-management-system-and-software/)
- [SMS Queue Management — Waitwhile](https://waitwhile.com/blog/sms-queue-management/)
- [Scaling SignalR: Strategies & Limits — Ably](https://ably.com/topic/scaling-signalr)
- [Scaling SignalR with Redis Backplane — Milan Jovanović](https://www.milanjovanovic.tech/blog/scaling-signalr-with-redis-backplane)
- [SignalR Production Hosting & Scaling — Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/signalr/scale?view=aspnetcore-10.0)
- [Redis Backplane for SignalR — Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/signalr/redis-backplane?view=aspnetcore-10.0)
- [Queue Management Analytics — QueueHub](https://queuehub.app/queue-management-system-analytics/)
- [Offline-First PWA Patterns — Rohit Raj](https://rohitraj.tech/de/notes/pwa-offline-sync)
- [Virtual Queue & Walk-in Systems — ScanQueue](https://scanqueue.com/blog/walk-ins-and-appointments-in-one-queue)

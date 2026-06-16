# Graph Report - .  (2026-06-12)

## Corpus Check
- Corpus is ~8,185 words - fits in a single context window. You may not need a graph.

## Summary
- 354 nodes · 498 edges · 28 communities (26 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.89)
- Token cost: 17,000 input · 4,200 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Customer App Core|Customer App Core]]
- [[_COMMUNITY_Queue Service Logic|Queue Service Logic]]
- [[_COMMUNITY_Queue API Endpoints|Queue API Endpoints]]
- [[_COMMUNITY_Branch Management API|Branch Management API]]
- [[_COMMUNITY_Staff UI Components|Staff UI Components]]
- [[_COMMUNITY_Customer App Dependencies|Customer App Dependencies]]
- [[_COMMUNITY_Staff App Dependencies|Staff App Dependencies]]
- [[_COMMUNITY_Auth and Infrastructure|Auth and Infrastructure]]
- [[_COMMUNITY_Customer TS Config|Customer TS Config]]
- [[_COMMUNITY_Staff TS Config|Staff TS Config]]
- [[_COMMUNITY_JWT Authentication|JWT Authentication]]
- [[_COMMUNITY_App Configuration|App Configuration]]
- [[_COMMUNITY_Real-Time Queue Ops|Real-Time Queue Ops]]
- [[_COMMUNITY_SignalR Hub|SignalR Hub]]
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_Dev Launch Settings|Dev Launch Settings]]
- [[_COMMUNITY_Dev Logging Config|Dev Logging Config]]
- [[_COMMUNITY_Claude Permissions|Claude Permissions]]
- [[_COMMUNITY_Local Settings|Local Settings]]

## God Nodes (most connected - your core abstractions)
1. `QueueService` - 24 edges
2. `QueueController` - 22 edges
3. `Task` - 20 edges
4. `compilerOptions` - 16 edges
5. `compilerOptions` - 16 edges
6. `Task` - 12 edges
7. `BranchesController` - 11 edges
8. `AuthController` - 10 edges
9. `HttpPost` - 10 edges
10. `TicketPage()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `BranchResponse` --semantically_similar_to--> `BranchResponse DTO (C#)`  [INFERRED] [semantically similar]
  customer-app/src/types.ts → src/FreeQueue.Api/DTOs/BranchDtos.cs
- `TicketResponse Interface` --semantically_similar_to--> `TicketResponse DTO (C#)`  [INFERRED] [semantically similar]
  customer-app/src/types.ts → src/FreeQueue.Api/DTOs/QueueDtos.cs
- `QueueStatus Interface` --semantically_similar_to--> `QueueStatusResponse DTO`  [INFERRED] [semantically similar]
  customer-app/src/types.ts → src/FreeQueue.Api/DTOs/QueueDtos.cs
- `WaitEstimate Interface` --semantically_similar_to--> `WaitEstimateDto (C#)`  [INFERRED] [semantically similar]
  customer-app/src/types.ts → src/FreeQueue.Api/DTOs/QueueDtos.cs
- `QueueHub` --implements--> `SignalR Real-time Queue Updates`  [INFERRED]
  src/FreeQueue.Api/Hubs/QueueHub.cs → customer-app/src/useTicketHub.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Real-time Queue Update Flow (SignalR)** — hubs_queuehub_queuehub, src_useticekthub_useticekthub, pages_ticketpage_ticketpage [EXTRACTED 0.95]
- **Customer Queue Join Flow (QR -> JoinPage -> API -> TicketPage)** — concept_qr_branch_entry, pages_joinpage_joinpage, src_api_api, pages_ticketpage_ticketpage [INFERRED 0.85]
- **Staff Authentication and Queue Management (JWT + QueueController)** — controllers_authcontroller_authcontroller, concept_jwt_staff_auth, controllers_queuecontroller_queuecontroller [INFERRED 0.85]
- **Queue Advance Full Flow: AdvanceQueue -> Redis Undo -> SignalR Broadcast** — services_queueservice_advancequeueasync, services_queueservice_pushundoasync, services_queueservice_broadcastqueuestatasync [EXTRACTED 1.00]
- **Staff Authentication Flow: LoginScreen -> API Client -> JWT Token** — components_loginscreen, staff_app_api, concept_jwt_staff_auth [EXTRACTED 1.00]
- **Real-time Queue Update Pipeline: QueueService -> SignalR Hub -> useQueueHub -> App State** — services_queueservice_broadcastqueuestatasync, concept_signalr_realtime, staff_app_usequeuehub, staff_app_app [INFERRED 0.95]

## Communities (28 total, 2 thin omitted)

### Community 0 - "Customer App Core"
Cohesion: 0.07
Nodes (27): LocalStorage Ticket Persistence, QR Code Branch Entry Pattern, api, QueueStatus, TicketResponse, WaitEstimate, TicketResponse DTO (C#), WaitEstimateDto (C#) (+19 more)

### Community 1 - "Queue Service Logic"
Cohesion: 0.16
Nodes (11): int, QueueTicket, QueueService, AddWalkInRequest, AdvanceQueueRequest, JoinQueueRequest, QueueStatusResponse, Task (+3 more)

### Community 2 - "Queue API Endpoints"
Cohesion: 0.14
Nodes (19): Authorize, BroadcastRequest, QueueController, AddWalkInRequest DTO, AdvanceQueueRequest DTO, BroadcastRequest DTO, JoinQueueRequest DTO, UndoResponse DTO (+11 more)

### Community 3 - "Branch Management API"
Cohesion: 0.11
Nodes (18): Branch, BranchResponse, BranchesController, CreateBranchRequest, AppDbContext, DbContext, BranchResponse DTO (C#), CreateBranchRequest DTO (+10 more)

### Community 4 - "Staff UI Components"
Cohesion: 0.12
Nodes (19): ElapsedTimer(), Props, LoginScreen(), Props, Props, QRModal(), Props, SERVICE_TYPES (+11 more)

### Community 5 - "Customer App Dependencies"
Cohesion: 0.09
Nodes (22): dependencies, @microsoft/signalr, react, react-dom, react-router-dom, devDependencies, autoprefixer, postcss (+14 more)

### Community 6 - "Staff App Dependencies"
Cohesion: 0.09
Nodes (22): dependencies, @microsoft/signalr, qrcode.react, react, react-dom, devDependencies, autoprefixer, postcss (+14 more)

### Community 7 - "Auth and Infrastructure"
Cohesion: 0.12
Nodes (11): JWT-based Staff Authentication Pattern, Dictionary, Docker Compose Infrastructure, double, List, StaffAccount, TicketStatus, WaitTimeEstimator (+3 more)

### Community 8 - "Customer TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 9 - "Staff TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 10 - "JWT Authentication"
Cohesion: 0.15
Nodes (12): ControllerBase, AuthController, LoginRequest DTO, LoginResponse DTO, SetPasswordRequest DTO, LoginRequest, LoginResponse, SetPasswordRequest (+4 more)

### Community 11 - "App Configuration"
Cohesion: 0.14
Nodes (13): AllowedHosts, ConnectionStrings, Postgres, Redis, Cors, AllowedOrigins, Jwt, Secret (+5 more)

### Community 12 - "Real-Time Queue Ops"
Cohesion: 0.20
Nodes (11): Redis-backed Undo Stack Pattern, SignalR Real-time Queue Broadcast, Wait Time Estimation Algorithm, QueueService.AddWalkInAsync, QueueService.AdvanceQueueAsync, QueueService.BroadcastQueueStateAsync, QueueService.CallNextAsync, QueueService.JoinQueueAsync (+3 more)

### Community 13 - "SignalR Hub"
Cohesion: 0.29
Nodes (5): SignalR Real-time Queue Updates, Hub, QueueHub, Task, useTicketHub Hook (SignalR)

### Community 14 - "Backend Dependencies"
Cohesion: 0.20
Nodes (9): net8.0, BCrypt.Net-Next (4.0.3), Microsoft.AspNetCore.Authentication.JwtBearer (8.0.4), Microsoft.EntityFrameworkCore.Design (8.0.4), Npgsql.EntityFrameworkCore.PostgreSQL (8.0.4), StackExchange.Redis (2.8.16), Swashbuckle.AspNetCore (6.6.2), System.IdentityModel.Tokens.Jwt (8.0.1) (+1 more)

### Community 15 - "Dev Launch Settings"
Cohesion: 0.20
Nodes (9): ASPNETCORE_ENVIRONMENT, applicationUrl, commandName, dotnetRunMessages, environmentVariables, launchBrowser, launchUrl, profiles (+1 more)

### Community 16 - "Dev Logging Config"
Cohesion: 0.33
Nodes (5): Logging, LogLevel, Default, Microsoft.AspNetCore, Microsoft.EntityFrameworkCore.Database.Command

## Knowledge Gaps
- **159 isolated node(s):** `allow`, `name`, `private`, `version`, `type` (+154 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `JWT-based Staff Authentication Pattern` connect `Auth and Infrastructure` to `JWT Authentication`, `Queue API Endpoints`, `Staff UI Components`?**
  _High betweenness centrality (0.186) - this node is a cross-community bridge._
- **Why does `QueueController` connect `Queue API Endpoints` to `Customer App Core`, `JWT Authentication`, `Staff UI Components`, `Auth and Infrastructure`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Why does `QueueService` connect `Queue Service Logic` to `Auth and Infrastructure`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **What connects `allow`, `name`, `private` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Customer App Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06504065040650407 - nodes in this community are weakly interconnected._
- **Should `Queue API Endpoints` be split into smaller, more focused modules?**
  _Cohesion score 0.14112903225806453 - nodes in this community are weakly interconnected._
- **Should `Branch Management API` be split into smaller, more focused modules?**
  _Cohesion score 0.10591133004926108 - nodes in this community are weakly interconnected._
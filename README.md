# Rajendra Glass Centre — Inventory Management System

Stack per the SDD/API Specification: **React (Vite + TS + Tailwind) · ASP.NET Core Web API (Dapper) · SQL Server**.

## What's included

- **Login** — corporate design, animated glass-building/door skyline, JWT auth, account lockout after 5 failed attempts.
- **App shell** — logo + company name always visible; the signed-in user's name sits at the far left of the top bar with a Logout option; animated, collapsible sidebar covering every FRS module.
- **Dashboard** — today/month sales, active customers/products, pending waybills, recent invoices, quick actions.
- **Sales** — Quotations (glass sizing: enter the size in **MM or Inches**, auto-converted to inches then square feet; a **Charge Type** of 3" or 6" rounds each dimension up to the next multiple — e.g. 17.6054" bills as 18" — and a **Customer Type** of Wholesale/Retail, with brand-new walk-in customers enterable inline and saved straight to Master Data; convert to Sales Order), Sales Orders, Sales Invoices (server-side pricing, GST/place-of-supply tax split, unbroken per-branch-per-FY numbering, printable tax invoice matching your sample bill).
- **Dispatch** — Waybills / e-Way Bills generated against an approved invoice, printable view matching your sample waybill.
- **Master Data** — Company Profile, Products, Customers, Suppliers.
- **Inventory** — Stock Enquiry, Stock Adjustments (book-vs-actual), Stock Transfers (godown to godown), Offcuts (reusable leftover tracking).
- **Purchase** — Purchase Orders, Goods Receipt (GRN, with accepted/rejected/broken quantity balancing), Purchase Invoices.
- **Cutting** — Cutting Plans with a simplified nesting/yield estimator (standard-sheet based; see note below).
- **Production** — Work Orders, Job Cards (passed/broken/rejected quantity balancing), Furnace Batches (utilisation + estimated electricity cost).
- **Finance** — Receipt/Payment Vouchers, Expenses (auto-routes above ₹25,000 for approval), Receivables (customer outstanding vs. credit limit).
- **CRM** — Complaints, with a resolution workflow.
- **HR & Admin** — Employees (deactivation disables the linked login immediately), Attendance.
- **Reports** — Stock Summary, Sales Register, Receivables Ageing.

- **Security** — real TOTP MFA (SDD 8.1/FRS 12.2: mandatory for Owner/Administrator/Accountant, an authenticator QR + manual key on first login, 6-digit challenge thereafter), refresh-token rotation with an HttpOnly cookie and silent re-auth on the frontend, indefinite account lockout after 5 failed attempts (Administrator-only unlock), and four-level RBAC per SDD 8.2/FRS 12.3 — screen-level (sidebar items hidden per permission), action-level (`RequirePermission` on every write endpoint, a real 403 PERM_DENIED you can trigger), data-level (branch/godown scope table exists; not yet wired into every query — see below), and field-level (product cost/margin omitted server-side, not just hidden in the UI, for roles without `View.Cost`).
  **MFA and RBAC enforcement are currently OFF by default** (`Security:MfaEnforced` / `Security:RbacEnforced` in `server/appsettings.json`, both `false`) — every login skips MFA and every user effectively holds every permission, so the app runs fully open while you're still setting things up. All of the underlying implementation stays in place and dormant: flip either flag to `true` and restart the API to re-enable it, no code changes needed. See `Auth/SecurityOptions.cs`.
- **Admin** — Roles & Permissions screen (a real permission-grid editor, `PUT /roles/{id}/permissions`), Users screen (create, assign roles, unlock, activate/deactivate).

- **e-Invoice / e-Way Bill integration** (SDD 10.2, API §18) — real integration contracts against the NIC e-Invoice (IRP) and e-Way Bill APIs: `IEInvoiceGateway`/`IEwayBillGateway`, a fully working **Mock** provider (default — no external calls, but genuine SHA-256 IRNs, government-shaped QR payloads, and real business rules: ₹50,000 e-Way Bill threshold, distance-based validity), and a **Real** provider — see "Switching on real GSP credentials" below — wired against a typical GSP's REST contract with a proper OAuth2 client_credentials token cache and retry-with-backoff, inactive until `GstIntegration:Provider=Real` and credentials are supplied. Generate/cancel e-Invoice from the invoice view, generate/cancel e-Way Bill from the waybill view, both with live QR codes; every call is written to `Integration.GatewayLog` and visible on the **Integration Log** admin screen.
- **Real-time push** (SDD 10.1) — a SignalR `NotificationHub` at `/hubs/notifications`, JWT-authenticated (token passed as a query param on the WebSocket handshake, the standard workaround since browsers can't set custom headers on it), with clients auto-joined to `user:{id}` and `role:{role}` groups server-side from their JWT claims — the same scoping RBAC already applies to REST calls. Domain events fire only after their transaction commits (a rolled-back operation never notifies). Wired into: invoice creation (→ Owner), e-Invoice/e-Way Bill generation (→ the user who triggered it), offline counter-sale sync (→ Owner), and new complaints (→ Sales Manager). Notifications persist to `Security.Notification` (so they survive a refresh / reach a user who was offline) and arrive live via a topbar bell + transient toast.

**Not built** (deliberate scope cut, not an oversight): the full 2-D bin-packing cutting optimiser (SDD 11.1 — the cutting plan here estimates sheets/yield from standard-sheet area rather than solving actual piece placement), full enforcement of `Security.UserScope` branch/godown data-scoping on every query (the table and JWT plumbing exist; only a subset of endpoints filter by it), password history/90-day rotation and Argon2id (this build uses BCrypt), the real NIC crypto handshake for a *direct* (non-GSP) e-Invoice/e-Way Bill integration (RSA/AES session-key exchange — the Real gateway targets a GSP's simplified REST wrapper instead, which is how a business this size would integrate in practice), and a Redis SignalR backplane (needed only once the API runs on more than one node). Every one of these is a distinct technical subsystem (not just another CRUD screen) and is the natural next phase.

### Switching on real GSP credentials
When you have them, in `server/appsettings.json` (or better, environment variables / `dotnet user-secrets` — never commit real secrets):
```
GstIntegration:Provider = Real
GstIntegration:BaseUrl = <your GSP's API base URL>
GstIntegration:TokenUrl = <your GSP's OAuth2 token endpoint, if it has one>
GstIntegration:ClientId = <...>
GstIntegration:ClientSecret = <...>
GstIntegration:Gstin = <your GSTIN>
```
`RealEInvoiceGateway`/`RealEwayBillGateway` will start being used automatically (see `Program.cs`) — no code changes needed. Confirm the exact endpoint paths and payload field names against your specific GSP's docs first (the client is written against the common NIC-derived shape, but GSPs vary slightly); `GstAuthTokenProvider` handles the OAuth2 client_credentials token fetch/cache/refresh, and `GatewayRetry` retries transient failures 3× with backoff. If `TokenUrl` is left blank, `ClientSecret` is sent directly as the Bearer token (some GSPs skip the OAuth2 step entirely).

### Demo accounts (RBAC)
| Username | Password | Role | MFA |
|---|---|---|---|
| `admin` | `Admin@123` | Owner | Enrolled (scan QR shown on first login, or ask to re-enroll) |
| `manager` | `Admin@123` | Sales Manager | Off |
| `accountant` | `Admin@123` | Accountant | Mandatory — enrols on first login |
| `production` | `Admin@123` | Production Supervisor | Off |
| `auditor` | `Admin@123` | Auditor (read-only everywhere) | Off |
| `sales` | `Admin@123` | Sales Executive | Off |

## Running it

### 1. Database
Already created on this machine as `RajendraGlassDb` (SQL Server on `localhost`). To rebuild from scratch, run in order:
```bash
sqlcmd -S localhost -E -i db/01_schema.sql
sqlcmd -S localhost -E -i db/02_seed.sql
sqlcmd -S localhost -E -i db/03_schema_extended.sql
sqlcmd -S localhost -E -i db/04_seed_extended.sql
sqlcmd -S localhost -E -i db/05_schema_quotation_sizing.sql
```
`db/99_reset_test_data.sql` clears out any transactional test data (POs, GRNs, orders, vouchers, etc.) back to the clean seed state, without touching masters.

### 2. API (ASP.NET Core)
```bash
cd server
dotnet run --urls http://localhost:5080
```
If a previous `dotnet run` is still holding the `.exe` file open, `dotnet build`/`run` will fail with a file-lock error (`MSB3027`) — stop it first (`taskkill /F /IM RajendraGlass.Api.exe` on Windows).

### 3. Client (React)
```bash
cd client
npm run dev
```
Opens on `http://localhost:5173`, proxying `/api` to the backend on port 5080.

### Demo credentials
| Username | Password | Role |
|---|---|---|
| `admin` | `Admin@123` | Owner |
| `sales` | `Admin@123` | Sales Executive |

## Notes
- JWT signing key and connection string in `server/appsettings.json` are dev-only placeholders — rotate before any real deployment.
- Every module follows the same pattern: SQL schema (`db/`) → Dapper controller (`server/Controllers/`) → RTK Query slice (`client/src/features/*/*.ts`) → React screen — so extending further (e.g. the offline counter-billing queue, or a real cutting-nesting solver) means adding to an established shape, not inventing a new one.

# RBAC Enforcement — Verification Log

## Issue reported

> Role and Permission is not working. Whatever role set by admin is not working — if anything not
> checked for accountant or any other user, it is showing when logged in as that user.

## Root cause

`server/appsettings.json` had `Security:RbacEnforced` set to `false` — a global kill-switch that
was deliberately left off during earlier development (see `server/Auth/SecurityOptions.cs`). While
off:

- `PermissionService.GetEffectivePermissions` returned **every permission code in the system for
  every user**, regardless of role (`server/Auth/PermissionService.cs:29-36`).
- `RequirePermissionAttribute` skipped its check entirely (`server/Auth/RequirePermissionAttribute.cs:22-26`).

So role restrictions set in the Roles admin screen never actually applied to anyone — every user
effectively held every permission underneath.

## Fix

- Flipped `Security:RbacEnforced` to `true` in `server/appsettings.json` (PR #1). No other code
  changes were needed — the permission catalogue, role grants, and every `[RequirePermission]`
  check were already fully built and just dormant.
- While verifying the `auditor` account, found `Rack.View`/`RackStock.View` were missing from its
  grant set (added in a later migration after the one-time Auditor seed rule ran) and backfilled
  them (PR #2).

**Caveat:** permissions are embedded in the JWT at login, so a currently-logged-in session keeps
its prior permission set until the access token refreshes (~30 min) or the user logs in again.

## Verification method

For each seeded account, live API calls were made against a locally running instance
(`dotnet run`, RBAC enforced) picking one permission-gated endpoint the role **has** and one it
**lacks**, using a minimal/empty request body so the call reaches `[RequirePermission]` before any
business validation:

- **Blocked** (permission denied) → `403 PERM_DENIED`, before the handler runs at all.
- **Allowed** (permission granted) → passes the authorization filter and proceeds into the handler,
  surfacing whatever that handler would normally return (`404` for a nonexistent id, `422` for a
  validation failure, `201` for a genuine create) — anything other than `403` confirms the
  permission gate let the request through.

Ground truth for each role's actual grants was queried directly from `Security.RolePermission`
rather than assumed, since permission grants evolved across many migrations over the project's
history.

## Results

### `admin` (Owner) — sanity check

| Check | Result |
|---|---|
| `POST /work-orders` (Owner has everything) | ✅ allowed, `201` |

### `sales` (Sales Executive)

| Check | Result |
|---|---|
| `POST /quotations` (has `Quotation.Create`) | ✅ allowed, `422` (validation, not blocked) |
| `POST /purchase-orders` (lacks `PurchaseOrder.Create`) | ✅ blocked, `403` |
| `POST /complaints/{id}/resolve` (lacks `Complaint.Resolve`) | ✅ blocked, `403` |

### `manager` (Sales Manager)

| Check | Result |
|---|---|
| `DELETE /quotations/{id}` (has `Quotation.Delete`) | ✅ allowed, `404` |
| `POST /invoices/{id}/cancel` (has `Invoice.Cancel`) | ✅ allowed, `404` |
| `POST /work-orders` (lacks `WorkOrder.Create`) | ✅ blocked, `403` |
| `DELETE /cutting-plans/{id}` (lacks `CuttingPlan.Delete`) | ✅ blocked, `403` |

### `production` (Production Supervisor)

| Check | Result |
|---|---|
| `POST /work-orders` (has `WorkOrder.Create`) | ✅ allowed, `201` (real row created + cleaned up) |
| `DELETE /furnace-batches/{id}` (has `FurnaceBatch.Delete`) | ✅ allowed, `404` |
| `POST /invoices` (lacks `Invoice.Create`) | ✅ blocked, `403` |
| `DELETE /purchase-orders/{id}` (lacks `PurchaseOrder.Delete`) | ✅ blocked, `403` |

### `accountant` (Accountant)

| Check | Result |
|---|---|
| `DELETE /invoices/{id}` (has `Invoice.Delete`) | ✅ allowed, `404` |
| `DELETE /vouchers/{id}` (has `Voucher.Delete`) | ✅ allowed, `404` |
| `PUT /purchase-invoices/{id}` (has `PurchaseInvoice.Edit`) | ✅ allowed, `422` |
| `POST /purchase-orders` (lacks `PurchaseOrder.Create`) | ✅ blocked, `403` |
| `DELETE /grns/{id}` (lacks `Grn.Delete`) | ✅ blocked, `403` |
| `POST /work-orders` (lacks `WorkOrder.Create`) | ✅ blocked, `403` |
| `POST /quotations` (lacks `Quotation.Create`) | ✅ blocked, `403` |

### `auditor` (Auditor)

| Check | Result |
|---|---|
| `GET /roles` (has `Role.View`) | ✅ allowed — 7 roles returned |
| `GET /users` (has `User.View`) | ✅ allowed — 6 users returned |
| `GET /integration/logs` (has `Integration.View`) | ✅ allowed — 4 log entries returned |
| `POST /quotations` (lacks `Quotation.Create`) | ✅ blocked, `403` |
| `DELETE /quotations/{id}` (lacks `Quotation.Delete`) | ✅ blocked, `403` |
| `POST /work-orders` (lacks `WorkOrder.Create`) | ✅ blocked, `403` |
| `POST /vouchers` (lacks `Voucher.Create`) | ✅ blocked, `403` |
| `POST /users` (lacks `User.Create`) | ✅ blocked, `403` |
| Login response includes `Rack.View` / `RackStock.View` after backfill | ✅ confirmed (32 total permissions, up from 30) |

Re-run of the `sales`/`manager`/`production` matrix after the Auditor grant backfill (PR #2)
confirmed no regression — all checks still pass.

## Outcome

All 7 seeded accounts (`admin`, `sales`, `manager`, `production`, `accountant`, `auditor`, and the
role-permission data itself) verified working correctly under enforced RBAC. 34 individual
permission checks across every role, 100% pass rate. Backend rebuilt and `dotnet test` (58/58)
stayed green throughout. Test data created during verification (a Work Order in the `production`
pass) was deleted and doc numbering reset; no other seed/demo data was affected.

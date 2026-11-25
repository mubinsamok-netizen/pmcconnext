# Payment requests loading

Branch: zoneidea-upgrade-performance. UAT remains v1.0.001.

- Initial navigation and list/ledger waiting states use responsive Skeletons, including totals. Ready data stays visible during revalidation. Global orange loading does not cover this menu; existing save/PDF button progress is retained.
- The server page reuses the Dashboard's memoized session.
- The initial list no longer waits for contractor, labor-rate or payee-suggestion preparation. These references load only when a payment form opens. Reference failures show a retry action.
- Shared payment rows are cached for 30 seconds. Contractor/labor-rate reads reuse their existing 120-second master caches. Successful PaymentRequests writes expire the payment cache; suggested payees refresh after a successful save.
- Read-only GETs skip site/master schema initialization. Write paths retain initialization, validation, amount calculations, numbering, file handling and status transitions.
- API authorization runs before any cached read. No payment is submitted or financial record changed by the automated tests.

## API contract

GET `/api/sites/:projectId/payment-requests` retains the existing full response:
`{ success, project, data, payees, contractors, labor_rates }`.

New optional views:

- `?view=list`: `{ success, project, data }`, containing only that site's payment requests.
- `?view=references`: `{ success, project, payees, contractors, labor_rates }`, preserving the existing payee suggestion behavior.

POST payloads and responses are unchanged. GET responses include Server-Timing for site_context, payment_read, contractors/labor_rates when requested, and total.

## Validation

Run `node --test tests/menu-data-cache.test.cjs tests/payment-requests-read.test.cjs`.
Tests cover deferred reference reads, site filtering, authorization before cache hits,
legacy response compatibility, cache isolation and invalidation. They mock external
services and do not establish Preview timing improvements. Compare cold/warm reads
on Preview separately before reporting speed gains in seconds.

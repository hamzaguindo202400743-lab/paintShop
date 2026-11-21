# Business Rules
1. Customer prices are always read from the database; client totals are never trusted.
2. Product stock cannot be negative.
3. Coupons are validated on the server for active state, expiry, minimum spend and usage limits.
4. Orders begin as `pending_payment` and only verified Maya events can make them `paid`.
5. Maya webhook events are idempotent using the gateway event ID.
6. Order status transitions are restricted by the backend.
7. Product deletion is soft deletion so historical order items remain intact.

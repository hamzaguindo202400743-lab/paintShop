# API contract — Base: `http://localhost:4000/api/v1`

All errors have `{ "error": { "code": "...", "message": "..." } }` and standard HTTP status codes. Protected routes use `Authorization: Bearer YOUR_JWT`.

| Method | Path | Access | Request body / output |
|---|---|---|---|
| GET | `/health` (not `/api/v1`) | Public | Health and paymentMode |
| GET | `/store/config` | Public | `{paymentMode,currency,mayaEnabled}` |
| POST | `/auth/register` | Public | `{name,email,password}` -> `{user,token}` |
| POST | `/auth/login` | Public | `{email,password}` -> `{user,token}` |
| GET | `/auth/me` | Customer/admin | User profile |
| GET | `/products` | Public | Query `search,category,minPrice,maxPrice,sort,page,limit` -> `{items,total,pages,page,limit}` |
| GET | `/products/:id` | Public | Product + `categories {id,name}` |
| GET | `/categories` | Public | Categories array |
| POST/PATCH/DELETE | `/categories`, `/categories/:id` | Admin | Category CRUD |
| GET | `/cart` | Signed in | `{items:[{id,quantity,product_id,products,unit_price,line_total}],subtotal}` |
| POST | `/cart` | Signed in | `{productId,quantity}` |
| PATCH | `/cart/:id` | Signed in | `{quantity}` (0 removes) |
| DELETE | `/cart/:id` | Signed in | 204 |
| GET | `/orders` | Signed in | Current user's orders array |
| GET | `/orders/:id` | Signed in | Order + `order_items[]` and `payments[]` |
| POST | `/orders` | Signed in customer | `Idempotency-Key` header and `{shipping,couponCode?}`; output order with `payment_method,checkout_url?` |
| GET | `/admin/dashboard` | Admin | `{paidOrders,grossSales,pendingOrders,lowStock}` |
| GET | `/admin/products` | Admin | `{items,page,limit,total,pages}`; returns archived too |
| POST | `/admin/products` | Admin | `{name,description,price,stock,category_id,image_url,active}` |
| PATCH | `/admin/products/:id` | Admin | Any permitted product fields |
| DELETE | `/admin/products/:id` | Admin | Soft-delete (`active=false`), 204 |
| GET | `/admin/orders` | Admin | Orders with payments and line items |
| PATCH | `/admin/orders/:id/status` | Admin | `{status}`; legal transitions checked in SQL |
| POST | `/admin/orders/:id/confirm-cod` | Admin | Record cash received on delivered COD |
| POST | `/webhooks/maya` | Signed Maya provider only | Valid signature + timestamp, stored atomically |

**Status rules:** COD starts at `pending_payment` with `payments.status=cod_pending`, can advance to `processing`, `shipped`, `delivered`. `cancelled` allowed only before shipping. Money collection only after delivery. Maya starts at `pending_payment` with `payments.status=maya_pending` and moves to `paid` only when webhook verified, then `processing`, `shipped`, `delivered`. Payment failure produces `payment_failed` and restores stock/coupon usage.

**Database migration is mandatory**: run `sql/01_atomic_orders.sql` in Supabase SQL Editor once. The provided original schema is not a migration and should not be rerun.

# Database
Tables: users, categories, products, cart_items, coupons, orders, order_items, payments, payment_events, coupon_uses, order_status_history.

Important constraints: unique user email, unique cart item per user/product, unique order idempotency key per user, unique gateway checkout ID, unique payment event ID, nonnegative price/stock, foreign keys for order history.

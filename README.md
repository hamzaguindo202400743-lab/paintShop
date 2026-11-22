# ColorCraft Hardware & Paint E-Commerce

A full-stack React + Express + Supabase e-commerce project for a paint/material hardware store. Payment uses Maya Checkout Sandbox. **No AI is included.**

> Important course note: the supplied ITPE101 instructional document explicitly lists a real third-party AI feature as mandatory Level 4. This build intentionally omits AI because requested; confirm with your instructor that this exception is acceptable before final submission.

## Stack
- React + Vite
- Node.js + Express
- Supabase PostgreSQL
- JWT + bcryptjs
- Maya Checkout Sandbox
- Helmet, CORS, rate limiting, Zod

## Setup
1. Create a Supabase project.
2. Run `database/schema.sql` in Supabase SQL Editor.
3. Copy `backend/.env.example` to `backend/.env` and fill Supabase + Maya values.
4. Copy `frontend/.env.example` to `frontend/.env`.
5. In `backend`: `npm install`, then `npm run seed`, then `npm run dev`.
6. In `frontend`: `npm install`, then `npm run dev`.
7. Open the Vite URL.

## Demo accounts created by seed
- Admin: admin@paintshop.test / Admin12345!
- Customer: customer@paintshop.test / Customer12345!

Change these credentials before deployment.

## Maya
The backend creates a real Maya Checkout Sandbox session and redirects to Maya's hosted checkout. The order is not marked paid by the browser redirect. Configure Maya's webhook to `https://YOUR-API/api/v1/webhooks/maya` and place both current Maya sandbox webhook public keys in the environment. Maya's current documentation says final payment status should come from webhook events, and webhook signatures use RSA-SHA256 with nonce + timestamp verification.

## Security
Never commit `.env` or expose `MAYA_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in React. Rotate any credential that has previously been exposed.

## Project structure
backend/src/config, middleware, routes, services, utils
frontend/src/api, components, pages
 database/schema.sql
 docs/architecture.md, docs/business-rules.md, docs/payment-integration.md
 postman/collection.json

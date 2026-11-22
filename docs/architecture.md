# Architecture
Browser -> React/Vite -> Express REST API -> Supabase PostgreSQL
                                  |-> Maya Checkout Sandbox

The backend is authoritative for authentication, pricing, coupons, inventory, orders and payment state. The frontend only displays data and sends user actions.

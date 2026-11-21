# Maya Checkout Sandbox
1. Customer checks out through the React UI.
2. Express recomputes the cart total from Supabase.
3. Express creates a Maya Checkout session with the server-side API integration.
4. Browser redirects to Maya's hosted sandbox page.
5. Maya redirects the browser back only as an informational return.
6. Maya sends a webhook to `/api/v1/webhooks/maya`.
7. Express validates timestamp and RSA-SHA256 signature using Maya's two public keys.
8. Event ID is stored uniquely, preventing duplicate processing.
9. Verified success updates payment and order status.

Maya sandbox API host: `https://pg-sandbox.paymaya.com`.

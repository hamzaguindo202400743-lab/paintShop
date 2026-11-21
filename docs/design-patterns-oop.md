# Patterns / OOP
MVC-style separation: routes receive HTTP requests, services own business rules, Supabase is data access.
Strategy/adapter-style separation: `maya.service.js` isolates the external payment provider from checkout business logic.
Façade concept: `order.service.js` presents one checkout operation while coordinating cart, coupon, order, stock, payment and cleanup.

For a strict course rubric requiring an abstract class plus two concrete subclasses, this JavaScript version should be expanded with provider classes before defense if your instructor checks that requirement directly.

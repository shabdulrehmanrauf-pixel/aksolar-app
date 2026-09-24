# AI assistant knowledge files

Drop `.md` or `.txt` files in this folder and the assistant automatically reads
them and treats them as background knowledge — no code change needed. This is
where a staff manual, return policy, warranty rules, or price-list notes go.

**`manual.md` already exists here** — a shop-wide user manual covering every
screen (Home, Inventory, Customers, Sales, New bill, Reports, Battery
services, Scrap, Assistant, More), the New-bill flow, udhaar/payments,
offline mode, and the shop glossary. The assistant uses it automatically to
answer "how do I…" and "what is…" questions about the app itself, not just
questions about stock and customers.

To add more (returns, warranty, price-list notes), drop another file here,
e.g. `returns-policy.md` —

```
## Returns
Batteries can be returned within 7 days with the original slip...

## Warranty claims
...
```

— and the assistant will start answering questions like "what's our return
policy?" using that text, automatically, on the next message. No need to
edit `manual.md` itself for unrelated topics — a separate file per topic is
easier to keep track of than one growing file.

## How it works (Part 1 — simple version)

Every file in this folder is read on each request and appended to the
assistant's instructions, up to a combined size limit (currently ~6,000
characters, set in `lib/ai/persona.ts`) so a large manual can't blow up Groq's
free-tier token budget or slow every reply down. `manual.md` alone uses
roughly 4,600 of that — keep any new file short, or trim `manual.md`, if you
add more.

This is intentionally simple for now: the whole file's text gets included every
time, there's no search or chunking. That's fine for a manual up to a few pages.

## When this will need upgrading

Now that `manual.md` exists, watch the combined size as you add more files —
if you're approaching the ~6,000-character limit, or the AI starts giving
vaguer answers because too much is jammed into one prompt, that's the trigger
for building real retrieval (searching the folder for the relevant bit
instead of sending everything every time). That upgrade is intentionally
**not** part of this build — do it as its own small phase later.

# AI assistant knowledge files

Drop `.md` or `.txt` files in this folder and the assistant automatically reads
them and treats them as background knowledge — no code change needed. This is
where a future staff manual, return policy, warranty rules, or price-list notes
can go once you write them.

Example: add `manual.md` here with your shop's actual rules —

```
## Returns
Batteries can be returned within 7 days with the original slip...

## Warranty claims
...
```

— and the assistant will start answering questions like "what's our return
policy?" using that text, automatically, on the next message.

## How it works (Part 1 — simple version)

Every file in this folder is read on each request and appended to the
assistant's instructions, up to a combined size limit (currently ~6,000
characters, set in `lib/ai/persona.ts`) so a large manual can't blow up Groq's
free-tier token budget or slow every reply down.

This is intentionally simple for now: the whole file's text gets included every
time, there's no search or chunking. That's fine for a manual up to a few pages.

## When this will need upgrading

If the manual grows large (many pages, multiple documents), this simple
"paste it all in" approach stops being practical — that's the trigger for
building real retrieval (searching the manual for the relevant bit instead of
sending all of it every time). That upgrade is intentionally **not** part of
this build — do it as its own small phase later, once there's an actual manual
file to test against, rather than building search logic for a document that
doesn't exist yet.

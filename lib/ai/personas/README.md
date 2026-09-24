# AI assistant personas

Each `.md` file in this folder is one persona (a personality + set of instructions)
for the AK Solar AI assistant. The assistant reads the file fresh on every request —
no rebuild or restart needed, just save the file and ask again.

## Format

```
# Display name shown in the chat

Plain-English instructions: how this persona should talk, what to focus on,
anything it should always do or never do.
```

- The **first line** must be a `# Heading` — that becomes the name shown in the chat
  header (e.g. "AK Solar Assistant").
- Everything after that is free text. Write it like you're briefing a new counter
  clerk: tone, what matters to the owner, local words to use (udhaar, khata, bill),
  what to be careful about.
- Keep it reasonably short (a few paragraphs). It is sent with every single request,
  so a long persona file eats into Groq's free-tier token limits for no benefit.

## Switching the active persona

Set this in `.env.local` (and in Vercel's project env vars):

```
AI_ASSISTANT_PERSONA=default
```

The value is the filename without `.md`. To add a new persona, copy `default.md` to
e.g. `strict-accountant.md`, edit it, then set `AI_ASSISTANT_PERSONA=strict-accountant`.

If the named file is missing, the assistant silently falls back to a plain built-in
persona rather than failing — so a typo in the env var never breaks the app.

## What personas can't do (yet)

A persona only changes **tone and instructions**. It cannot give the assistant new
abilities — it still can't create bills, edit stock, or touch the database. That
comes in a later part (see `MDF_IELES/AK-Solar-Phase10-AI-Assistant-Status.md`).

# Sapako — Repo Conventions

## Git Workflow

- `main` is production. Every push to `main` triggers CI/CD that deploys the latest code live.
- Single-contributor project — no long-lived feature/dev branches needed.
- Workflow for new work: build and test locally (not pushed to `main`) until satisfied, then push straight to `main`.
- The `dev` branch is obsolete under this workflow and can be deleted.

## Customer Release Notes

Dvir periodically sends the customer (a non-technical supermarket owner/staff)
a plain-language summary of what's changed in the app. The working draft for
the *next* batch lives at `docs/release-notes/draft.md`.

- **Whenever a change is something the customer's employees would notice** —
  a new feature, a UI change, a changed workflow, a bug fix they'd have seen —
  add a one-line Hebrew bullet to `draft.md` as part of finishing that task,
  before considering it done. Don't wait to be asked.
- Write it for a non-technical reader: plain Hebrew, no jargon, no ticket
  numbers, no technical terms. Describe what they'll notice, not how it was
  built.
- One bullet per user-visible change, kept short. Easier to trim or merge
  later than to un-merge.
- **Do NOT add anything for backend-only/infra changes the customer can't
  see or wouldn't care about** — performance work, logging/monitoring,
  security hardening, refactors, dependency bumps, database migrations,
  moving hosting providers, etc. When in doubt: would a non-technical shop
  owner notice or care? If no, it doesn't belong here.
- When Dvir asks to see or send the notes (e.g. "show me", "I want to send
  it"), show the current contents of `draft.md` and help him edit it in chat.
- Once Dvir confirms it was sent, clear `draft.md` back to just its header
  comment — no archive is kept, accumulation starts over.

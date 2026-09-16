# Sapako — Repo Conventions

## Git Workflow

- `main` is production. Every push to `main` triggers CI/CD that deploys the latest code live.
- Single-contributor project — no long-lived feature/dev branches needed.
- Workflow for new work: build and test locally (not pushed to `main`) until satisfied, then push straight to `main`.
- The `dev` branch is obsolete under this workflow and can be deleted.

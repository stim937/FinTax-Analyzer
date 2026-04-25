# AGENTS.md

This file provides Codex-specific operating guidance for this repository.

## Communication

- Respond in Korean.
- Be concise and execution-oriented.
- Prefer making the change over only describing it.

## Default workflow

1. Read the relevant files before editing.
2. Prefer small, targeted changes.
3. Verify with the lightest useful command.
4. Summarize what changed and any remaining risk.

## Commands

```bash
npm run dev       # Start Vite dev server only (http://localhost:5173)
npm run dev:api   # Start Vercel Functions locally (http://localhost:3000)
npm run dev:full  # Windows integrated flow: load .env.local and start App + API
npm run publish:pr -- "chore: 변경 설명"  # Stage, commit, push, and open a draft PR
npm run publish:merge -- "fix: 변경 설명"  # Stage, commit, push, open PR, merge into main, delete remote branch
npm run build     # Production build
npm run preview   # Serve production build locally
npm run lint      # Run ESLint
```

No test framework is configured, so use `npm run lint` and `npm run build` as the primary verification steps when relevant.

## Editing rules

- Preserve the existing tab-based structure unless a refactor is clearly necessary.
- Keep tax logic changes centralized in `src/utils/taxCalc.js` when possible.
- Avoid broad renames or large structural churn unless the task requires it.
- Do not commit generated logs or local-only artifacts.
- Treat `run-dev-with-api.bat` as a convenience wrapper, not the main implementation.
- When the user asks to publish work as a PR after code changes, prefer `npm run publish:pr -- "<commit message>"` over manually repeating git and gh steps.
- When the user asks to merge work into `main`, keep the current working branch and run the current-branch flow: commit on the current branch, push it, create a non-draft PR to `main`, merge with GitHub's normal merge method, then delete the remote work branch. Prefer `npm run publish:merge -- "<commit message>"` for that flow.

## Git workflow

- Start new code changes by fetching `origin` and creating a separate `codex/...` working branch from `origin/main`.
- Do not check out local `main` just to start work; it may already be checked out by another worktree.
- Do not create a new branch when the user explicitly asks to continue or merge the current named branch.
- If the worktree is on detached HEAD and the user asks to merge, first create a `codex/...` branch from the current HEAD, then use that branch for the merge flow.
- When the user asks to merge into `main`, use the current working branch: commit on the current branch, push it, create a non-draft PR to `main`, merge with a normal merge commit, then delete the remote working branch.

## Where to work

- `src/App.jsx` - shared app state and tab navigation
- `src/components/` - feature UI and calculators
- `src/components/Auth/` - auth-related screens
- `src/components/ui/` - reusable UI helpers
- `src/lib/supabase.js` - Supabase wiring
- `src/utils/taxCalc.js` - tax engine
- `api/market/stock.js` - stock market proxy
- `api/market/bond.js` - bond market proxy

## Local development notes

- `npm run dev` alone does not serve `/api/*`.
- Use `npm run dev:full` when frontend and API need to run together on Windows.
- Use `npm run dev:api` separately when focusing only on the Vercel side.

## Environment

Expected local values in `.env.local`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `KIS_APP_KEY`
- `KIS_APP_SECRET`
- `BOK_API_KEY`

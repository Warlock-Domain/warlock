# Workflow: agents, PR environments, pipelines and publishing

Part of the index in the root [CLAUDE.md](../CLAUDE.md). The full contributor guide (machine setup, prompts, tests, common problems) is [CONTRIBUTING.md](../CONTRIBUTING.md).

## Working with an agent

Skills (plugins `superpowers@claude-plugins-official` and `ponytail@ponytail`): brainstorming before anything new → writing-plans for multi-step work → TDD in `src/shared` → systematic-debugging before fixing a bug → verification-before-completion before saying it is done → `/ponytail-review` on the diff before the PR. Use `/pr-review` (Claude Code) or `$pr-review` (Codex) to review a PR with the shared criteria in `.agents/skills/pr-review/SKILL.md`; that review neither posts comments nor approves on its own.

Pitfalls: after `vite build`, restart `wrangler dev` (otherwise a blank page/404); work on a branch of this repository, not a fork (on a fork CI waits for manual approval and the automatic review does not run); every PR (drafts too) publishes to `https://pr-<n>-warlock.fernandorffdev.com`.

## PR environment

Every PR from this repository, drafts too, publishes to `https://pr-<n>-warlock.fernandorffdev.com` (`.github/workflows/pr-env.yml`, its own `warlock-pr-<n>` Worker and rooms, smoke test at the end). A pinned PR comment carries the link and the live commit, edited on every push. When the PR closes (merged or not) the domain and the Worker are deleted and the comment says so; reopening publishes again. To test with the group before it is ready, open the PR as a draft. Fork PRs get no environment (no secrets). Free plan limit: 100 Workers per account and 100 custom domains per zone, open PRs plus the live game.

## Environment flow

**task branch → PR to `master` → live** (Fernando's decision, 20/10; the general dev branch left the flow):

1. Task branch (`feat/…`, `fix/…`) from `master`; to test with other people, open the PR as a draft: it gets its own link. When ready, leave draft; an agent that cannot test in a browser leaves draft all the same and writes in the PR what it did not test and how to test it (the review tests in the PR environment).
2. Task PR to **`master`** (the default branch), *squash and merge*. Balance changes only after the simulation is approved.
3. On merge, the **Production** pipeline publishes to https://warlock.fernandorffdev.com. No promotion, no general dev.

## Pipelines

| Pipeline | File | When it runs | What it does | If it fails |
|---|---|---|---|---|
| CI | `ci.yml` | every PR and every push to `master` | the three `tsc` runs, `vitest run`, `vite build` | the PR does not get in; open the log in Actions and fix it on the same branch |
| PR title | `pr-title.yml` | when the PR is opened or edited | checks the `type: what changes` format | edit the title; it runs again by itself |
| Claude review | `claude-review.yml` | PR opened, new commit, left draft | comments in English with blockers/nits; the `review` check, required on `master`, fails while there is a blocker (it neither approves nor merges) | does not run on forks |
| PR environment | `pr-env.yml` | PR opened, new push, reopened and closed (only PRs from this repository) | builds, publishes `warlock-pr-<n>` at `pr-<n>-warlock.fernandorffdev.com`, waits for the domain, runs the smoke test and edits the pinned comment with the link; on close, deletes the Worker (the domain goes with it) | broken build: nothing is published and the previous PR version stays; smoke test failed: the new version is already live with a problem, see the log; cleanup failed: the Worker stays up, re-run the job in Actions |
| Production | `deploy.yml` | push to `master` (task PR merge) | gates, publishes the live game, checks the site serves the new build and runs the smoke test | failed before deploy: nothing changes live; failed after: the live game has the new version, see the log |

Logs: https://github.com/Warlock-Domain/warlock/actions.

## Git

Full flow in [CONTRIBUTING.md](../CONTRIBUTING.md): one branch per task from `master` (`feat/`, `fix/`, `balance/`, `style/`, `docs/`, `refactor/`), English commits with the type prefix (`feat: …`), pull request using the template in `.github/`, green CI (`.github/workflows/ci.yml`: all three `tsc` runs, `vitest`, `vite build`), then *squash and merge*. Task PRs go directly to `master`. Agents must never push directly to `master`; open a PR.

## Publishing

Automatic: a merge into `master` publishes the live game through the **Production** pipeline (`deploy.yml`), with gates, a check of the served `index-*.js` and a smoke test. Publishing by hand (`npx vite build && npx wrangler deploy`) only in an emergency, by someone with the Cloudflare account.

# Contributing to Warlock Wars

This is the contributor guide for humans and AI agents. It covers setup, coordination, implementation, testing, review, and publication. Read [CLAUDE.md](CLAUDE.md) for the current code rules and the index of smaller documents, [docs/DECISIONS.md](docs/DECISIONS.md) before changing gameplay or undoing a decision, then the `CLAUDE.md` in each area you change. Each `AGENTS.md` points to those same rules.

- [Play the game](https://warlock.fernandorffdev.com): try a few matches, the grimoire (F1), and the spell/item library (F2) before changing gameplay.
- [Repository](https://github.com/Warlock-Domain/warlock): `master` is the live game. Contributors work on task branches in this repository.

## Getting started

1. Accept the [Warlock-Domain organization invitation](https://github.com/orgs/Warlock-Domain/invitation). Members of the Colaboradores team have write access to this repository.
2. Install Node.js **24**, the version used by CI, plus Git and the GitHub CLI (`gh`). Install Google Chrome for browser checks.
3. Clone the repository and start the local server:

   ```bash
   git clone https://github.com/Warlock-Domain/warlock.git
   cd warlock
   npm ci
   npx wrangler dev
   ```

   The game runs at `http://localhost:8787`. Wrangler runs Workers and Durable Objects locally; development does not require a Cloudflare account. Use another tab with `?as=another-player` to simulate a second person on the same machine.

   The forum at `/forum` needs sign-in secrets in a `.dev.vars` file (git-ignored). Without them it shows "sign-in is not set up". To try it without GitHub, write `FORUM_SESSION_KEY=<any long random text>` and `FORUM_TESTER=1`, which turns on "sign in as tester". GitHub sign-in uses the org's localhost OAuth app instead: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `FORUM_SESSION_KEY` and `FORUM_ORIGIN=http://127.0.0.1:<port>`, because `wrangler dev` rewrites the request host to the live domain.
4. Choose a small issue, such as one labeled `bom primeiro PR`, and agree on its scope before implementing it. Check its assignee and any linked work first.

## Architecture and where to work

Warlock Wars is a browser remake of Warlock / Warlock Brawl. Players use spells to push opponents into lava; rounds alternate with progression through the shop or Ascension cards. The interface follows Dota conventions. Campaign adds cooperative encounters and has its own design and spell balance.

| Area | Responsibilities and guide |
|---|---|
| [`src/shared`](src/shared/CLAUDE.md) | Deterministic simulation (`sim.ts`), spells/items, bots, match phases/economy, Ascension, Campaign/bosses/maps, protocol validation, snapshots, appearance, and telemetry. |
| [`src/client`](src/client/CLAUDE.md) | Three.js rendering, DOM UI, input/controllers, sound, preferences, localization, prediction/interpolation, grimoire/demos, character preview, challenges, and coaching. |
| [`src/worker`](src/worker/CLAUDE.md) | Cloudflare Workers, one Durable Object per room, lobby listing, WebSockets, persistence, and telemetry endpoints. |
| [`scripts`](scripts/CLAUDE.md) | Balance simulation, build tournaments, browser/connection checks, and asset tools. |
| [`tests`](tests/CLAUDE.md) | Vitest behavior/regression tests and shared test helpers. |
| [`docs/ASSETS.md`](docs/ASSETS.md) | Asset catalog, origin, usage, licenses, and visual identity. |

The server is authoritative. Shared gameplay runs at 60 steps per second, with snapshots sent at 30 per second. The client predicts its own movement and interpolates other entities. In the shared simulation, the world is intentionally mutated in place; preserve its RNG and operation order.

Use the decision register in [docs/DECISIONS.md](docs/DECISIONS.md) and the in-game rules as the current source for modes, controls, spell groups, items, and balance exceptions. Keep contributor instructions here, area-specific implementation guidance in the area's `CLAUDE.md`, and feature designs and plans in [`docs/plans/`](docs/plans/README.md). This avoids maintaining competing copies of changing gameplay tables.

## Issues and coordination

Use the repository's [Bug or Idea templates](https://github.com/Warlock-Domain/warlock/issues/new/choose). Blank issues are disabled.

| Template | Include |
|---|---|
| **Bug** | Actual and expected behavior, reproduction steps, browser/device, and useful screenshots or video. |
| **Idea** | The idea, motivation, proposed behavior or reference, and whether you intend to implement it. It starts with `precisa de decisão`. |

Use one subject per issue. Issue titles describe the problem or idea without a commit prefix; `feat:` and `fix:` belong in PR titles. Assign yourself before starting an unowned issue. If it is already assigned, coordinate with its owner. Remove your assignment if you stop working on it. The implementation PR uses `Closes #123`, `Fixes #123`, or `Resolves #123` so GitHub closes the issue after merge.

Labels route work to the theme boards:

| Board | Label |
|---|---|
| [General](https://github.com/users/fernandorff/projects/3) | All issues |
| [Balance](https://github.com/users/fernandorff/projects/4) | `balanceamento` |
| [Gameplay](https://github.com/users/fernandorff/projects/5) | `jogabilidade` |
| [Interface](https://github.com/users/fernandorff/projects/6) | `visual` |
| [Bug fixes](https://github.com/users/fernandorff/projects/7) | `bug` |
| [Documentation and workflow](https://github.com/users/fernandorff/projects/8) | `documentação` |

Other labels include `ideia`, `bom primeiro PR`, and `precisa de decisão`. The `code-health` label groups the repository audit backlog. Add an issue to its theme board and move it through **Precisa de decisão → A fazer → Fazendo → Em revisão → Feito** as work progresses.

Admin sessions also check the private [Admins board](https://github.com/orgs/Warlock-Domain/projects/1) before starting a task. Create a card with an owner and **Fazendo** status; move it to **Em teste** or **Feito** when appropriate. If another admin is already doing the same work, coordinate with that owner. This board is the coordination source because the Telegram bots cannot read each other's messages. Fernando is the organization owner; Fernando and Arthur are on the Admins team.

## Large changes: decide before implementing

Small bug fixes, text corrections, and focused interface/visual adjustments can go directly through normal PR review. A change is large when it changes a spell, item, rule, mode, control, or balance number; removes an existing feature; or takes more than a day. If the scope is unclear, discuss it with the group.

1. Open an **Idea** issue with `precisa de decisão` and share its link with the group. Keep the discussion in the issue.
2. Allow roughly two days of discussion. Fernando makes the final decision, considering the feedback; mode-specific ownership is recorded in [docs/DECISIONS.md](docs/DECISIONS.md).
3. Record the decision and rationale in the issue, remove the decision label, and add a row to [docs/DECISIONS.md](docs/DECISIONS.md). Large work also gets a design document in [`docs/plans/`](docs/plans/README.md), listed in its index.
4. Implement the agreed scope and link the PR to the issue. A large PR without a decision waits with `precisa de decisão`.

A local proof of concept uses a `poc/<topic>` branch and screenshots without an issue or PR. It becomes an issue/PR after Fernando decides it is worth pursuing. The decision register also allows an immediate adjustment explicitly requested by Fernando to go straight to a task branch and PR; the PR records the request. Issues are used for work that needs agreement or belongs in the backlog.

## Branches, commits, and pull requests

The release flow is **task branch → PR to `master` → automatic production deployment**. The former `dev` promotion flow is retired.

1. Create a branch from current `master`: `feat/<topic>`, `fix/<topic>`, `balance/<topic>`, `style/<topic>`, `docs/<topic>`, or `refactor/<topic>`. One branch/PR covers one subject.
2. Use a branch in this repository when you have contributor access. Fork PRs require CI approval, do not get the automatic review, and cannot use deployment secrets or PR environments.
3. Make small commits using an English `type: description`. Accepted types are `feat`, `fix`, `balance`, `style`, `refactor`, `docs`, `ci`, and `test`. Agent commits do not add `Co-Authored-By` trailers.
4. Run `npm run typecheck`, `npx vitest run`, and `npx vite build` before committing. Add meaningful regression coverage for behavior changes and verify changed screens in the browser.
5. Open the PR against `master` using [.github/pull_request_template.md](.github/pull_request_template.md): motivation, changes, screenshots when relevant, validation, and balance evidence when required. Use `Closes #n` for its issue. The title follows the same `type: description` format and becomes the squash commit title.
6. Before the first push for a PR and before every later push to its branch, run `/pr-review` (Claude Code) or `$pr-review` (Codex) on the full diff against its base. Resolve every **Blocker** before pushing; **Nits** are optional and must not hold a PR. After each merge to `master`, keep the branch current with `git fetch origin` and `git merge origin/master`, rerun the gates, and restart the local server. Once review starts, respond with new commits rather than rebasing or force-pushing.
7. Reviewers use the project's criteria, and approved PRs enter `master` through **squash and merge**. The branch is then deleted and Production deploys automatically.

The `master` branch requires a PR, green CI, and a valid title. Do not push directly to it or force-push. The owner can override approval on their own PR as an administrator; this does not replace the review/test rules.

### Review and owner approval

The automated Claude review posts its findings in English. It runs on Claude Opus 5.5 at high effort, and each comment carries a **Ruler** line quoting `.agents/skills/pr-review/SKILL.md` as proof that the shared checklist was read. The `review` status check is required by `master` protection and fails while any **Blocker** remains; **Nits** are optional and do not prevent merge. The bot never approves or merges. Mention `@claude` in a PR or issue for help. An authorized owner agent can adjust and merge collaborator PRs after blockers are resolved and required human gates pass.

- Small collaborator PRs can be approved/merged by review without waiting for Fernando.
- Large collaborator PRs require Fernando's approval on the PR as well as the issue decision.
- Behavior-changing code from Fernando's own agent sessions also requires his approval of the prepared localhost test before merge. Collaborator PRs and documentation/CI-only PRs do not use that localhost approval step.
- Work that does not change game behavior, including refactoring/cleanup, does not require a test tab or a separate localhost approval. It still needs green gates and diff review; screen-affecting refactors need matching before/after PC screenshots.

## Working with AI agents

Start each task by reading root and area-specific guidance and the issue's acceptance criteria. Understand the intended outcome, plan multi-step work, implement the smallest coherent change, verify it, and ask an independent reviewer to challenge the diff. Use a separate worktree per task.

Claude Code plugins used by this project:

```text
/plugin marketplace add anthropics/claude-plugins-official
/plugin install superpowers@claude-plugins-official
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
# Optional
/plugin install frontend-design@claude-plugins-official
/plugin install playwright@claude-plugins-official
```

| Skill | Use |
|---|---|
| `superpowers:brainstorming` | Clarify a new feature before implementation. |
| `superpowers:writing-plans` | Plan steps, files, and verification for substantial work. |
| `superpowers:test-driven-development` | Add behavior coverage for shared gameplay logic. |
| `superpowers:systematic-debugging` | Reproduce a bug and find its cause before fixing it. |
| `superpowers:verification-before-completion` | Run the relevant check before declaring completion. |
| `ponytail` / `/ponytail-review` | Check necessity, reuse, and excess code while implementing and before the PR. |
| `/pr-review` (Claude Code) / `$pr-review` (Codex) | Independently review a PR using [.agents/skills/pr-review/SKILL.md](.agents/skills/pr-review/SKILL.md). Public actions still require task authorization. |

Project rules take precedence over plugin guidance. Useful task prompts:

```text
Read CLAUDE.md and CONTRIBUTING.md. I want [outcome]. Read the linked issue and clarify
missing acceptance criteria before coding. Use existing UI pieces and do not change
spell/item balance without the required simulator evidence.
```

```text
Bug: [actual behavior], expected [behavior], steps [steps]. Reproduce it, identify the
cause, make a focused fix, and run all required verification. Open a PR to master using the template.
```

## Code rules that every change must satisfy

- Keep the simulation deterministic: use the received RNG, preserve draw order, and explain intentional changes to the seeded `tests/style.test.ts` event hash.
- Validate new client messages in `parseClientMessage`; the server remains authoritative.
- Use `t('português', 'English')` for visible text; use `spellName`, `itemName`, and `arenaName`, and format numbers with `LOCALE`.
- Reuse `el`, `dialog`, `iconButton`, `tabs`, `choice`, `searchFilter`, `withTip`, and `store`. Extend a suitable UI piece before adding another; document a new piece in `src/client/CLAUDE.md`. Use `:root` color/size variables.
- Write new or updated code comments in English. Translate relevant legacy Portuguese comments when changing their code; leave unrelated comments untouched. Existing documentation will be translated after all currently open PRs merge.
- When editing a test file, translate all suite/test names (`describe`, `it`, `test`) and explanatory comments throughout that file to English, including legacy ones. Preserve localized fixtures and expected UI strings in the language each test requires.
- Keep changes surgical. Explain non-obvious decisions with a short English comment about why. Update a comment when its decision changes; keep imports at the top.
- Put testable UI decisions in pure modules such as `screen-data.ts`; `ui.ts` touches browser globals during import and is not a Vitest entry point.
- Spell behavior comes from documented general stats. Do not introduce interactions specific to a pair of spells; follow the decision register.
- Never commit secrets. The repository is public.
- New assets require a license permitting the intended use/redistribution, a credit in `public/CREDITS.txt`, and origin/usage/license documentation in [docs/ASSETS.md](docs/ASSETS.md). Follow documented owner-authorized asset exceptions. Check `assets/kaykit/` and its [index](assets/kaykit/INDICE.md) before sourcing new models.
- Mobile optimization is currently outside the project's focus. Preserve existing mobile media queries; routine screenshots target PC.

## Required verification

All repository checks must pass before a commit:

```bash
npm run typecheck
npx vitest run
npx vite build
```

Run a focused test while developing, for example `npx vitest run tests/bots.test.ts` or `npx vitest run -t 'Ilusão'`, then complete the gates. A bug regression should fail on the original behavior. Seed simulation tests and keep helper conventions from [tests/CLAUDE.md](tests/CLAUDE.md).

### Browser checks

For changed UI, check PC at **1280×720 and 1920×1080**, in Portuguese and English, with no console errors. Capture before/after screenshots. Change language through Settings or `localStorage['warlock:lang'] = 'pt' | 'en'` and reload. A gameplay change needs a relevant playable check even if the screenshot looks unchanged.

```bash
npx wrangler dev
node scripts/play-headless.mjs http://localhost:8787 prints/
node scripts/multi-headless.mjs http://localhost:8787 prints/
node scripts/smoke.mjs http://localhost:8787
node scripts/ghost-socket.mjs http://localhost:8787
```

The browser scripts use installed Chrome and a temporary profile. Set `PW_CHANNEL=chromium` after installing it with `npx playwright-core install chromium` to use Chromium, or `PW_PROFILE=<directory>` for a persistent test profile. The ghost-socket check takes roughly six minutes. Use the sandbox, bot matches, challenges, and `?as=<name>` for manual reproduction.

When preparing a test for a person:

1. Open a separate Chrome/Edge test profile, with remote debugging bound to localhost. A separate profile is required by recent Chrome versions. Example on Windows:

   ```powershell
   & 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' --user-data-dir="$HOME\warlock-testes" --remote-debugging-port=9333 --remote-debugging-address=127.0.0.1 --no-first-run 'http://localhost:8787/?aba=my-change&ir=sandbox'
   ```

2. Use `?aba=<task-name>` to label the tab and `?ir=<place>` to land at the changed behavior. Examples: `sandbox`, `partida:loja`, `partida:ascensao`, `config:som`, or `sandbox,config:som`. The supported values are documented in `src/client/main.ts`; these shortcuts work on localhost and PR environments. `?apelido=<name>` can skip the name prompt there.
3. Localhost starts music muted for a new profile. Audio tests can use `?musica=1`. Keep embedded browser panels muted while inspecting non-audio work.
4. Give three to five short steps with expected results. Temporary localhost-only notes can point at the change; keep those notes outside the commit.
5. Close your own test tabs and stop your server when finished. The debugger exposes test tabs at `http://127.0.0.1:9333/json/list` and closes one with `/json/close/<id>`. Old tabs can display `❌ FECHAR` after a newer tab opens on the same port or the server stops.

Documentation/CI and behavior-preserving cleanup do not require a test tab. Refer to the review rules above for screenshot requirements.

## Balance changes

Balance decisions come from the simulator. The primary measure is **gold-adjusted win rate**, where 1.00 means the fair share; the accepted range is **0.85–1.15 on Normal and Hard**. Fun targets include 60–120-second rounds, at least 60% of deaths credited to hits, and each purchasable spell/item used by at least 4% of bots. Fireball is the baseline. Campaign has its own spell book; read its owner decisions before changing PvE numbers.

```bash
node scripts/balance-sim.ts --minutes 20 --seed 1 --difficulty normal --out balance/x/p1
node scripts/balance-sim.ts --minutes 20 --seed 2 --difficulty normal --out balance/x/p2
node scripts/balance-sim.ts --merge --difficulty normal --out balance/x/total balance/x/p1 balance/x/p2
```

Run the corresponding Hard samples as well. Reports are in each output directory's `report.md`; `balance/` is ignored by Git. Conclusions need tens of thousands of rounds per difficulty: a small sample can vary by ±0.02–0.03. Report sample sizes and before/after results in the PR. Document explicit owner exceptions from [docs/DECISIONS.md](docs/DECISIONS.md).

If a number does not respond to changes, inspect bot behavior: perfect reactions previously masked cooldown changes. `build-tournament.ts` looks for dominant purchase combinations; report its findings before adjusting them. Historical measurements in the decision register are context, not proof of current balance.

## PR environments and pipelines

Every same-repository PR, including drafts, publishes an isolated game at `https://pr-<n>-warlock.fernandorffdev.com`, with its own Worker and rooms. A pinned comment contains the link and deployed commit and updates after pushes. Closing the PR removes the environment; reopening recreates it. Fork PRs do not receive an environment.

Use a draft while work is in progress or the group is trying it. Once gates pass and available validation is complete, mark it **Ready for review**. If your agent cannot use a browser, state exactly what remains untested and how to check it; the reviewer uses the PR environment. Do not leave completed work in draft solely because the agent cannot take screenshots.

| Pipeline | Trigger and behavior |
|---|---|
| **CI** (`ci.yml`) | Every PR and push to `master`; runs both type checks, Vitest, and Vite. Failures block entry. |
| **Título do PR** (`pr-title.yml`) | PR open/edit; checks `type: description`. Edit a bad title and it reruns. |
| **Revisão do Claude** (`claude-review.yml`) | Eligible non-draft PR open/update/ready/reopen; posts findings without approving or merging. It is advisory and does not run on forks or a PR changing that workflow. |
| **@claude** (`claude.yml`) | Responds to a mention in PR/issue comments. |
| **Ambiente do PR** (`pr-env.yml`) | Builds and deploys the PR environment, checks its domain and smoke test, updates the pinned comment, and removes the Worker/domain after close. |
| **Produção** (`deploy.yml`) | Push to `master` after merge; runs gates, deploys production, verifies the served build, and runs smoke checks. |

See [Actions logs](https://github.com/Warlock-Domain/warlock/actions) and [pipeline details](docs/WORKFLOW.md#pipelines). A build failure leaves the previous deployment in place. A post-deployment smoke failure means the new deployment is already serving a problem: inspect its logs. If PR-environment cleanup fails, rerun that cleanup job. Production is published automatically; manual deployment is reserved for an authorized emergency.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Blank page or 404 after `vite build` | The build replaced `dist/`; restart `wrangler dev`. |
| Dependency engine warning / native tooling fails to start | Confirm the shell and `npm ci` use Node 24, matching CI. |
| Deterministic hash test fails | Determine whether gameplay changed intentionally; explain an intentional hash update in the PR. |
| Flaky bot result | Increase the simulation sample rather than weakening the assertion. |
| PR title rejected | Use `type: description`. |
| Push to `master` rejected | Create a task branch and PR. |
| CI awaits approval | Check whether the PR is from a fork. |
| Windows LF/CRLF warning | This is normal; avoid unrelated formatting changes. |
| Portuguese text while playing in English | Check `t()` and the naming/number-format helpers. |

## Before requesting review

- [ ] One subject, correct branch/base and title, completed PR template, and `Closes #n` when applicable.
- [ ] Four green gates and meaningful behavior/regression coverage.
- [ ] Changed screens checked on PC in both languages, with before/after screenshots.
- [ ] Required Normal/Hard balance evidence and any owner decision recorded.
- [ ] Seeded hash preserved or an intentional gameplay change explained.
- [ ] UI helpers/localization followed; non-obvious decisions explained; assets licensed, credited, and indexed.
- [ ] Diff reviewed for excess code and concrete correctness/lifecycle problems.

Questions about intended game behavior belong in an issue labeled `precisa de decisão`.

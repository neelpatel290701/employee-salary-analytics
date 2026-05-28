# 09 — AI Usage

> **Purpose of this document.** The brief explicitly asks us to *use AI intentionally while maintaining correctness and quality*, and to document that usage as one of the deliverable artifacts. This document is that record. It captures what AI tool was used and how, the collaboration model we adopted (and why), the moments AI accelerated the work, the moments we overrode AI suggestions, the prompting principles we followed, the verification discipline we held to, and the limits we put on AI's role. The goal is not to advertise AI use, nor to downplay it — it is to make the process *legible* to a reviewer who wants to evaluate whether AI was used *well*.

---

## 1. What this document is, and is not

**Is:** A reflection on how Claude was used during planning and (when written, during) implementation, with concrete examples of prompts, accelerations, overrides, and the human judgment that drove every decision.

**Is not:**

- A marketing piece for AI tooling. We do not claim AI authored the engineering decisions.
- An exhaustive transcript. Capturing every exchange would be noise; we extract the *patterns* that matter.
- A list of every Claude message. The repository's commit log already shows the artefacts; this doc explains the *process* behind them.

This document is intentionally specific. Generic claims of the form "AI helped me write code faster" prove nothing. Concrete examples — *what was prompted, what came back, what was kept, what was rewritten* — are what give the reviewer real signal.

---

## 2. The tool and the operator

- **Tool.** Claude (Anthropic), invoked through the Claude Code CLI/IDE integration. The specific model used during planning was **Claude Opus 4.7 with the 1M-token context window**, which lets the entire repository (docs, code, tests, schemas) sit in one conversation without losing earlier context. The same model is intended for the implementation phase.
- **Operator.** The candidate (the human) drives every conversation. Every architectural decision, every trade-off, every "what would the persona actually want" judgment is made by the human. Claude proposes; the human disposes.

This relationship is non-negotiable and is the single most important principle in this document. It is restated below in §4 because it underpins every other rule.

---

## 3. The collaboration model

We use AI as a **fast first-drafter and a tireless sparring partner**, not as a decision-maker. The work splits as follows:

| The human does | Claude does |
|---|---|
| Frames the problem, names the persona, sets the design principles | Proposes drafts that the human shapes |
| Decides what to build (and what to *not* build) | Surfaces alternatives the human may not have considered |
| Owns every architectural call, every trade-off | Articulates the trade-offs so the human can pick |
| Reviews every line of doc / code before it lands | Drafts the lines |
| Tests, runs benchmarks, and verifies correctness | Suggests test cases; never marks them passing |
| Writes the commit messages with personal voice and reasoning | Drafts the messages; the human keeps what is true |
| Pushes back when a Claude suggestion drifts from the persona | Flags uncertainty when it exists |

The boundary is: **Claude generates, the human chooses.** Where Claude proposed something the human did not endorse, the override is logged in §6 below.

---

## 4. The non-negotiable principle

**Claude does not make decisions. The human does.** Restating because everything else in this doc flows from it.

Practically:

1. Every doc and every (forthcoming) commit was reviewed by the human before being committed. Nothing was committed sight-unseen.
2. Where Claude offered two reasonable options, the human picked — and the *reason* in the resulting doc is the human's reason, not Claude's hedge.
3. Where Claude proposed a third option that turned out to be wrong for this persona, that proposal was rejected on the spot. Examples are in §6.
4. Claude never has authority on persona-fit questions ("would Priya actually want this?"). It has no Priya. The human does.

---

## 5. Where AI accelerated this project

These are the concrete accelerations. Each one names *what* was accelerated, *how* it was prompted, and *what verification* was applied.

### 5.1 Drafting nine planning documents at length

**What it accelerated.** The nine planning documents (`01-requirements-analysis.md` through this one) are several thousand lines of structured, cross-referenced prose. Drafting them from scratch unaided would have taken many hours per doc. Claude turned that into "the human frames the doc's purpose and structure, then iterates on a draft."

**Prompting pattern that worked.** The human supplied: the doc's purpose, the structure (numbered sections), the persona context, the cross-references to earlier docs that should be respected, and any constraints (no marketing-speak, no generic AI prose, specific tradeoffs to capture). Claude returned a draft. The human reviewed for accuracy, voice, and faithfulness to the actual decisions, and iterated.

**What we verified.** Every fact in every doc that asserts a position about the architecture (e.g. "MySQL has no native `PERCENTILE_CONT`") was something the human already knew or independently re-checked. Every reference to a persona question or a brief requirement was checked against the brief itself. Every cross-reference between docs (`See [04-data-model.md](04-data-model.md) §5.2`) was checked to point at real content.

**Why this is honest.** Documentation drafting is *exactly* the kind of work AI is good at: structured, repetitive, with a known shape. The human's job was direction and review, not stenography.

### 5.2 Articulating trade-offs we had already made

**What it accelerated.** Many decisions ("MySQL is fine for 10K rows because MySQL is fine for 10K rows") have a felt-correctness that is hard to *write down*. Claude is good at turning a one-sentence human intuition into a paragraph of crisp reasoning the human can edit, reject, or sharpen.

**Example.** The human decided early to ship percentiles in addition to averages, based on knowing that averages mislead on skewed data. Asking Claude to articulate this for the persona doc returned a paragraph (`02-product-thinking.md` §4.1) explaining why "average alone is dangerous on salary data — a single CTO can move the average for a small-country engineering team enough to make junior salaries look healthy when they are not." That sentence is sharper than what the human would have drafted from scratch, but it expresses the human's pre-existing conviction.

**What we verified.** The human read each articulation and rejected any that introduced a claim the human did not actually hold (see §6.4).

### 5.3 Surfacing alternatives the human had not considered

**What it accelerated.** Decision-making. Claude is excellent at listing alternatives to whatever the human proposes. The human sometimes picks the alternative; more often, the existence of the list strengthens the chosen path because the human has now *consciously* rejected it.

**Example.** When picking an ID strategy, the human's instinct was UUID v4. Claude listed: auto-increment int, UUID v4, UUID v7, CUID, CUID2, ULID, NanoID. The human ended up choosing CUID, not because Claude recommended it, but because the comparison made clear that CUID's lexicographic sortability mattered and v4's index-locality cost was real. The decision is documented in tradeoff 4.1 with the chosen *cost* (extra 17 bytes per row) recorded honestly.

### 5.4 Proposing test fixtures and assertions

**What it accelerated.** The TDD strategy doc (`06-tdd-strategy.md`) contains a worked example of testing P25/P50/P75 with hand-computed fixtures. The hand-computation was a chore Claude is good at: "give me 5 salaries where the median is 30 and the P25 is 20 and the P75 is 40 by linear interpolation, and show the math in a comment."

**Why this is helpful.** Test fixtures with comments showing the derivation make the test self-documenting. Asking Claude to generate the fixture *and* the derivation makes the resulting test easy to maintain even by someone who didn't write it.

**What we verified.** Every computed value will be recomputed by hand or by a calculator during the implementation phase. We will not commit a test whose expected value we have not independently confirmed.

### 5.5 Catching inconsistencies between docs

**What it accelerated.** When the docs cross-reference each other (and they do, heavily), drift is easy. Claude's 1M-context window lets it hold every doc in mind at once; we used this to spot when, for example, a decision recorded in `08-tradeoffs.md` did not exactly match the rationale in the originating doc. The human resolved each drift by editing the *correct* doc.

---

## 6. Where the human overrode AI

These are the concrete moments where Claude proposed something the human rejected. Each one is recorded because *the existence of overrides* is the strongest evidence that AI was being used critically, not blindly.

### 6.1 Override — Claude proposed `firstName` + `lastName`; human kept `fullName`

In an early draft of the data model, Claude suggested splitting names into `firstName` and `lastName`. The human overrode this. Many global naming conventions — mononyms, given-name-first cultures, multi-part family names — do not fit a first/last split. A single `fullName` is the honest answer at global scale and is what the brief asks for. The decision is now documented in tradeoff 4.2.

### 6.2 Override — Claude offered to use Next.js; human kept Vite + React

In the initial stack discussion Claude was happy to go either way. When the human asked Claude to recommend, the recommendation was Next.js (App Router) — the most common modern choice. The human overrode this in favour of Vite + React for the reasons in tradeoff 3.3: no SEO need, no server components win for this persona, and an honest "internal tool" deployment shape that the independently-deployed frontend communicates well. The decision is in [`03-architecture.md`](03-architecture.md) §3.1 and tradeoff 3.3.

### 6.3 Override — Claude proposed adding a `manager` self-reference; human kept it out of scope

When asked to flesh out the Employee model, an early draft included a `managerId: Employee?` self-reference. This is a useful field in production HR systems. The human overrode the inclusion for v1 — the brief does not ask for reporting lines and adding it invites org-chart features the brief explicitly does not require. Recorded as out-of-scope in [`04-data-model.md`](04-data-model.md) §2.4 and the persona doc's anti-features section.

### 6.4 Override — Claude proposed transactional rollback for test isolation; human kept TRUNCATE

The "correct-looking" choice for integration-test data isolation is per-test transactions with rollback. Claude proposed this. The human overrode the choice because it would require `AsyncLocalStorage` plumbing in *production code* purely to enable a test technique — adding complexity to the shipping code so that the tests can be cleaner. We chose TRUNCATE-per-test instead, slower but with no impact on production code. The decision and its cost are recorded in tradeoff 2.5 and [`06-tdd-strategy.md`](06-tdd-strategy.md) §5.

### 6.5 Override — Claude wanted to add a "gender pay gap" metric; human refused

When proposing additional insights, Claude included a gender-pay-gap metric. Implementing it would require either collecting gender (which the brief does not capture) or *inferring* it from names — which is unacceptable on every axis. The human refused. The metric is explicitly listed as "considered and rejected" in [`02-product-thinking.md`](02-product-thinking.md) §4.2 with the reason recorded.

### 6.6 Override — Claude wanted a `Co-Authored-By: Claude` trailer on commits

In the very first commit Claude proposed including the `Co-Authored-By: Claude <noreply@anthropic.com>` trailer. The human overrode this for an assessment context — the submission is the human's submission, and AI usage is documented in detail in this exact doc. Trailers would muddy the authorship of a personal submission without adding information that this doc does not already cover.

### 6.7 Override — Claude proposed verbose error messages including stack traces

In an early API-design draft, Claude proposed including the exception message in error responses for easier debugging. The human overrode this — exception messages and stack frames must never leave the API. The decision is documented in [`05-api-design.md`](05-api-design.md) §3.3.

---

## 7. The prompting principles we followed

The quality of an AI-assisted artefact is bounded by the quality of the prompts. The principles below are the ones we hold ourselves to.

### 7.1 Give context, not commands

A prompt of the form *"draft the API design doc"* gets a generic API doc. A prompt of the form *"draft the API design doc for the system in `03-architecture.md`, consistent with the persona's questions in `02-product-thinking.md` and the data model in `04-data-model.md`, with one endpoint per persona question, using the response-envelope convention we already settled on, in markdown with section numbers"* gets the doc this project actually needed.

### 7.2 Pre-frame the conclusion when it exists

If the human already knows the answer ("we are using MySQL because the user asked for MySQL — defend the choice with the strongest reasons that actually apply"), say so. Claude works best when the *direction* is set and it can focus on the *expression*. Asking Claude to "decide" what database to use would have been the wrong shape of prompt.

### 7.3 Insist on *cost* alongside choice

Every prompt for a trade-off entry included "also state the cost we are accepting." A trade-off without a cost is a marketing claim, not an engineering one. Forcing the cost into every entry catches sloppy reasoning.

### 7.4 Reject AI-prose tells

We rejected drafts that contained generic AI-prose tells: "robust and scalable solution," "leverage cutting-edge technologies," "comprehensive and thorough approach," opening with "Sure! Here's…", emojis, em-dash bullets without substance. Where Claude defaulted to that voice, we asked for specifics or rewrote.

### 7.5 Cross-reference, don't re-derive

Where a fact is established in an earlier doc, the prompt instructs Claude to *cross-reference* it (`See [04-data-model.md](04-data-model.md) §4`), not re-derive it. This keeps each doc focused on its own contribution and prevents the same paragraph from appearing in three places.

### 7.6 Specific examples are worth more than abstract rules

A prompt that says *"include three honest tradeoffs where the cost is real, not nominal"* and provides one worked example produces better drafts than a prompt that says *"include realistic tradeoffs."*

### 7.7 Verify, don't trust

This is the meta-principle. The human re-reads every output. Where a claim is non-obvious, the human checks it (against the brief, against Prisma docs, against MySQL docs, against the real persona). Where Claude expresses uncertainty, the human resolves it.

---

## 8. Representative prompts (the *shapes* that worked)

These are the *patterns* of prompts that produced the work, not verbatim transcripts. They are recorded because the prompt shape is the actually-useful artefact.

### 8.1 Pattern — "Draft a doc with this purpose, this structure, these constraints"

> *"Draft `06-tdd-strategy.md`. It is the rule-book for the implementation phase. Cover: what TDD means here; the strict-vs-pragmatic boundary; the test pyramid for this app; tooling at each layer; the data-isolation strategy with a defense of why we are not using transactional rollback; the red-green-refactor loop with a worked POST /api/employees example including the literal commit messages; the determinism rules; test data builders; insights testing with hand-computed fixtures; coverage philosophy with per-module targets; the anti-patterns we will not drift into. Markdown, numbered sections, cross-link to 01–05 where appropriate. No AI-prose tells."*

### 8.2 Pattern — "List the alternatives, rank them, recommend, then I decide"

> *"For the primary-key type on the Employee model: list the realistic candidates (auto-increment int, UUID v4, UUID v7, CUID, CUID2, ULID, NanoID). For each, give one sentence on the tradeoff. Recommend one for this project (10K rows, internal HR tool, MySQL+Prisma). I will pick."*

### 8.3 Pattern — "Articulate this conviction I already hold"

> *"I want to ship median and percentiles alongside average for the persona, because averages mislead on skewed salary data. Articulate this for the product-thinking doc in 2–3 sentences, persona-language, no jargon."*

### 8.4 Pattern — "Generate fixtures with the math derivation in comments"

> *"Write a test for `computePercentiles()` covering n=odd median, n=even median (average of middle two), and P25/P75 by linear interpolation. Use 5-element fixtures, integer salaries, and include the derivation of the expected value in a comment so a reader does not have to redo the math."*

### 8.5 Pattern — "Sweep across docs and find drift"

> *"Read `01-requirements-analysis.md` through `07-performance-plan.md`. List any place where two docs contradict each other or where a decision changed mid-stream without being updated everywhere. Do not propose fixes — list the drift, I will resolve each."*

---

## 9. Verification discipline

The point of the verification discipline is to make AI usage *safe* — to ensure that anything Claude produces is checked before it enters the project. The rules below are the ones we hold to.

| Artefact | Verification |
|---|---|
| Planning docs | Human re-read, fact-checked against the brief and external references, cross-references manually clicked through |
| Code (forthcoming, implementation phase) | A failing test exists before the code; the code makes the test pass; the test was designed by the human or, where Claude proposed the test, the human re-derived the expected value |
| Schemas | Each `zod` rule has both an accept-case and a reject-case test; both are reviewed |
| Migrations | Generated by `prisma migrate dev --create-only` so the human can inspect the SQL before it is applied |
| Commit messages | Human reads and runs; any AI-prose tells are deleted |
| Benchmark numbers | Measured locally by the human, not generated by Claude |

The rule that catches the most: **no number, name, file path, or external claim is committed without verification.** If Claude says "MySQL 8.0.34 introduced X," the human checks before quoting it.

---

## 10. Limits we explicitly put on AI

The following are things we **did not** use Claude for, or used only with extra care, because the value/cost ratio was unfavourable.

| We did not | Why |
|---|---|
| Let Claude run `git commit` autonomously | Per workflow preference; the human runs every commit. The reviewer's git history reflects the human's intent, not an autonomous agent's. |
| Let Claude pick the assessment-eval-critical decisions (stack, database, persona metrics) without explicit human framing | Persona-fit and architectural decisions are the *signal* of the assessment. AI cannot be the author of that signal. |
| Generate fake "realistic" data via Claude for tests | Test data is hand-built or comes from a seeded RNG. Claude-generated names risk being non-deterministic or culturally skewed. |
| Trust Claude on non-obvious external facts (MySQL version specifics, package APIs, Railway behaviours) | Verified against the actual docs or the actual package source. |
| Commit AI-generated code without an executable test | The TDD discipline applies more strictly to AI-generated code, not less. |
| Use Claude to write the demo video narration | The demo is the human's voice. |

---

## 11. How AI changed the *shape* of this project (honestly)

A few things would have been different without Claude in the loop:

- **The volume of planning documentation would be smaller.** Maybe one consolidated `DESIGN.md` instead of nine sectioned docs. The reviewer would still see the architectural calls, but the audit trail (every persona question mapped to every endpoint to every index) would be sparser. Claude makes structured volume cheap.
- **The trade-off log would not include a *cost* column for every decision.** The cost field is laborious to write at scale; Claude makes it tractable. This is one of the largest *quality* improvements AI brought to the project.
- **The cross-doc linking would be looser.** Keeping nine docs internally consistent is a chore that pays off for the reviewer but is tedious by hand.
- **The implementation timeline (when it begins) will be faster.** Not because Claude writes the code unaided, but because the human spends more time *deciding* and less time *typing* — and because failing tests are an excellent specification for AI-generated implementation.

**What did *not* change:**

- The architectural calls. Those are made by the human, with Claude as a sparring partner.
- The persona reasoning. There is no Priya in Claude's training set; the human owns her.
- The trade-off conclusions. Claude articulates; the human decides.
- The verification discipline. Trust must be earned per artefact.

---

## 12. What the reviewer can verify about this section

Specific, falsifiable claims a reviewer can check:

1. The commit history shows planning docs landed *before* any implementation code.
2. Every decision in [`08-tradeoffs.md`](08-tradeoffs.md) names the cost — none of them are cost-less.
3. The TDD discipline is visible in the commit log as `test:` → `feat:` → optional `refactor:` triplets per feature.
4. Every persona question (Q1–Q8 in `02-product-thinking.md`) maps to a specific endpoint, which maps to a specific index, in docs 5 and 4 respectively.
5. No commit message contains AI-prose tells ("robust and scalable", emojis, "Sure! Here's…").
6. Every external technical claim that could be wrong (MySQL version specifics, Prisma APIs, Railway behaviours) is either testable in code or grounded in a citable source.

---

## 13. What we will update in this document during implementation

This document is being written **before** implementation. The following sections will be appended as the implementation phase produces new evidence:

- A subsection at the end of §5 listing the *implementation* accelerations (e.g. "AI drafted the zod schema for `CreateEmployeeInput` from the spec in `05-api-design.md` §5.2; the human added the `.refine()` for `hireDate` not-in-future").
- A subsection at the end of §6 listing the *implementation* overrides (where AI-generated code was rewritten by the human, with the reason).
- The benchmark verification in §9 will be cross-linked to the actual numbers committed in `07-performance-plan.md` §8.

The expansion will be a commit titled `docs(ai-usage): append implementation-phase accelerations and overrides`.

---

## 14. What we do next

The planning phase is now substantively complete. The next document — [`10-deployment.md`](10-deployment.md) — turns from *how we think and design* to *how we ship*: the production deployment topology, the environment variables, the release process, the secrets handling, and the readiness checklist that takes us from "the code runs locally" to "the reviewer can open a URL and click around."

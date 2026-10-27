# Ordinary reading loader independent review

Scope: read-only review of the v92 Root candidate's ordinary-reading loader and append composer. All writes and synthetic fixtures are inside this independent directory. The six-source approval receipts used by these tests are explicitly fabricated fixtures; they are not Root approval or a production release. No browser, real service, credentials, learner data or NAS was used.

## Finding and resolution

The original loader (`735d79ecc352c26bceb2fe5da5dcdaabf62a93e76cc3ccea6226039f95c8c793`) checked only integer offsets and `text.slice(start,end) === quote` for grammar/word locations. Subtracting the passage length from a valid range produced negative offsets with exactly the same `slice()` result. A complete six-source simulated release still loaded successfully with grammar start `-3457` and target start `-7177`. This was a schema validation omission; the current six original author objects themselves had valid positive offsets. It did not bypass their fixed approval hashes.

`guards.initial.tap` records the initial expected-refusal failure: five pass, one fail. Root then added a shared bounded, nonempty span check for question evidence, grammar, targets and enclosing word quotes, plus quote hashes/enclosure and grammar evidence binding. The independent tests verify this fix, including negative question ranges and negative quote envelopes. Root also normalized all six declared source content/question hashes, which the positive fixture now recomputes independently using the declared ordinary JSON fields.

## Static references and runtime eligibility

The actual six materials fit the static composer at days **256, 257, 259, 260, 261 and 267**, with reference calendar totals **236, 274, 284, 279, 269 and 274 minutes**. All original 80 assignments, owner-day patches and review objects remain exact; original input days/objects are not mutated. Raising one complete reading to 400 minutes is rejected rather than split or silently dropped. Path traversal, absolute paths, a real Windows junction escaping the dedicated package, changed source bytes and mismatching edit originals are also rejected.

The existing runtime planner may replan eligible unstarted materials before the static suggested windows. An actual replan placed CBO at 201 (suggested 240+), DNA at 203 (250+), NIMH at 204 (220+) and NIST at 207 (256+). Root clarified that those windows are `future-course-index-search-reference`, **not runtime prerequisites**. `newReadingStartDay` preserves the new static authoring arrangement; it does not assert ability by calendar. The loader's receipt now expressly documents this boundary. This observation is retained in `runtime-window-violations.json`; its historical filename does not mean a violation of the clarified runtime policy. This review does not replace existing actual level, prerequisites, history, due-work or live-budget guards with a date fence.

## Validation boundary

The final narrow suite covers eight cases: six actual material objects/48 questions and exact hash closure; absent approval; path/junction escape; changed source and edit input; negative grammar/word spans; negative question spans; negative enclosing quote spans; and actual static composition/old-80 preservation/complete-unit budget refusal. Root's separate independent content review and formal release approval remain required. No new words, listening or independent assessment evidence is activated by these probes.

Run from the workspace: `node --test --test-concurrency=1 work/ordinary-loader-review-v92/guards.test.cjs`.

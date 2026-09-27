---
name: design
description: High-fidelity HTML prototyping workflow with screenshot self-review, human review (design viewed in the browser, approve/reject given in chat), then implementation in the target stack (react / swiftui / web). Turns a design brief into shipped UI via BRIEF → PLAN → BUILD → SELF-REVIEW → REVIEW → IMPLEMENT (the pi-design workflow).
whenToUse: Use when the user wants to design, prototype, mock up, or redesign UI, screens, or pages (triggers include "design", "prototype", "mockup", "UI", "landing page", "原型", "设计稿", "界面设计", "/design"). Also use it to resume or continue an interrupted design workflow in this project (check .design/state.json first). Not for implementing a design that already exists as production-ready specs.
---

# pi-design (DSH adapter)

Turn a design brief into shipped UI: the model builds a high-fidelity HTML
prototype under `.design/`, critiques its own screenshots, the human reviews
the design in the browser and gives the verdict in chat, and the approved
prototype becomes the spec for implementing the real UI in the target stack.

All workflow state lives in `.design/` (DESIGN.md design system, tokens.css,
state.json, prototype/screens/*.html, shots/). The state machine and every
stage rule are printed by the `start` command — do not improvise them.

## CLI

Resolve the CLI once (fallback chain, first that exists wins):

1. `$PI_DESIGN_BIN` if set
2. `__PI_DESIGN_CLI__` (path baked in by `pi-design install-skill`)

Then run (from the target project root):

```sh
node "$PI_DESIGN" start "<brief>" [--scope app|component]
                                         # start/reset; prints the full workflow
node "$PI_DESIGN" render <page> [--viewport WxH]   # screenshot; view with read_image
node "$PI_DESIGN" review                 # regenerate the playground, open it — then STOP
node "$PI_DESIGN" playground             # (re)open the all-screens playground (read-only)
node "$PI_DESIGN" status --stage <s>     # persist every stage transition
node "$PI_DESIGN" stop                   # end the workflow
```

## Scope: app vs component

Pick the scope from the brief BEFORE starting — this is the #1 mistake to
avoid:

- The brief names an app, a page, or a flow (login page, dashboard, onboarding)
  → default app scope.
- The brief names a component or control (a button, card, input, modal, tab
  bar, avatar, chart, toast…) → pass `--scope component`. Then the deliverable
  is ONLY that component: one showcase page in the prototype, ONE reusable
  component at IMPLEMENT — no app screens, pages, routing, or scaffolding.
- Wrong scope noticed mid-work → fix it (`status --scope component`) and drop
  everything out of scope. Never widen scope unless the user asks.

## Core discipline

These rules replace the hard boundaries the Pi extension enforced in-process —
follow them strictly:

1. **Start**: run `start "<brief>"` and execute the printed workflow exactly.
   Persist EVERY stage transition with `status --stage <stage>` (stages:
   brief | plan | build | self-review | review | implement | done). The status
   output re-prints the current-stage rules — read them each time (they survive
   context loss).
2. **Screenshots are mandatory feedback**: after `render`, ALWAYS view the
   printed screenshot path with the `read_image` tool before judging the
   screen. If the current model cannot view images, say so and do a
   token-by-token code audit against DESIGN.md/tokens.css instead.
   Self-review is capped at 3 rounds per screen; at the cap, take the
   known issues to human review instead of looping.
3. **Human gate is a hard stop**: call `review` only after every screen passed
   self-review. It (re)generates `.design/playground.html` — every current
   screen in ONE page (viewport presets, zoom, per-screen full-screen ↗,
   self-review-shot compare 📸) — and opens it in the user's browser. The
   playground is read-only; there are no decision buttons. After `review`
   returns, END THE TURN — no implementation plans, no code, no further tool
   calls. `playground` reopens the view anytime without touching state.
4. **Verdicts live in chat**: the user's next message after REVIEW is the
   verdict — explicit approval (通过 / approve / ok / 可以) →
   `status --stage implement` then implement; comments or rejection →
   `status --stage build` and revise per the feedback, then re-run
   self-review and `review` for the next round.
5. **Finish**: when all screens are implemented → `status --stage done`; if the
   user aborts → `stop`.

## Resume

When a new session touches this project's design work, first run
`status` to re-sync with `.design/state.json` before doing anything else.

# Campus Customs Agent Desk: design notes

The dashboard lives in `frontend/` and is built with React, Vite and TypeScript. It talks to the FastAPI backend at `http://localhost:8000` (set in `src/api.ts`, override with `VITE_API_BASE`). Start it with `npm run dev`.

**The idea:** a real shop desk you'd want to sit at. On the left is the paperwork: the tickets, the things that need your signature, and what the team did. On the right is a window onto the shop, where you watch the team do the work. Everything on screen comes from the backend routes, so the drawing is fed by real agent events, not a canned animation.

---

## 1. Layout

| Area | What it is | Why |
|---|---|---|
| **Top bar** | The Labubu Carl logo, "Campus Customs Agent Desk", the shop's day (`desk.date_today`), the backend status, the **checking balance** shown as a cash-register display, and **Reset shop**. | Money and "is the team online?" are the two things a manager glances at, so they stay pinned at the top on every screen. |
| **Left: the interaction table** | Three stacked cards: **Ticket board** (all three tickets, plus the selected ticket's docket and the run button), **Needs your OK** (approvals), **What the team did** (per-agent summary and message drafts). | It reads like a desk from top to bottom: pick the work, sign what needs signing, read the result. The column stays in place while the window scrolls, so the controls never leave your hand. |
| **Right: the shop window** | A large illustrated scene of the storefront, with the five agents at their desks inside. | You *watch* the team work instead of reading JSON. Who is busy, who is waiting, and who handed what to whom is visible at a glance. |
| **Under the window: the desk log** | A colour-coded transcript: who said what to whom, which tools they used, and when the ticket was resolved. | The scene is for intuition and the log is for detail. Both are drawn from the same `/api/events` feed. |

On narrow screens the window moves to the top and the cards stack below it.

## 2. How the agents read differently

Each agent is a cartoon character with their own colour, outfit, props and seat, and a nameplate on the desk that names their **position**:

| Agent | Name on the desk | Look and props | Colour |
|---|---|---|---|
| Customer Service | **Cece** | Headset and curls; a letter tray | pink |
| Inventory | **Ivan** | Green "CC" cap; a stock box and clipboard | green |
| The Boss | **Bea** | Silver bun, round glasses, navy blazer with gold tie; a Yale mug and a little bulldog bust; centre seat | Yale blue |
| Accounting | **Abe** | Green eyeshade visor; a **cash register whose screen shows the real checking balance** | purple |
| Facilities | **Fay** | Yellow hard hat; blueprints and keys | orange |

Each agent's colour carries through everywhere: their letters, their lines in the desk log, their row in the summary, and the "filed by" label on approvals. You learn who is who once and recognise them everywhere.

**Mood.** Mood comes from the live events, so you can read it without any text:
- *thinking*: a dashed thought bubble, a gentle sway, and a "…" badge
- *working*: typing arms, a green laptop screen, and a tool chip (📦 checking the shelves, 💵 counting the cash…) floating up
- *waiting* on a colleague: an ⏳ badge and an amber screen
- *done*: a little hop and a ✓

Active agents get a soft coloured glow on the floor, and the pendant lamps brighten while anyone works.

**Speech bubbles** show what the agent actually said, thought or did. That comes from the model's text, its reasoning summary, or its tool calls, rewritten in plain words.

**Letters fly between desks** whenever work is handed off:
- **Instruction:** a sealed envelope in the sender's colour, flying along an arc to the receiving desk.
- **Report:** a yellow folder with a ✓, flying back to whoever asked.
- **Refused hand-off:** a red envelope that turns back halfway. This happens when a guardrail blocks it, for example delegating back to someone who is waiting.
- **New ticket:** a gold envelope that comes in through the shop door to the Boss.

**Pacing.** The backend writes events in bursts, so the dashboard queues them and plays them back at a human pace. It speeds up automatically when it falls behind ("catching up · 7 queued"), so a one-minute run reads like a short, followable story.

## 3. How resolved tickets show up

- **While the team works**, the ticket card gets a marching blue-and-gold border, its pill says "Team working…", and the shop's door sign flips from **OPEN** to **BUSY**.
- **When the run finishes**, a red **RESOLVED** rubber stamp thumps onto the ticket card, and a matching stamp lands on the corkboard note pinned inside the shop. The ticket's state becomes `resolved` (that's what `/api/tickets` reports once the team has finished a run).
- **The Boss's detailed status stays visible underneath**, for example "Waiting on your OK" or "Blocked", along with "✍️ 1 to approve" and "✉️ 1 draft" counters. You can see at once whether the team is done but still needs you.
- **"What the team did on #N"** opens with **Bea's call** (the decision, plus a checklist of what's waiting on you). Then each agent has one row: their report, the tools they used with counts, and who they handed work to. Last come the **drafts waiting for you to send**, on lined notepaper with a Copy button.
- **⟲ Replay** re-plays any finished run from the audit trail, letters and all.

## 4. How cash shows up

- **The register display in the top bar** shows the checking balance from `cash_accounts`, in green LCD digits, with *pending* and *spendable* (after the $100 reserve) underneath.
- **When you approve a payment**, the balance **counts down** to the new value, a red **−$2,400.00** floats up, and the register gives a small "ka-ching" shake. At the same moment, Abe's little register in the shop window shows the new balance and its drawer opens.
- **"Needs your OK"** turns rosy when something is waiting, and shows a count badge. Each request shows:
  - what it is (🧾 vendor invoice, 🏠 rent, 🛒 purchase order)
  - the amount, the ticket, who filed it, and the agent's reason
  - a warning if it would dip under the $100 reserve

  You sign with your name ("Signing as", remembered between visits), because agents can never approve. **Approve & pay** is the only button that changes cash. If a rule blocks the payment, the refusal reason appears as a red toast.

## 5. The creative choices that make it feel special

- **A storefront you look into, on a spring morning in New Haven.** Through the scene:
  - a soft blue sky with drifting clouds, a slowly turning sun, birds crossing
  - cherry and dogwood blossom trees, falling petals, swaying tulips in the planter boxes, a butterfly
  - in the distance, a skyline of Yale Gothic towers and halls, with **Evans Hall's** glass and wavy roofline peeking through between them (with a hand-written "Evans Hall" label)
- **The Campus Customs sign** is navy with gold lettering and twinkling marquee bulbs, under a striped Yale-blue awning. There's a wall clock that keeps real time, a Yale pennant, shelves of hoodies, tees, mugs and caps, and a corkboard holding the ticket in play.
- **A chalkboard A-frame on the sidewalk** reads TODAY, the shop's date, and WELCOME IN! in chalk handwriting, like a real shop's sidewalk sign.
- **Labubu walks by.** Every 35 to 60 seconds, Labubu (the Labubu-inspired buddy from assignment 4, now with a spring flower behind her ear) strolls along the sidewalk. She hops up on the blue crate under the window to peek inside, with a little heart, and waves. **Cece and Bea wave back if they're free.** Then she carries on her route.
- **Labubu Carl logo.** The header logo is the same original Labubu Carl drawing as assignment 4, signed "by Labubu Carl", and **she waves when you hover over it**.
- **Materials and type that feel like a real desk:**
  - paper cards on a cream desk, lined notepaper for drafts, a dashed docket
  - the customer's note in handwriting, the approver's name signed in handwriting
  - a rubber stamp for RESOLVED, an LCD for the register
  - type: Fraunces for headings and signage, Nunito Sans for reading, Caveat for handwriting
- **Calm by default, alive when working.** When nothing is running, the shop idles: blinking, steaming coffee, petals. Motion ramps up only while the team works, and it all follows the agents' real events.
- **Respectful of people.** Animations switch off under "reduced motion", every control is a real button with labels, text keeps strong contrast, and nothing important is shown only in colour.

## 6. Practical behaviour

- **One run at a time**, matching the backend: other run buttons disable themselves, with a note saying which ticket the team is busy with.
- **Picking up a run in progress:** if you open the page while a run is already going, the dashboard joins it.
- **If the backend is down**, a friendly banner says so and shows the exact command to start it.
- **Reset shop** asks for confirmation, then calls `POST /api/reset`, clears the scene, and refreshes everything. The audit trail is kept.
- **Routes used:**
  - `GET /api/health`, `GET /api/tickets`, `GET /api/tickets/{id}/summary`
  - `POST /api/tickets/{id}/run`, `GET /api/runs/{trace_id}`
  - `GET /api/events?trace_id=&after_seq=`
  - `GET /api/approvals`, `POST /api/approvals/{id}/approve`, `POST /api/approvals/{id}/reject`
  - `GET /api/board?ticket_id=`, `GET /api/cash`, `POST /api/reset`

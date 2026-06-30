# ContextScribe

A two-stage clinical AI pipeline demonstrating the upstream-context
hallucination-prevention thesis: an adaptive intake agent collects
structured patient history, which then grounds a SOAP note generator. The
same transcript run with vs. without that upstream context shows the
measurable difference structured context makes — same model, same prompt
shape, one variable changed.

Built with: Node.js, Express, TypeScript, MongoDB, React, the Anthropic
API (direct SDK calls, hand-rolled tool-use loop — no agent framework).

---

## Setup in Cursor

### 1. Open the project

Unzip this folder, then in Cursor: **File → Open Folder** → select the
`contextscribe` folder (the one containing `backend/`, `frontend/`, and
this README).

### 2. Install backend dependencies

Open a terminal in Cursor: **Terminal → New Terminal** (or `` Ctrl+` ``).

```powershell
cd backend
npm install
```

### 3. Install frontend dependencies

Open a second terminal (click the `+` in the terminal panel, or
`` Ctrl+Shift+` ``):

```powershell
cd frontend
npm install
```

### 4. Configure environment variables

In the `backend` folder, copy the example env file:

```powershell
cd backend
copy .env.example .env
```

Open the new `.env` file in Cursor and fill in your real values:

```
ANTHROPIC_API_KEY=sk-ant-...          # from console.anthropic.com
MONGODB_URI=mongodb+srv://...         # from your MongoDB Atlas cluster
PORT=4000
```

**Never commit `.env`** — it's already excluded via `.gitignore`.

### 5. Run the backend

In the backend terminal:

```powershell
npm run dev
```

You should see:
```
[db] connected to MongoDB
[server] listening on port 4000
```

Leave this terminal running.

### 6. Run the frontend

In the frontend terminal:

```powershell
npm run dev
```

Vite will print a local URL, typically `http://localhost:5173`. Open it
in your browser.

### 7. Verify the connection

Click "Test backend connection" on the page. If MongoDB and the backend
are both running correctly, you'll see a 200-range status.

If you see a connection refused error, double check the backend terminal
is still running and didn't crash on startup (check for a missing or
malformed `.env` value first — that's the most common cause).

---

## Project structure

```
contextscribe/
├── backend/
│   ├── src/
│   │   ├── server.ts              # Express app, health checks, graceful shutdown
│   │   ├── routes/                # intake.ts, note.ts — API endpoints
│   │   ├── services/
│   │   │   ├── intakeAgent.ts     # adaptive questioning, tool-use loop
│   │   │   ├── noteGenerator.ts   # SOAP generation, with/without context comparison
│   │   │   └── validation.ts      # Zod schemas + cross-reference hallucination checks
│   │   ├── models/IntakeSession.ts
│   │   └── evals/                 # (Sprint 2)
│   └── .env.example
├── frontend/
│   └── src/
│       ├── App.tsx                # placeholder — real UI built in Sprint 3
│       └── main.tsx
└── README.md (this file)
```

## Useful commands

| Command | Where | What it does |
|---|---|---|
| `npm run dev` | backend | Starts the API server with hot reload |
| `npm run typecheck` | backend or frontend | Runs `tsc --noEmit` to catch type errors |
| `npm run dev` | frontend | Starts the Vite dev server |
| `npm run build` | backend | Compiles TypeScript to `dist/` |
| `npm run build` | frontend | Production build to `dist/` |

## Status

- [x] Sprint 1 — backend core (intake agent, note generator, validation, routes)
- [ ] Sprint 2 — eval suite + adversarial test cases
- [ ] Sprint 3 — real frontend UI, Docker, CI, deploy

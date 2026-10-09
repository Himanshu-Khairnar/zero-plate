# Zero Plate

Monorepo with a Next.js frontend and a FastAPI backend.

```
frontend/   Next.js (App Router, TypeScript, Tailwind v4, shadcn/ui)
backend/    FastAPI (Python 3.13)
```

## Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Add shadcn components with `npx shadcn@latest add <component>`.

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate         # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
cp .env.example .env
fastapi dev app/main.py        # http://localhost:8000, docs at /docs
```

# Veridex — Failure Prediction AI

**Startup & Project Risk Analyzer** — an Infosys Springboard internship project.

Veridex takes a startup or project idea and returns an AI-generated market &
competitor intelligence report: market sizing (TAM/SAM/SOM), competitor
landscape, industry challenges, growth potential score, and actionable
recommendations.

## Tech Stack
- **Frontend:** HTML, CSS, vanilla JavaScript (server-side rendered, static files)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **AI:** Groq API (`openai/gpt-oss-120b`)

## Project Status

**Milestone 1 (Weeks 1–2): Data Collection & Market Intelligence — Complete**

Completed:
- Project submission form (name, industry, business model, target market, budget, description)
- PostgreSQL storage of submitted projects
- Market & competitor AI analysis via Groq, with a deterministic fallback generator
- Results dashboard (market sizing, growth trend, competitor cards, opportunities & recommendations)

## Project Structure
```
server/backend/
├── app.js                     # Express app entry point
├── controllers/
│   └── projectController.js   # Validation + DB insert + triggers AI analysis
├── routes/
│   └── projectRoutes.js       # POST /api/projects
├── services/
│   └── aiService.js           # Groq API integration + fallback analysis generator
├── db/
│   ├── database.js            # PostgreSQL connection pool
│   └── database.sql           # Database schema
└── public/                    # Static frontend
    ├── index.html              # Project submission form
    ├── results.html            # Intelligence report page
    ├── css/
    └── js/
```

## Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone <repo-url>
   cd veridex/server/backend
   npm install
   ```

2. Create a `.env` file in `server/backend/` (never committed — see `.gitignore` and `requirements.txt`):
   ```
   PORT=5000
   GROQ_API_KEY=your_groq_api_key_here
   PGUSER=your_pg_user
   PGPASSWORD=your_pg_password
   PGDATABASE=failure_prediction_ai
   PGHOST=localhost
   PGPORT=5432
   ```

3. Create the database and run the schema:
   ```bash
   psql -U your_pg_user -d failure_prediction_ai -f db/database.sql
   ```

4. Run the server:
   ```bash
   npm run dev
   ```

5. Visit `http://localhost:5000`

See `requirements.txt` for full software/version prerequisites.

## Roadmap
- **Milestone 2 (Weeks 3–4):** Risk Assessment & SWOT Analysis
- **Milestone 3 (Weeks 5–6):** Recommendations & Strategic Reasoning (LangGraph agent workflows)
- **Milestone 4 (Weeks 7–8):** Dashboard & Deployment

## Author
Built as part of the Infosys Springboard internship program, 2026.

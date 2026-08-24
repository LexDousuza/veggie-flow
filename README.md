# Veggie Flow

**A WhatsApp-to-dashboard order management system for a wholesale exotic-vegetable supplier.**

🟢 **Live and in production** — [veggie-flow-azure.vercel.app](https://veggie-flow-azure.vercel.app)
Actively processing real customer orders daily since July 2026 (~1,200 orders and counting).

Delivered as a freelance/consulting engagement for a wholesale exotic-vegetable business in India ("Exotic Greens").

---

## What it does

Customers order produce the way they always have — by texting or sending a photo on WhatsApp. Veggie Flow turns that unstructured message into a clean, structured order in the business's dashboard automatically, with no manual re-typing.

1. A customer sends a WhatsApp message (or a photo of a handwritten/typed order) to the business's number.
2. A Twilio webhook receives it and hands it to an LLM (Groq Llama / OpenAI GPT-5), which extracts customer info, delivery date, and line items — matching each item against the business's fixed inventory list and flagging anything it isn't confident about for human review.
3. The order lands in a live admin dashboard where staff can manage orders, inventory, and billing — and generate ready-to-print invoices, supply sheets, and packing lists in one click.

## Key features

- **WhatsApp order intake** — text or photo, parsed automatically into structured orders
- **AI extraction with guardrails** — strict inventory matching, ambiguous items flagged rather than guessed
- **Secure, unattended webhook** — Twilio HMAC signature verification and input sanitization so only genuine WhatsApp traffic can write to the database
- **Admin dashboard** — role-based staff accounts, order and inventory management
- **Document generation** — printable invoices, supply sheets, and packing lists
- **Analytics** — revenue tracking, low-stock alerts, Excel export

## Tech stack

- **Frontend:** React
- **Backend:** Vercel serverless functions, Supabase (Postgres + Auth)
- **Integrations:** Twilio (WhatsApp), Groq (Llama 3.3/4), OpenAI (GPT-5)

## Security

- All third-party API keys (Groq, OpenAI, Twilio, Supabase service role) live server-side only, read from environment variables — never bundled into client-side code
- Twilio webhook requests are verified with HMAC-SHA1 signature checks before any data is parsed or written
- All AI-parsed data is sanitized (length-clamped, type-checked, allow-listed) before hitting the database, since it originates from untrusted external input
- Row-level access and admin actions (creating/deleting staff) go through Supabase's service-role API server-side, never exposed to the browser

## Setup

Requires accounts with Vercel, Supabase, Twilio, and Groq/OpenAI. Copy `.env.example`-style variables below into your own `.env.local` (never commit real values):

```
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
```

```bash
npm install
npm start       # local dev server
npm run build   # production build
```

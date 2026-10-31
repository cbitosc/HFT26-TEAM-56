# Vetted

Personalised coding assessments built from the projects on your resume. CBIT Hacktoberfest '26 submission.

**Live:** https://vetted-demo-eight.vercel.app

## Team

**Tellitubies**, TEAM-56 (HFT26-TEAM-56), Registration ID HFEST26-PCDMB856

- Haseeb Ur Rahman (Team Leader), MJCET
- Ibrahim Wajid, MJCET
- Qudsia Zainab Shirazi, MJCET
- Atif Ahmed, LIET
- Nazish Ahmed, DCET

## What it does

1. Upload a PDF resume; Vetted extracts the skills and projects it actually mentions.
2. Take a 60-minute, 12-question assessment generated from that profile, in three timed tiers.
3. Code is graded by running it against tests, and a report shows how you did.

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS, Supabase, Featherless / OpenRouter, Monaco, Vitest.

## Run locally

```bash
npm install
cp .env.example .env.local   # add Supabase and AI provider keys
npm run dev
```

More detail is in [docs/](docs/).

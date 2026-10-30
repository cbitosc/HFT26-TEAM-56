# Vetted

### Beyond the Résumé.

**Vetted** is an AI-powered, portfolio-driven technical assessment platform that evaluates developers based on their actual skills, projects, and technical experience rather than relying on generic coding challenges.

By analyzing structured developer portfolios, Vetted generates personalized coding assessments, provides an interactive coding environment, validates solutions through automated testing, and delivers comprehensive performance reports.

**Don't just claim your skills. Prove them.**

---

## Overview

Traditional coding assessments often rely on standardized questions that fail to reflect a developer's real-world experience. Meanwhile, AI-assisted coding has made it increasingly difficult to determine whether candidates genuinely understand the technologies and projects listed in their portfolios.

Vetted addresses these challenges through personalized assessments, deterministic evaluation, and controlled AI assistance.

### How It Works

1. **Portfolio Submission** — Candidates upload structured JSON portfolios containing their projects, technical skills, technology stacks, and solved DSA topics.
2. **AI-Powered Assessment Generation** — The platform analyzes portfolio data and generates challenges aligned with the candidate's experience.
3. **Interactive Coding Environment** — Candidates solve challenges using an integrated code editor with execution and testing capabilities.
4. **Guarded AI Assistance** — Medium and Hard assessments include contextual AI hints without directly revealing solutions.
5. **Automated Evaluation** — Candidate submissions are evaluated using deterministic test cases and isolated execution environments.
6. **Performance Analytics** — Candidates receive detailed reports covering correctness, efficiency, testing behavior, and overall performance.

---

## Key Features

### Portfolio-Driven Personalization

- Structured JSON portfolio intake.
- Analysis of projects, skills, and technology stacks.
- Domain-specific assessment generation.
- Challenges restricted to the candidate's claimed DSA topics.
- Support for Web, Backend, Machine Learning, and Security assessment domains.

### Adaptive Technical Assessments

| Tier | Difficulty | Assessment Type | AI Assistance |
|---|---|---|---|
| Novice | Easy | Localized bug fixes, small features, Easy DSA | Disabled |
| Adept | Medium | Multi-step implementations and Medium DSA | Enabled |
| Master | Hard | Multi-file debugging, optimization, and Medium/Hard DSA | Enabled |

Each assessment is designed to fit within a **60-minute evaluation window**.

### Interactive Coding Workspace

- Monaco-powered code editor.
- Starter code tailored to assessment requirements.
- Multi-file challenge support.
- Code execution and automated testing.
- Real-time error and test-result feedback.
- Assessment timer and submission tracking.

### AI-Powered Assistance

- Contextual debugging suggestions.
- Progressive hints.
- Assistance restricted to Medium and Hard tiers.
- Guardrails against revealing complete solutions.
- AI interaction logging.
- Deterministic AI usage efficiency scoring.

### Deterministic Validation and Grading

- Reference solution validation before challenge release.
- Starter code failure verification.
- Automated unit tests and assertions.
- Isolated code execution.
- Hidden test cases for final evaluation.
- Performance-based evaluation where applicable.

**AI models generate challenges and provide assistance, but do not independently determine solution correctness.**

---

## AI Usage Efficiency

Vetted evaluates not only a candidate's coding ability but also how effectively they use AI assistance during technical assessments.

Unlike traditional assessments that either prohibit AI entirely or allow unrestricted assistance, Vetted introduces a **guarded AI assistant** designed to support problem-solving without directly providing complete solutions.

### How AI Assistance Works

AI assistance is available only in the **Adept (Medium)** and **Master (Hard)** tiers.

The assistant can:

- Explain programming concepts relevant to the challenge.
- Provide contextual debugging hints.
- Help candidates understand visible test failures.
- Suggest debugging strategies and edge cases.
- Guide candidates toward identifying problems independently.

The assistant is restricted from intentionally providing complete solutions, reference implementations, or hidden test cases.

Reference solutions and hidden tests are never included in the assistant's context.

### What Is AI Usage Efficiency?

AI Usage Efficiency measures how productively a candidate uses the built-in assistant.

Instead of simply counting AI requests, Vetted analyzes measurable changes in the candidate's progress following AI interactions.

For example:

1. A candidate initially passes 2 out of 5 tests.
2. The candidate requests an AI debugging hint.
3. The assistant suggests investigating an edge case.
4. The candidate modifies their code and runs the tests again.
5. The candidate now passes 4 out of 5 tests.

This demonstrates measurable progress following AI assistance.

### AI Efficiency Scoring

AI Usage Efficiency contributes **up to 20% of the final assessment score**.

The proposed scoring model evaluates three metrics:

| Metric | Maximum Points | Description |
|---|---:|---|
| Progress per Hint | 10 | Measures test-pass improvements relative to the number of AI hints requested |
| Testing Frequency | 5 | Rewards meaningful testing activity throughout the assessment |
| Hint Efficiency | 5 | Measures whether hints are used purposefully rather than repeatedly without progress |
| **Total** | **20** | |

All scores are calculated deterministically using recorded assessment activity.

**The AI model does not assign efficiency scores.**

Candidates who complete challenges without requesting hints are not automatically penalized. Independent problem-solving remains eligible for full efficiency credit when the applicable scoring conditions are satisfied.

Novice tasks do not include AI assistance, and their absence of AI usage does not reduce the candidate's final score.

### AI Interaction Tracking

Vetted records relevant assessment events, including:

- Number of AI hints requested.
- Timestamp of each AI interaction.
- Test results before and after hints.
- Number of test executions.
- Code changes associated with testing activity.
- Task completion progress.

These events are stored in Supabase PostgreSQL and used by the deterministic scoring engine.

The resulting AI Efficiency Score appears in the candidate's final performance report.

---

## Tech Stack

| Category | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| AI Integration | Featherless AI / OpenRouter |
| Code Editor | Monaco Editor |
| Code Execution | Isolated Sandbox |
| Schema Validation | Zod |
| Testing | Vitest |
| Analytics | Recharts |
| Deployment | Vercel |

---

## System Architecture

```text
Candidate
    |
    v
Next.js Application
    |
    +-- Supabase Auth & PostgreSQL
    |
    +-- Portfolio Validation (Zod)
    |
    +-- AI Assessment Generator
    |       |
    |       +-- Featherless AI / OpenRouter
    |       +-- Task Specification Validation
    |       +-- Reference / Starter Verification
    |
    +-- Coding Assessment Workspace
    |       |
    |       +-- Monaco Editor
    |       +-- Isolated Execution Sandbox
    |       +-- Automated Test Runner
    |       +-- Guarded AI Assistant
    |
    +-- Deterministic Grading Engine
    |       |
    |       +-- Correctness
    |       +-- Performance Constraints
    |       +-- AI Usage Efficiency
    |
    v
Performance Report
```

---

## Project Structure

```text
vetted/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── signup/
│   ├── dashboard/
│   │   ├── portfolio/
│   │   └── assessments/
│   ├── assessment/
│   │   └── [id]/
│   ├── results/
│   │   └── [id]/
│   └── api/
│       ├── portfolios/
│       ├── assessments/
│       ├── execute/
│       ├── submit/
│       ├── assistant/
│       └── results/
├── components/
│   ├── dashboard/
│   ├── assessment/
│   └── reports/
├── lib/
│   ├── supabase/
│   ├── ai/
│   ├── assessment/
│   ├── sandbox/
│   └── schemas/
├── supabase/
│   └── migrations/
├── tests/
├── public/
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Git
- Supabase project
- Featherless AI or OpenRouter API credentials
- Access to a supported isolated code execution service

### Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/vetted.git
cd vetted
```

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

FEATHERLESS_API_KEY=
FEATHERLESS_MODEL=

OPENROUTER_API_KEY=
OPENROUTER_MODEL=

CODE_EXECUTION_API_URL=
```

Configure only the AI provider credentials required by your deployment.

Never expose private API keys or privileged database credentials in client-side environment variables.

### Database Setup

1. Create a Supabase project.
2. Configure email/password authentication.
3. Apply the migrations in `supabase/migrations`.
4. Enable and configure Row Level Security.
5. Add your Supabase credentials to `.env.local`.

### Start Development Server

```bash
npm run dev
```

Open `http://localhost:3000`.

### Run Tests

```bash
npx vitest run
```

---

## Sample Portfolio JSON

```json
{
  "name": "Alex Morgan",
  "domain": "web",
  "skills": [
    "JavaScript",
    "TypeScript",
    "React",
    "Next.js",
    "PostgreSQL"
  ],
  "projects": [
    {
      "name": "E-Commerce Platform",
      "description": "Developed a shopping platform with cart management, authentication, and order processing.",
      "techStack": [
        "Next.js",
        "TypeScript",
        "PostgreSQL"
      ]
    }
  ],
  "dsaTopics": [
    "arrays",
    "strings",
    "hash-maps"
  ]
}
```

---

## Assessment Scoring

Vetted uses a proposed 100-point scoring model:

| Evaluation Metric | Weight |
|---|---:|
| Solution Correctness | 70% |
| Performance and Constraints | 10% |
| AI Usage Efficiency | 20% |
| **Total** | **100%** |

Correctness and performance are determined through executable checks.

AI usage efficiency is calculated from recorded interactions and test activity rather than subjective AI evaluations.

---

## Security Considerations

- Candidate code executes in isolated environments.
- Execution time and resource usage are restricted.
- Hidden test cases and reference solutions remain server-side.
- Submissions are graded through deterministic tests.
- Database access is protected using Supabase Row Level Security.
- API credentials are stored in server-side environment variables.
- AI assistants do not receive reference solutions or hidden tests.
- Assessment endpoints enforce authentication and ownership checks.

---

## Hackathon Information

**Project:** Vetted  
**Tagline:** Beyond the Résumé.  
**Team:** Tellitubies  
**Category:** AI / Developer Tools / Technical Assessment  
**Duration:** 24 Hours  
**Dates:** October 30–31, 2026

### Problem Statement

Build an interactive, portfolio-driven technical assessment platform that generates personalized coding challenges based on a candidate's domain, technical skills, and claimed DSA topics.

The platform must support adaptive assessments, deterministic grading, isolated code execution, guarded AI assistance, and comprehensive performance analytics.

### Our Approach

Vetted combines portfolio intelligence, AI-powered assessment generation, deterministic evaluation, and measurable AI-assisted problem-solving to create a more relevant technical assessment experience.

Rather than evaluating every developer using identical questions, Vetted aims to assess candidates within the context of the technologies and skills they claim to understand.

---

## Future Scope

- GitHub repository integration for portfolio verification.
- Resume and PDF portfolio parsing.
- Additional programming languages and execution runtimes.
- Recruiter dashboards and candidate comparisons.
- Advanced plagiarism and integrity analysis.
- Organization-specific assessment templates.
- Skill progression tracking.
- Enterprise assessment management.

---

## Team

**Tellitubies**

Built during a 24-hour hackathon.

**Vetted — Beyond the Résumé.**

*Real skills. Real challenges. Real proof.*

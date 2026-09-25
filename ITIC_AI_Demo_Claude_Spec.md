# ITIC Global — Travel Assistance AI Platform

## Claude Autonomous Build, Test & Deployment Specification

### Project Objective

Build a polished, working demonstration platform for ITIC Global that showcases AI automation for travel assistance and healthcare operations.

The platform must demonstrate real working workflows, not static screenshots.

The final application should communicate:

> **AI-powered automation for travel assistance and healthcare operations.**

This is a demonstration/prototype platform. It is not intended to be a production medical decision-making system.

---

# 1. Core Requirements

Build one unified web application called:

**Travel Assistance AI Platform**

The application must contain these six modules:

1. Medical Document AI
2. AI Case Manager
3. Claims Automation
4. Provider Search
5. Internal AI Assistant
6. AI Voice Medical Assistance Agent

### Priority

**Highest priority**
- Medical Document AI
- AI Case Manager

**High priority**
- AI Voice Medical Assistance Agent

**Supporting prototypes**
- Claims Automation
- Provider Search
- Internal AI Assistant

All six modules must actually work with seeded fictional demo data.

---

# 2. Autonomous Implementation Rule

Claude must behave as an autonomous software engineer.

Do not stop after generating code.

For every feature:

1. Understand the requirement.
2. Design the implementation.
3. Implement it.
4. Run the application.
5. Run automated tests.
6. Test the feature manually where appropriate.
7. Identify errors.
8. Fix errors.
9. Re-run tests.
10. Verify the complete workflow.
11. Only then mark the feature as complete.

Use this loop:

**Implement → Run → Test → Fix → Retest → Verify**

Do not declare a feature complete merely because the code compiles.

---

# 3. No Fake Functionality

Do not create:

- Fake buttons that do nothing
- Empty pages
- Placeholder dashboards
- Fake screenshots
- "Coming soon" modules
- Hardcoded UI pretending to be an AI result when a functional implementation is practical

Sample/demo data is allowed.

Mock external services are allowed when real external integrations are unavailable.

If an external service is mocked, clearly isolate it behind a service interface so it can later be replaced with a real API.

---

# 4. Recommended Technology

Use a modern TypeScript-based stack.

Preferred:

- Next.js
- React
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma or equivalent ORM
- Node.js
- Docker
- Docker Compose

AI integrations should be abstracted behind service interfaces.

Example interfaces:

- `AIService`
- `DocumentExtractionService`
- `ProviderSearchService`
- `AppointmentService`
- `VoiceAgentService`
- `NotificationService`

Do not tightly couple the entire application to one external provider.

---

# 5. Unified Dashboard

Create a professional dashboard titled:

## Travel Assistance AI Platform

Subtitle:

**AI-powered automation for travel assistance and healthcare operations**

Display six module cards:

### Medical Document AI
Extract structured information from medical documents.

### AI Case Manager
Turn incoming assistance requests into actionable cases.

### Claims Automation
Assist with claim document processing and review.

### Provider Search
Find suitable healthcare providers.

### Internal AI Assistant
Ask questions about cases, providers and operational knowledge.

### Voice Medical Assistance Agent
Help travellers find and book medical appointments through voice.

Every card must have:

**Launch Demo**

---

# 6. Module 1 — Medical Document AI

## Objective

Demonstrate AI-powered processing of medical documents.

## Workflow

```text
Upload PDF
   ↓
Document Processing
   ↓
Text/OCR Extraction
   ↓
AI Structured Extraction
   ↓
Validation
   ↓
Summary
   ↓
Missing Information
```

## UI

Create:

### Left side
Document viewer/upload area.

### Right side
Structured extraction.

Show:

- Patient name
- Date of birth
- Hospital
- Doctor
- Diagnosis
- Symptoms
- Admission date
- Discharge date
- Procedures
- Medications
- Invoice amount
- Currency
- Policy/claim reference

Also display:

### AI Summary

A concise case summary.

### Missing Information

For example:

- Policy number missing
- Discharge summary unavailable
- Doctor signature not detected

## Requirements

The upload must actually trigger processing.

For demo purposes, use several fictional medical PDFs.

The extraction pipeline can use an AI provider or a deterministic fallback for seeded demo documents.

The UI must show loading, success and error states.

---

# 7. Module 2 — AI Case Manager

## Objective

Demonstrate AI-assisted case intake and management.

## Example Input

Use a fictional incoming assistance request:

> "My husband is travelling in Istanbul and has developed severe stomach pain. We are staying near Taksim. We need help finding a hospital."

## AI should identify

- Patient
- Location
- Medical issue
- Assistance type
- Urgency
- Requested action
- Existing case, if any

## UI

Display:

### Case Summary

### Extracted Information

### Suggested Actions

For example:

- Find medical provider
- Arrange appointment
- Contact provider
- Escalate to human case manager

### Case Details

- Case ID
- Patient
- Location
- Assistance type
- Priority
- Status
- Assigned case manager

Provide:

**Create Case**

The button must actually create a database record.

---

# 8. Module 3 — Claims Automation

## Objective

Demonstrate AI-assisted claims processing.

## Input Documents

Use fictional:

- Medical report
- Hospital invoice
- Prescription
- Discharge summary

## Workflow

```text
Upload Documents
      ↓
Classify Documents
      ↓
Extract Claim Information
      ↓
Check Completeness
      ↓
Identify Issues
      ↓
Generate Claim Summary
      ↓
Human Review
```

## Example Output

Claim:

`CLM-10245`

Status:

`Needs Review`

Issues:

- Policy number missing
- Invoice available
- Medical report available
- Discharge summary available

Actions:

**Approve**

**Request Information**

**Escalate**

Actions should update the demo claim state.

---

# 9. Module 4 — Provider Search

## Objective

Demonstrate AI-assisted provider discovery.

## Input

- Location: Istanbul
- Specialty: General Medicine
- Date: Tomorrow
- Time: Afternoon
- Language: English

## Provider Result

Show fictional providers with:

- Provider name
- Hospital/clinic
- Specialty
- Location
- Distance
- Language
- Available appointment
- Contact information

Include:

### Why this provider?

Example:

- Near patient's location
- Required specialty
- English-speaking doctor
- Availability matches requested time

All provider data must be fictional/demo data.

---

# 10. Module 5 — Internal AI Assistant

## Objective

Create a lightweight RAG demonstration.

The assistant should answer questions based on seeded fictional company documents.

## Example Questions

> What documents are required for a hospitalization case?

> What is the status of CASE-1024?

> What is the process for arranging hospital admission?

> Which providers are available in Istanbul?

The assistant should return:

- Answer
- Relevant information
- Source/reference where applicable

Create a small document knowledge base.

Use a vector store where practical.

The implementation should remain simple enough for the demo.

---

# 11. Module 6 — AI Voice Medical Assistance Agent

## Objective

Build a browser-based voice agent that performs a real healthcare assistance workflow.

This should NOT be a generic chatbot.

The agent must complete an operational task.

## Primary Scenario

A traveller in Istanbul needs a medical appointment.

Example:

User says:

> "I'm travelling in Istanbul and I need to see a doctor tomorrow."

The agent should understand the request and guide the user through the workflow.

---

# 12. Voice Agent Workflow

## Step 1 — Understand Request

Identify:

- Medical assistance
- Location
- Appointment requirement

## Step 2 — Collect Information

Ask only necessary questions.

Collect:

- Patient name
- Location
- Medical problem/specialty
- Preferred date
- Preferred time
- Language preference
- Contact information

Do not collect unnecessary sensitive information.

## Step 3 — Provider Search

Search the demo provider database.

Example:

> "I found three providers near Taksim. One has an English-speaking doctor available tomorrow at 2 PM."

## Step 4 — Present Options

Give the user available options.

The user chooses one.

## Step 5 — Confirmation

Confirm:

- Provider
- Specialty
- Date
- Time
- Location

The agent MUST ask for explicit confirmation before booking.

## Step 6 — Appointment Booking

Create an actual demo appointment record.

Example:

`APT-2026-1024`

Status:

`Confirmed`

## Step 7 — Case Creation

Create/update:

`CASE-10452`

Store:

- Patient
- Location
- Reason
- Provider
- Appointment
- Voice interaction summary
- Status

## Step 8 — Human Handoff

Display:

**AI Completed → Human Case Manager**

The case manager should see the generated summary.

---

# 13. Voice UI

Display:

### Voice Status

- Listening
- Processing
- Speaking

### Live Transcript

Show the conversation.

### Patient Information

Show collected information.

### Provider

Show provider options/selected provider.

### Appointment

Show appointment details.

### Case

Show created case.

The voice agent must be usable from a normal laptop browser.

Do not build full PSTN/telephony infrastructure for this demo.

---

# 14. End-to-End Demo Story

The six modules should collectively communicate:

```text
Customer
   ↓
Voice / Email
   ↓
AI Understanding
   ↓
Case Creation
   ↓
Medical Documents
   ↓
Provider Search
   ↓
Appointment
   ↓
Claims
   ↓
Human Operations
```

This is the core business story.

---

# 15. Demo Data

Create entirely fictional data.

Never use real patient information.

Seed:

- 10 fictional patients
- 15 fictional cases
- 20 fictional providers
- 10 fictional claims
- 10 fictional appointments
- 5–10 fictional medical documents
- 5–10 operational knowledge documents

Use Istanbul/Turkey heavily in the demo because the platform is being demonstrated at ITIC Global.

---

# 16. Error Handling

Every module must handle:

- Empty input
- Invalid input
- Upload failure
- AI failure
- Database failure
- Network failure
- Provider unavailable
- Appointment unavailable
- Voice failure

Do not expose stack traces to users.

Show useful error messages.

---

# 17. Database

Use PostgreSQL.

Create appropriate models for at least:

- Patient
- Case
- Provider
- Appointment
- Claim
- Document
- DocumentExtraction
- Conversation
- KnowledgeDocument

Use migrations.

Create seed scripts.

The seed operation must be repeatable or safely idempotent.

Use environment variables for database credentials.

Never commit production credentials.

---

# 18. Docker

Everything must be Dockerized.

Create:

- `Dockerfile`
- `docker-compose.yml`
- production-oriented Docker configuration
- development configuration where useful

At minimum:

```text
Application
PostgreSQL
```

Use persistent Docker volumes for PostgreSQL.

Do not store the database only in the container filesystem.

Provide health checks.

Containers should restart appropriately.

---

# 19. Environment Configuration

Create:

`.env.example`

Document variables such as:

```text
DATABASE_URL=
AI_API_KEY=
NEXT_PUBLIC_APP_URL=
```

Never commit actual secrets.

Separate:

- Development
- Staging
- Production

where practical.

---

# 20. First-Time AWS EC2 Deployment

The first deployment can be manual.

Target environment:

**AWS EC2**

Claude must create a deployment guide that performs:

1. EC2 provisioning
2. SSH access
3. Docker installation
4. Docker Compose installation
5. Git installation
6. Repository clone
7. Production environment configuration
8. Database startup
9. Database migration
10. Database seed
11. Application startup
12. Health-check verification

The first deployment should be documented clearly enough that a developer can repeat it manually.

---

# 21. EC2 Deployment Architecture

Use:

```text
Internet
   ↓
Nginx / Reverse Proxy
   ↓
Application Container
   ↓
PostgreSQL Container
```

Use Docker Compose to manage application services.

Keep database data on a persistent volume.

If HTTPS is configured, document the certificate setup.

Do not hardcode secrets into Docker images.

---

# 22. GitHub Actions CI/CD

After the first manual deployment is working, automate deployment.

Pipeline:

```text
Developer
   ↓
git push
   ↓
GitHub
   ↓
GitHub Actions
   ↓
Install dependencies
   ↓
Lint
   ↓
Type check
   ↓
Unit tests
   ↓
Build
   ↓
SSH into EC2
   ↓
git pull
   ↓
Docker Compose build
   ↓
Database migration
   ↓
Docker Compose restart
   ↓
Health check
   ↓
Deployment result
```

Do not deploy if required tests fail.

---

# 23. SSH-Based Deployment

Use SSH from GitHub Actions to connect to EC2.

GitHub Actions secrets should contain the required SSH credentials.

Never commit:

- Private SSH keys
- `.env`
- AWS credentials
- AI API keys
- Database passwords

The deployment should execute a controlled script on EC2.

For example:

`deploy.sh`

The script should:

1. Move to application directory
2. Pull latest code
3. Validate environment
4. Build/update containers
5. Run migrations
6. Restart services
7. Check application health
8. Report success/failure

---

# 24. Manual Deployment Fallback

Manual deployment must always remain possible.

Document:

```bash
ssh <user>@<ec2-host>
cd <application-directory>
git pull
docker compose build
docker compose up -d
docker compose exec app <migration-command>
```

Use the actual commands appropriate to the final project structure.

The team must not become dependent on GitHub Actions for emergency deployment.

---

# 25. Health Checks

Create a health endpoint:

`/api/health`

It should verify application availability.

Where appropriate, also verify database connectivity.

Deployment should only be considered successful if the health check returns a successful response.

---

# 26. Testing Requirements

Implement:

### Unit Tests

For:

- Data extraction
- Case creation
- Provider matching
- Appointment creation
- Claim validation
- AI response parsing

### Integration Tests

Test:

- Database operations
- API endpoints
- Case workflow
- Appointment workflow

### End-to-End Tests

At minimum test:

#### Medical Document

```text
Upload → Process → Extract → Display
```

#### Case Manager

```text
Request → AI analysis → Create Case → Case visible
```

#### Voice Agent

```text
Voice/request → Provider search → Select provider → Confirm → Appointment → Case
```

#### Claims

```text
Upload → Process → Validation → Review
```

---

# 27. Verification Gate

After each module:

```text
Implementation
↓
Build
↓
Unit Tests
↓
Integration Tests
↓
Manual Test
↓
Fix Issues
↓
Retest
↓
Verification
```

Do not proceed to the next major module if the current module is broken.

---

# 28. Final Acceptance Test

Before declaring the project complete, execute the entire platform from a clean environment.

Verify:

### Dashboard

- All modules open.
- No broken links.
- Responsive UI.

### Medical Document AI

- Sample document processes successfully.
- Extraction appears.
- Summary appears.

### Case Manager

- Request is processed.
- Case is created.
- Case appears in database/UI.

### Claims

- Documents process.
- Issues appear.
- Review actions work.

### Provider Search

- Search works.
- Providers appear.
- Provider selection works.

### AI Assistant

- Questions receive answers.
- Knowledge documents are used.

### Voice Agent

- Voice interaction works.
- Provider search works.
- User can select a provider.
- Confirmation works.
- Appointment is created.
- Case is created/updated.

### Deployment

- Docker Compose starts successfully.
- PostgreSQL persists data.
- EC2 deployment works.
- GitHub Actions pipeline works.
- Health check passes.

---

# 29. Security Requirements

This is a demo platform, but follow basic security practices.

Implement:

- Environment-based secrets
- No credentials in source code
- Input validation
- Basic API validation
- Safe file upload handling
- File-size limits
- Allowed file types
- SQL injection protection through ORM
- Proper error handling
- No sensitive information in logs

Clearly label all data as fictional demo data.

---

# 30. UX Requirements

The UI should look like a real B2B SaaS product.

Requirements:

- Clean layout
- Consistent navigation
- Clear loading states
- Empty states
- Error states
- Success states
- Responsive laptop/tablet layout
- Consistent buttons and forms
- Clear status badges
- Useful tables/cards

Avoid unnecessary animations.

Prioritize reliability over visual complexity.

---

# 31. Development Order

Claude should follow this order:

## Phase 1 — Project Setup

- Repository
- Next.js
- TypeScript
- UI framework
- PostgreSQL
- ORM
- Docker
- Environment configuration

## Phase 2 — Database and Seed Data

- Schema
- Migrations
- Seed data
- Sample documents

## Phase 3 — Unified Dashboard

## Phase 4 — Medical Document AI

## Phase 5 — AI Case Manager

## Phase 6 — Voice Medical Assistance Agent

## Phase 7 — Claims Automation

## Phase 8 — Provider Search

## Phase 9 — Internal AI Assistant

## Phase 10 — Testing and Hardening

## Phase 11 — Docker Production Setup

## Phase 12 — Manual EC2 Deployment

## Phase 13 — GitHub Actions SSH Deployment

## Phase 14 — Final End-to-End Verification

---

# 32. Claude Working Rules

While implementing:

1. Inspect the existing repository before changing anything.
2. Do not overwrite existing working functionality unnecessarily.
3. Reuse existing components where appropriate.
4. Keep architecture modular.
5. Keep external integrations behind interfaces.
6. Use realistic demo data.
7. Do not leave TODOs for core functionality.
8. Do not leave broken buttons.
9. Do not silently ignore errors.
10. Run tests after meaningful changes.
11. Fix failures before continuing.
12. Keep documentation updated.
13. Keep deployment reproducible.
14. Do not commit secrets.
15. Verify the actual running application, not just source code.

---

# 33. Final Deliverables

Claude must produce:

### Application

Complete working web application.

### Database

- Schema
- Migrations
- Seed data

### AI

Working AI integrations with sensible fallback/mock services where external dependencies are unavailable.

### Voice

Working browser-based voice appointment workflow.

### Docker

- Dockerfile
- Docker Compose
- Environment documentation

### Testing

- Unit tests
- Integration tests
- End-to-end tests

### Deployment

- EC2 setup guide
- Manual deployment procedure
- GitHub Actions workflow
- SSH deployment script
- Health-check procedure
- Rollback procedure

### Documentation

Create:

```text
README.md
ARCHITECTURE.md
DEPLOYMENT.md
TESTING.md
DEMO_GUIDE.md
ENVIRONMENT.md
```

---

# 34. Demo Guide

Create a short demo script for ITIC.

Do not start by showing every module.

Start with:

> "What is the most manual part of your assistance operation today?"

Then select the relevant demonstration.

### If they mention documents

Show Medical Document AI.

### If they mention case management

Show AI Case Manager.

### If they mention customer calls

Show Voice Medical Assistance Agent.

### If they mention claims

Show Claims Automation.

### If they mention provider coordination

Show Provider Search.

### If they mention internal information

Show Internal AI Assistant.

The goal is discovery, not showing every feature.

---

# 35. Business Positioning

The platform should communicate:

> **We help travel assistance and healthcare companies add AI automation to their existing operations.**

Do not position this as:

> "Replace your existing software."

Position it as:

> **"Give us one manual workflow and we can build an AI-powered pilot around it."**

The demo platform exists to open that conversation.

---

# 36. Final Definition of Done

The project is complete only when:

- All six modules are accessible.
- The two priority modules are polished.
- The voice appointment workflow works end-to-end.
- Demo data is seeded.
- Core workflows have automated tests.
- Critical workflows have been manually verified.
- Docker deployment works.
- PostgreSQL persistence works.
- First-time EC2 deployment is documented and tested.
- GitHub Actions SSH deployment works.
- Health checks work.
- No secrets are committed.
- No critical console/runtime errors remain.
- No core buttons are non-functional.
- README and deployment documentation are complete.

Finally, run a clean end-to-end test from the deployed EC2 environment and report:

```text
Build: PASS/FAIL
Tests: PASS/FAIL
Medical Document AI: PASS/FAIL
AI Case Manager: PASS/FAIL
Voice Agent: PASS/FAIL
Claims Automation: PASS/FAIL
Provider Search: PASS/FAIL
AI Assistant: PASS/FAIL
Docker: PASS/FAIL
Database: PASS/FAIL
EC2 Deployment: PASS/FAIL
GitHub Actions Deployment: PASS/FAIL
Health Check: PASS/FAIL
```

Do not claim completion until the actual results have been verified.

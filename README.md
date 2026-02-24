# Felicity Event Management System

**Roll No:** 2024111015  
**Stack:** MongoDB  Express.js  React  Node.js (MERN)

Centralized platform for managing clubs, events, registrations, and participants at IIIT Hyderabad's Felicity fest.

---

## User Roles

| Role | Capabilities |
|------|-------------|
| **Participant** (IIIT / External) | Browse & register for events, purchase merchandise, team registration, forum, feedback |
| **Organizer** | Create/manage events, view participants, mark attendance, approve payments, analytics |
| **Admin** | Approve events, manage users/organizers, handle password reset requests |

---

## Project Structure

```
2024111015/
 backend/
    config/db.js
    middleware/authMiddleware.js      # JWT verify + role guard
    middleware/upload.js             # Multer config
    models/                          # User, Event, Registration, Team, ForumPost, Feedback, PasswordResetRequest
    routes/                          # auth, event, registration, organizer, participant, team, forum, admin, feedback
    utils/email.js                   # Nodemailer helpers (ticket, order, approval, rejection, cancellation)
    scripts/seedAdmin.js             # One-time admin seed
    uploads/                         # Payment proof images (served statically)
    .env                             # Secrets (not committed)
    index.js                         # Entry point + Socket.IO
 frontend/
    src/
        context/AuthContext.js       # Global auth state
        components/Navbar.js
        pages/                       # Login, Register, Onboarding, Profile, Events, EventDetails,
                                       # ParticipantDashboard, OrganizerDashboard, OrganizerEventDetail,
                                       # CreateEvent, OrganizerProfile, AdminDashboard, ClubsPage,
                                       # OrganizerDetailPage, JoinTeamPage
        api.js                       # Axios base config
        App.js                       # Routes + role-based redirects
 README.md
 deployment.txt
```

---

## Tech Stack & Library Justifications

### Backend

| Library | Justification |
|---------|---------------|
| **Express.js v5** | Minimal HTTP framework. v5 propagates async errors automatically without try/catch on every route. |
| **MongoDB Atlas + Mongoose** | Document store suits nested event structures (merchandise variants, team configs, custom form fields). Mongoose adds schema validation, compound unique indexes, and pre-save hooks (password hashing). |
| **jsonwebtoken** | Stateless JWT auth. Token stores only user ID; role is re-fetched from DB on every request to prevent client-side tampering. 7-day expiry. |
| **bcryptjs** | Pure-JS bcrypt for password hashing via User model pre-save hook. |
| **nodemailer** | Gmail SMTP for ticket emails (QR attached), order confirmation, cancellation, and payment approval/rejection. |
| **qrcode** | Server-side PNG buffer generation. QR encodes the ticket ID and is embedded as a CID inline attachment (not a data URI, which Gmail blocks). |
| **multer** | Handles multipart/form-data for payment proof image uploads to `uploads/` via diskStorage. |
| **socket.io** | WebSockets with long-polling fallback. Powers the real-time discussion forum with per-event rooms. |
| **dotenv** | Loads `.env` into `process.env`. Keeps secrets out of source code. |
| **cors** | Allows the React dev server (port 3000) to call Express (port 5000). |
| **axios** | HTTP client used for Discord webhook calls from the backend. |

### Frontend

| Library | Justification |
|---------|---------------|
| **React 18** | Component-based UI. Hooks manage local state cleanly per page. |
| **react-router-dom v6** | Client-side routing. `<Navigate>` handles role-based redirects declaratively. |
| **axios** | Auto-parses JSON, throws on non-2xx, clean Authorization header attachment. |
| **socket.io-client** | Matched version to server. Handles reconnection and room events for the forum. |
| **qrcode.react** | Renders QR codes as SVG in-browser on the participant dashboard ticket view. |
| **React Context API** | Global auth state without Redux overhead  app's state-sharing needs are narrow. |
| **Custom CSS** | No UI framework  keeps bundle small, consistent card/badge/grid design system. |

---

## Advanced Features

### Tier A  Core Advanced Features

**A1: Merchandise Payment Approval Workflow**

Participants purchase merchandise and upload a payment proof screenshot. Organizers review proof images, then approve (deducts stock, sends QR ticket email) or reject (sends rejection email, allows re-upload). Stock is only decremented on approval.

The `Registration` model tracks `paymentStatus`: `not_required  pending_proof  pending_approval  approved / rejected`.

*Justification:* Physical merch sales at college fests are prone to screenshot disputes. A structured approval flow with image evidence and email notifications provides a clear audit trail.

**A2: Hackathon Team Registration**

Events can set `isTeamEvent`, `minTeamSize`, `maxTeamSize`. Participant A creates a team and gets a 6-char invite code. Participant B joins via code. When members reach `minTeamSize`, all are auto-registered and each receives a ticket email. A dedicated `Team` model stores the invite code, leader, and member list.

*Justification:* Team-based registrations are central to hackathons. Without this, organizers would manually group individual registrations.

### Tier B  Real-time & Communication Features

**B1: Real-Time Discussion Forum**

Each event has a persisted live forum. Messages are stored in MongoDB (`ForumPost`) and broadcast instantly via Socket.IO to all connected viewers in a per-event room. Organizers can delete/pin messages and post announcements. Non-registered participants are blocked.

*Justification:* Pre-event Q&A floods organizer WhatsApp groups. An in-platform forum keeps communication organized, searchable, and persistent.

**B2: Organizer Password Reset Workflow**

Organizers submit a reset request with a reason. Admin reviews all pending requests in a dedicated tab. Upon approval, a new password is auto-generated, hashed, saved, and shown to admin. Upon rejection, a comment is stored and shown to the organizer.

*Justification:* Admin-approval model adds identity verification appropriate for privileged accounts, compared to a standard email token flow.

### Tier C  Integration & Enhancement

**C1: Anonymous Feedback System**

Participants with `status === 'attended'` submit a 15 star rating and optional comment. The `participant` field is stored to enforce a compound unique index (one submission per user per event) but is **always excluded from API responses**  organizers cannot see who submitted what. Organizers see aggregated average, per-star distribution bars, and a rating filter.

*Justification:* Enforced anonymity encourages honest reviews. Structured post-event feedback gives organizers actionable data.

---

## Setup & Installation

### Prerequisites

- Node.js v18+ and npm v9+
- MongoDB Atlas account (free tier works)
- Gmail with App Password enabled (optional  only needed for emails)

### 1  Backend

```bash
cd backend
npm install
```

Create `backend/.env` (see deployment.txt for all variables), then:

```bash
npm start      # production
npm run dev    # development (nodemon)
```

### 2  Frontend

```bash
cd frontend
npm install
npm start
```

Open **http://localhost:3000**. Both servers must run simultaneously.

### 3  Seed admin account

```bash
cd backend
npm run seed:admin
```

Credentials: `admin@felicity.iiit.ac.in` / `Admin@123`

---

## Email Triggers

| Trigger | Email |
|---------|-------|
| Normal event registration | Ticket + QR code |
| Paid merch order placed | "Upload payment proof" reminder |
| Organizer approves payment | Ticket + QR code |
| Organizer rejects payment | Rejection notice |
| Participant cancels registration | Cancellation confirmation |
| Admin approves password reset | Auto-generated new password |
| Team fully formed | Ticket + QR for all members |

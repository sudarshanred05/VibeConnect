# VibeConnect Knowledge Chatbot

Enterprise MERN chat application upgraded into a VibeConnect-exclusive AI knowledge assistant. The existing chat UI, JWT auth, admin approval dashboard, Socket.IO chat flow, MongoDB models, and upload middleware are reused; the new AI layer adds corpus ingestion, local vector retrieval, grounded RAG answers, source citations, confidence scoring, analytics, and admin knowledge controls.

## Features

- JWT login, registration approval, and admin RBAC
- Existing real-time 1:1 and group chat experience
- Dedicated VibeConnect AI tab using corpus-grounded RAG
- Seed VibeConnect corpus auto-indexed on first AI/admin corpus use
- Admin upload for `.txt`, `.md`, `.pdf`, and `.docx` knowledge files
- Manual corpus update form and seed re-index action
- Query analytics, failed-query tracking, categories, confidence, and citations
- Groq or OpenAI chat completion support through environment variables
- Docker Compose setup with MongoDB, backend, and frontend

## Architecture

- Frontend: React + Vite, existing `ChatWindow`, `Sidebar`, `RightSidebar`, and `AdminDashboard`
- Backend: Express, existing auth/admin/upload/chat routes, new `/api/corpus` routes and upgraded `/api/ai/chat`
- Database: MongoDB collections for users, chats, messages, corpus documents, corpus chunks, query analytics, and feedback
- Vector search: local hashed embedding vectors stored in MongoDB for zero external vector DB setup
- LLM: Groq via OpenAI-compatible API when `GROQ_API_KEY` is present, otherwise OpenAI when `OPENAI_API_KEY` is present, otherwise local extractive answers

## Environment

Copy examples and fill real values locally:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Do not commit real API keys. If an API key was pasted into chat or source control, rotate it before deployment.

## Local Development

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Open the frontend at `http://localhost:3001` or the Vite-provided local URL.



Frontend: `http://localhost:3001`
Backend: `http://localhost:5000`

## Deployment Notes

- Frontend can deploy to Vercel or Netlify with `VITE_API_URL` pointing to the backend `/api`.
- Backend can deploy to Render, Railway, AWS, or similar Node hosting.
- Use MongoDB Atlas for production `MONGO_URI`.
-  improve coverage by uploading approved VibeConnect documents or adding manual knowledge snippets from the Admin Dashboard.

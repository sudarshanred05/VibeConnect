# Darwinbox Knowledge Chatbot

Enterprise MERN chat application upgraded into a Darwinbox-exclusive AI knowledge assistant. The existing chat UI, JWT auth, admin approval dashboard, Socket.IO chat flow, MongoDB models, and upload middleware are reused; the new AI layer adds corpus ingestion, local vector retrieval, grounded RAG answers, source citations, confidence scoring, analytics, and admin knowledge controls.

## Features

- JWT login, registration approval, and admin RBAC
- Existing real-time 1:1 and group chat experience
- Dedicated Darwinbox AI tab using corpus-grounded RAG
- Seed Darwinbox corpus auto-indexed on first AI/admin corpus use
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

Open the frontend at `http://localhost:3000` or the Vite-provided local URL.

## Docker

```bash
docker compose up --build
```

Frontend: `http://localhost:3000`
Backend: `http://localhost:5000`

## Deployment Notes

- Frontend can deploy to Vercel or Netlify with `VITE_API_URL` pointing to the backend `/api`.
- Backend can deploy to Render, Railway, AWS, or similar Node hosting.
- Use MongoDB Atlas for production `MONGO_URI`.
- Set `GROQ_API_KEY` or `OPENAI_API_KEY` in the backend host secret manager.
- Keep `JWT_SECRET` and `JWT_REFRESH_SECRET` long, random, and environment-specific.
- Upload limits are controlled by `MAX_FILE_SIZE`.

## RAG Behavior

The assistant answers only from indexed Darwinbox corpus chunks. If retrieval confidence is too low, it responds:

```text
This information is not available in the Darwinbox knowledge base.
```

Admin users can improve coverage by uploading approved Darwinbox documents or adding manual knowledge snippets from the Admin Dashboard.

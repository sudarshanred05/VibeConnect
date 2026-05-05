const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const CorpusDocument = require("../models/CorpusDocument");
const CorpusChunk = require("../models/CorpusChunk");
const QueryAnalytics = require("../models/QueryAnalytics");
const { cosineSimilarity, embedText, tokenize } = require("./vectorService");
const { indexCorpusText } = require("./corpusService");

const NOT_FOUND_RESPONSE = "This information is not available in the Darwinbox knowledge base.";
const MIN_CONFIDENCE = Number(process.env.RAG_MIN_CONFIDENCE || 0.12);
const TOP_K = Number(process.env.RAG_TOP_K || 6);
const WEB_FALLBACK_ENABLED = process.env.WEB_FALLBACK_ENABLED !== "false";

const seedPath = path.join(__dirname, "../data/darwinbox-seed-corpus.md");

const buildClient = () => {
  if (process.env.GROQ_API_KEY) {
    return {
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      }),
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    };
  }

  return { client: null, model: "local-extractive" };
};

const buildSystemPrompt = () => `You are DarwinBot, a Darwinbox-exclusive enterprise knowledge assistant.

Rules:
- Answer ONLY from the retrieved Darwinbox context.
- If the context does not contain the answer, reply exactly: "${NOT_FOUND_RESPONSE}"
- Do not invent prices, customers, roadmap, integrations, certifications, dates, or statutory rules.
- Keep answers professional and concise.
- For process questions, use numbered steps.
- Do not mention internal source labels such as SOURCE 1, SOURCE 2, or corpus section names.`;

const buildWebPrompt = () => `You are DarwinBot, a formal enterprise assistant.

Rules:
- Answer from the provided web search results only.
- Be clear that the answer is based on web information, not the internal Darwinbox knowledge base.
- Keep answers professional, concise, and useful.
- Do not mention internal source labels such as SOURCE 1 or result numbers.
- If the web results are insufficient, say that reliable public information was not found.`;

const buildGeneralPrompt = () => `You are DarwinBot, a friendly and helpful AI assistant inside the Darwinbox workplace app.

Behavior:
- Reply naturally to greetings, small talk, and general questions.
- For greetings (hi, hello, hey, good morning, etc.), respond warmly in 1-2 sentences and offer to help.
- For thanks/acknowledgements, reply briefly and politely.
- For general knowledge questions, answer concisely and accurately like a helpful general assistant.
- If the user asks about Darwinbox/HR-specific things, mention that you can also help with HR policies, leave, payroll, attendance, performance, etc.
- Keep tone professional but warm. Use plain text, no source citations, no SOURCE labels.
- Never say "not available in the Darwinbox knowledge base" for casual or general questions — just answer helpfully.`;

const SMALL_TALK_PATTERNS = [
  /^\s*(hi+|hello+|hey+|hiya|yo|hola|namaste|namaskar)[\s!.?,]*$/i,
  /^\s*(good\s*(morning|afternoon|evening|night|day))[\s!.?,]*$/i,
  /^\s*(how\s*(are|r)\s*(you|u|ya))[\s!.?,]*$/i,
  /^\s*(what'?s\s*up|whats\s*up|sup|wassup)[\s!.?,]*$/i,
  /^\s*(thanks?|thank\s*you|thx|ty|thnx|cheers|much\s*appreciated)[\s!.?,]*$/i,
  /^\s*(ok+|okay|cool|nice|great|awesome|got\s*it|alright)[\s!.?,]*$/i,
  /^\s*(bye+|goodbye|see\s*ya|see\s*you|cya|tata|take\s*care)[\s!.?,]*$/i,
  /^\s*(who\s*are\s*you|what\s*are\s*you|your\s*name)[\s!.?,]*$/i,
];

const detectSmallTalk = (question = "") => {
  const text = String(question).trim();
  if (!text) return null;
  if (text.length > 60) return null;
  for (const pattern of SMALL_TALK_PATTERNS) {
    if (pattern.test(text)) return text;
  }
  return null;
};

const generateSmallTalkReply = (question = "") => {
  const text = String(question).trim().toLowerCase();
  if (/^(hi|hello|hey|hiya|yo|hola|namaste|namaskar)/.test(text)) {
    return "Hey! 👋 I'm DarwinBot. How can I help you today — Darwinbox policies, HR questions, or anything else?";
  }
  if (/^good\s*morning/.test(text)) return "Good morning! Hope your day's off to a great start. How can I help?";
  if (/^good\s*afternoon/.test(text)) return "Good afternoon! What can I help you with?";
  if (/^good\s*(evening|night)/.test(text)) return "Good evening! What can I help you with?";
  if (/^how\s*(are|r)\s*(you|u|ya)/.test(text)) return "I'm doing great, thanks for asking! How can I help you today?";
  if (/^(what'?s\s*up|whats\s*up|sup|wassup)/.test(text)) return "Not much — just here to help! What's on your mind?";
  if (/^(thanks?|thank\s*you|thx|ty|thnx|cheers|much\s*appreciated)/.test(text)) return "You're welcome! Let me know if there's anything else.";
  if (/^(ok+|okay|cool|nice|great|awesome|got\s*it|alright)/.test(text)) return "👍 Anything else I can help with?";
  if (/^(bye+|goodbye|see\s*ya|see\s*you|cya|tata|take\s*care)/.test(text)) return "Take care! I'm here whenever you need me. 👋";
  if (/(who|what)\s*(are|r)\s*you|your\s*name/.test(text)) {
    return "I'm DarwinBot — your AI assistant inside Darwinbox. I can help with HR policies, leave, payroll, attendance, and general questions too.";
  }
  return "Hi there! How can I help you today?";
};

const looksLikeDarwinboxQuestion = (question = "") => {
  const text = String(question).toLowerCase();
  const keywords = [
    "darwinbox", "hr", "human resource", "leave", "pto", "comp off", "compoff", "attendance",
    "payroll", "salary", "ctc", "payslip", "tax", "tds", "form 16", "epf", "pf ", "esi",
    "onboarding", "offboarding", "probation", "appraisal", "performance", "kra", "okr", "goals",
    "policy", "policies", "holiday", "shift", "roster", "manager", "reportee", "team",
    "expense", "reimbursement", "travel", "claim", "asset", "helpdesk", "ticket",
    "recruit", "hiring", "interview", "resignation", "exit", "notice period",
    "module", "esg", "lms", "training", "certificate", "course",
  ];
  return keywords.some((kw) => text.includes(kw));
};

const normalizeSource = (item) => ({
  chunkId: item._id,
  title: item.title,
  section: item.section,
  category: item.category,
  score: Number(item.score.toFixed(3)),
});

const retrieveContext = async (question) => {
  const queryVector = embedText(question);
  const queryTokens = new Set(tokenize(question));
  const chunks = await CorpusChunk.find().select("+embedding").lean();

  return chunks
    .map((chunk) => {
      const semanticScore = cosineSimilarity(queryVector, chunk.embedding);
      const keywordHits = (chunk.keywords || []).filter((keyword) => queryTokens.has(keyword)).length;
      return {
        ...chunk,
        score: semanticScore + keywordHits * 0.025,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
};

const extractiveAnswer = (question, contexts) => {
  const queryTokens = new Set(tokenize(question));
  const sentences = contexts
    .flatMap((ctx) =>
      String(ctx.text)
        .split(/(?<=[.!?])\s+|\n+-\s+/)
        .map((sentence) => ({
          sentence: sentence.trim(),
          section: ctx.section,
          score:
            tokenize(sentence).filter((token) => queryTokens.has(token)).length +
            Math.max(0, ctx.score),
        })),
    )
    .filter((item) => item.sentence.length > 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!sentences.length) return NOT_FOUND_RESPONSE;
  return sentences.map((item) => `- ${item.sentence} (${item.section})`).join("\n");
};

const decodeHtml = (value = "") =>
  String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/");

const stripHtml = (value = "") =>
  decodeHtml(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const cleanAnswerText = (value = "") =>
  String(value)
    .split("\n")
    .filter((line) => !/^\s*source\s*:/i.test(line))
    .join("\n")
    .replace(/\s*\(?SOURCE\s+\d+\)?\s*:?\s*/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const searchWeb = async (question) => {
  if (!WEB_FALLBACK_ENABLED || typeof fetch !== "function") return [];

  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`Darwinbox ${question}`)}`;
  const response = await fetch(searchUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 DarwinboxChatbot/1.0",
      accept: "text/html",
    },
  });

  if (!response.ok) return [];

  const html = await response.text();
  const results = [];
  const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = resultRegex.exec(html)) && results.length < 5) {
    const url = decodeHtml(match[1]);
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[3]);
    if (title && snippet) {
      results.push({ title, url, snippet });
    }
  }

  return results;
};

const answerFromWeb = async ({ question, history = [], client, model }) => {
  const results = await searchWeb(question);
  if (!results.length) return null;

  const webContext = results
    .map((item) => `${item.title}\n${item.snippet}\nURL: ${item.url}`)
    .join("\n\n---\n\n");

  if (client) {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: "system", content: buildWebPrompt() },
        ...history.slice(-4).map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: String(item.content || "").slice(0, 1000),
        })),
        {
          role: "user",
          content: `Web search results:\n${webContext}\n\nQuestion: ${question}`,
        },
      ],
    });

    return completion.choices?.[0]?.message?.content?.trim() || null;
  }

  return [
    "I could not find this in the internal Darwinbox knowledge base. Based on public web snippets:",
    ...results.slice(0, 3).map((item) => `- ${item.snippet}`),
  ].join("\n");
};

const answerAsGeneralAssistant = async ({ question, history = [], client, model }) => {
  if (!client) return null;
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.6,
      max_tokens: 600,
      messages: [
        { role: "system", content: buildGeneralPrompt() },
        ...history.slice(-6).map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: String(item.content || "").slice(0, 1200),
        })),
        { role: "user", content: question },
      ],
    });
    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn("General assistant LLM failed:", err.message);
    return null;
  }
};

const answerQuestion = async ({ question, userId, history = [] }) => {
  const start = Date.now();
  let status = "answered";
  let model = "local-extractive";
  let answer = NOT_FOUND_RESPONSE;
  let confidence = 0;
  let sources = [];
  const { client, model: selectedModel } = buildClient();
  model = selectedModel;

  try {
    const smallTalkText = detectSmallTalk(question);
    if (smallTalkText) {
      const reply = generateSmallTalkReply(smallTalkText);
      const analytics = await QueryAnalytics.create({
        userId,
        question,
        answerStatus: "answered",
        confidence: 1,
        sources: [],
        latencyMs: Date.now() - start,
        model: "small-talk",
      });
      return {
        message: reply,
        status: "answered",
        confidence: 1,
        sources: [],
        queryId: analytics._id,
        model: "small-talk",
      };
    }

    await ensureSeedCorpus();
    const contexts = await retrieveContext(question);
    const bestScore = contexts[0]?.score || 0;
    confidence = Math.max(0, Math.min(1, bestScore));
    sources = contexts.filter((ctx) => ctx.score >= MIN_CONFIDENCE).map(normalizeSource);

    const isDarwinboxQuestion = looksLikeDarwinboxQuestion(question);

    if (!contexts.length || bestScore < MIN_CONFIDENCE) {
      status = "not_found";
    } else {
      const contextText = contexts
        .map((ctx, idx) => `SOURCE ${idx + 1}: ${ctx.section}\n${ctx.text}`)
        .join("\n\n---\n\n");

      if (client) {
        try {
          const completion = await client.chat.completions.create({
            model,
            temperature: 0.1,
            max_tokens: 900,
            messages: [
              { role: "system", content: buildSystemPrompt() },
              ...history.slice(-6).map((item) => ({
                role: item.role === "assistant" ? "assistant" : "user",
                content: String(item.content || "").slice(0, 1200),
              })),
              {
                role: "user",
                content: `Darwinbox context:\n${contextText}\n\nQuestion: ${question}`,
              },
            ],
          });
          answer = completion.choices?.[0]?.message?.content?.trim() || NOT_FOUND_RESPONSE;
        } catch (providerError) {
          console.warn("LLM provider failed; using local extractive answer:", providerError.message);
          model = `${model}-fallback`;
          answer = extractiveAnswer(question, contexts);
        }
      } else {
        answer = extractiveAnswer(question, contexts);
      }

      if (answer === NOT_FOUND_RESPONSE) status = "not_found";
    }

    const ragMissed =
      status === "not_found" ||
      answer === NOT_FOUND_RESPONSE ||
      answer.includes("not available in the Darwinbox knowledge base");

    if (ragMissed && !isDarwinboxQuestion) {
      const generalAnswer = await answerAsGeneralAssistant({ question, history, client, model });
      if (generalAnswer) {
        status = "answered";
        model = `${model}-general`;
        answer = generalAnswer;
        sources = [];
        confidence = Math.max(confidence, 0.5);
      }
    }

    const stillMissing =
      status === "not_found" ||
      answer === NOT_FOUND_RESPONSE ||
      answer.includes("not available in the Darwinbox knowledge base");

    if (stillMissing) {
      try {
        const webAnswer = await answerFromWeb({ question, history, client, model });
        if (webAnswer) {
          status = "answered";
          model = `${model}-web`;
          answer = webAnswer;
          sources = [];
          confidence = Math.max(confidence, 0.2);
        }
      } catch (webError) {
        console.warn("Web fallback failed:", webError.message);
      }
    }

    const finalMissing =
      answer === NOT_FOUND_RESPONSE ||
      answer.includes("not available in the Darwinbox knowledge base");

    if (finalMissing) {
      const generalAnswer = await answerAsGeneralAssistant({ question, history, client, model });
      if (generalAnswer) {
        status = "answered";
        model = `${model}-general`;
        answer = generalAnswer;
        sources = [];
        confidence = Math.max(confidence, 0.4);
      }
    }

    answer = cleanAnswerText(answer);
  } catch (error) {
    status = "error";
    answer = process.env.NODE_ENV === "production" ? NOT_FOUND_RESPONSE : `AI error: ${error.message}`;
  }

  const analytics = await QueryAnalytics.create({
    userId,
    question,
    answerStatus: status,
    confidence,
    sources,
    latencyMs: Date.now() - start,
    model,
  });

  return {
    message: answer,
    status,
    confidence: Number(confidence.toFixed(3)),
    sources,
    queryId: analytics._id,
    model,
  };
};

const ensureSeedCorpus = async () => {
  const existingCount = await CorpusDocument.countDocuments({ sourceType: "seed" });
  if (existingCount > 0 || !fs.existsSync(seedPath)) return;

  const text = fs.readFileSync(seedPath, "utf8");
  await indexCorpusText({
    title: "Darwinbox Seed Knowledge Base",
    text,
    sourceType: "seed",
    fileName: "darwinbox-seed-corpus.md",
    mimeType: "text/markdown",
    replaceSeed: true,
  });
};

const buildSummaryPrompt = () => `You are DarwinBot, summarizing a group chat for an enterprise team.

Produce a clear, structured summary of the conversation transcript provided. Use this exact markdown format:

**Summary**
A 2-3 sentence overview of what the group discussed.

**Key Topics**
- Topic 1 — short detail
- Topic 2 — short detail
- (3-6 bullets max)

**Decisions Made**
- Decision 1 (or "No explicit decisions" if none)

**Action Items / Open Questions**
- Action 1 — owner if mentioned
- Open question 1
- (or "None" if nothing pending)

**Participants**
Comma-separated list of who actively contributed.

Rules:
- Be factual and concise. Do not invent details.
- Ignore system/join/leave notices and prior AI summaries.
- Preserve names exactly as they appear.
- Plain text only inside bullets, no extra markdown.`;

const SUMMARY_TRIGGER_REGEX = /\b(summari[sz]e|summary|tl;?dr|recap|brief\s*me)\b/i;

const detectSummaryCommand = (text = "") => {
  const cleaned = String(text)
    .replace(/@(ai|darwinbot|darwinboxai|darwinbox-ai)\b/gi, "")
    .trim();
  if (!cleaned) return false;
  if (cleaned.length > 120) return false;
  return SUMMARY_TRIGGER_REGEX.test(cleaned);
};

const summarizeGroupChat = async ({ messages = [], chatName = "this group", userId } = {}) => {
  const start = Date.now();
  const { client, model: selectedModel } = buildClient();
  let model = selectedModel;
  let status = "answered";
  let answer = "";

  const cleanedTranscript = messages
    .filter((m) => {
      if (!m) return false;
      if (m.type === "system" && m.metadata?.systemSubtype !== "ai") return false;
      return true;
    })
    .map((m) => {
      const isAi = m.type === "system" && m.metadata?.systemSubtype === "ai";
      const speaker = isAi ? "DarwinBot (AI)" : (m.senderId?.name || "Member");
      const ts = m.createdAt ? new Date(m.createdAt).toISOString().slice(0, 16).replace("T", " ") : "";
      const body = (m.content || "").toString().trim();
      if (!body) return null;
      return `[${ts}] ${speaker}: ${body}`;
    })
    .filter(Boolean);

  if (!cleanedTranscript.length) {
    answer = "There aren't enough messages in this chat yet to summarize. Once the team has chatted a bit more, ask me again with `@ai summarize`.";
    const analytics = await QueryAnalytics.create({
      userId,
      question: `[group-summary] ${chatName}`,
      answerStatus: "not_found",
      confidence: 0,
      sources: [],
      latencyMs: Date.now() - start,
      model: "summary-empty",
    });
    return {
      message: answer,
      status: "answered",
      confidence: 0,
      sources: [],
      queryId: analytics._id,
      model: "summary-empty",
    };
  }

  const transcript = cleanedTranscript.join("\n").slice(-18000);

  if (client) {
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.3,
        max_tokens: 900,
        messages: [
          { role: "system", content: buildSummaryPrompt() },
          {
            role: "user",
            content: `Group: ${chatName}\nMessages analyzed: ${cleanedTranscript.length}\n\nTranscript:\n${transcript}\n\nSummarize the conversation now.`,
          },
        ],
      });
      answer = completion.choices?.[0]?.message?.content?.trim() || "";
      model = `${model}-summary`;
    } catch (err) {
      console.warn("Summary LLM failed:", err.message);
      status = "error";
    }
  }

  if (!answer) {
    const tail = cleanedTranscript.slice(-30).join("\n");
    answer = `**Summary**\nUnable to reach the AI service for a full summary. Here are the most recent messages from ${chatName}:\n\n${tail}`;
    model = "summary-fallback";
    status = status === "error" ? "answered" : status;
  }

  answer = cleanAnswerText(answer);

  const analytics = await QueryAnalytics.create({
    userId,
    question: `[group-summary] ${chatName}`,
    answerStatus: status,
    confidence: 1,
    sources: [],
    latencyMs: Date.now() - start,
    model,
  });

  return {
    message: answer,
    status,
    confidence: 1,
    sources: [],
    queryId: analytics._id,
    model,
  };
};

module.exports = {
  NOT_FOUND_RESPONSE,
  answerQuestion,
  ensureSeedCorpus,
  retrieveContext,
  summarizeGroupChat,
  detectSummaryCommand,
};

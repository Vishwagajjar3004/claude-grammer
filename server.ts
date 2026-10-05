import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-loaded Gemini client to prevent crashes if key is initially absent
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required for Dynamic AI Mode. Please configure it in the Settings panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Endpoint for Dynamic AI-powered proofreading
app.post("/api/check", async (req, res) => {
  const { text, customDict = [], ignoredWords = [] } = req.body;
  
  if (!text || !text.trim()) {
    return res.json({ suggestions: [], logs: [] });
  }

  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  const logs: any[] = [
    {
      id: `log-${requestId}-start`,
      timestamp: new Date().toISOString(),
      level: 'info',
      module: 'GrammarEngine',
      message: `Starting dynamic Gemini AI analysis on text of length ${text.length} chars.`,
    }
  ];

  try {
    const ai = getAiClient();

    const systemInstruction = `You are a professional writing assistant and grammar engine.
Your task is to proofread the user's input text for grammar, spelling, punctuation, capitalization, and formatting errors.
Return your corrections as a JSON array matching the specified response schema.

For each correction, you must provide:
- id: a unique string identifier
- ruleId: a short hyphenated identifier for the rule violated (e.g., 'common-spelling', 'subject-verb-agreement', 'articles', 'capitalization', 'punctuation')
- ruleName: a human-readable rule category name (e.g., 'Spelling Error', 'Subject-Verb Agreement', 'Incorrect Article', 'Proper Capitalization', 'Punctuation Spacing')
- originalText: the exact text containing the error
- suggestedText: the corrected text to replace the originalText with. If the error is a duplicate word or trailing whitespace that should be deleted, set this to an empty string.
- startIndex: the exact 0-based character index in the original input string where the error begins
- endIndex: the exact 0-based character index in the original input string where the error ends (exclusive, so endIndex - startIndex === originalText.length)
- explanation: a friendly, clear, short explanation of the correction
- type: one of 'error', 'warning', or 'info'

Guidelines:
1. Whitelist/ignore any words in this custom dictionary list: ${JSON.stringify(customDict)}.
2. Also ignore any words in this list: ${JSON.stringify(ignoredWords)}.
3. Only flag real mistakes. Do not be overly aggressive on stylistic preferences unless they are clearly incorrect.
4. If there are no errors, return an empty array.
5. Double check that your character startIndex and endIndex indexes are mathematically accurate.`;

    const candidateModels = ["gemini-2.5-flash", "gemini-3.5-flash"];
    let response = null;
    let lastError = null;
    let chosenModel = "";

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: `Please proofread this text: "${text}"`,
          config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  ruleId: { type: Type.STRING },
                  ruleName: { type: Type.STRING },
                  originalText: { type: Type.STRING },
                  suggestedText: { type: Type.STRING },
                  startIndex: { type: Type.INTEGER },
                  endIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                  type: { type: Type.STRING }
                },
                required: ["id", "ruleId", "ruleName", "originalText", "suggestedText", "startIndex", "endIndex", "explanation", "type"]
              }
            }
          }
        });
        chosenModel = modelName;
        break; // Stop trying if we have a successful response
      } catch (err: any) {
        lastError = err;
        logs.push({
          id: `log-${requestId}-model-fail-${modelName}`,
          timestamp: new Date().toISOString(),
          level: 'warning',
          module: 'GrammarEngine',
          message: `Attempt with ${modelName} failed: ${err.message || err}.`,
        });
      }
    }

    if (!response) {
      throw lastError || new Error("All candidate Gemini models failed to generate content.");
    }

    const durationMs = Date.now() - startTime;
    const jsonText = response.text || "[]";
    const suggestions = JSON.parse(jsonText);

    logs.push({
      id: `log-${requestId}-complete`,
      timestamp: new Date().toISOString(),
      level: 'perf',
      module: 'GrammarEngine',
      message: `Dynamic AI analysis complete using ${chosenModel}. Found ${suggestions.length} suggestions.`,
      durationMs,
    });

    res.json({ suggestions, logs });
  } catch (error: any) {
    console.error("Gemini API error:", error);
    const durationMs = Date.now() - startTime;
    
    const errorMessage = error.message || String(error);
    let errorType = 'other';
    if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota') || errorMessage.includes('Quota')) {
      errorType = 'quota';
    } else if (errorMessage.includes('403') || errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('denied') || errorMessage.includes('Denied') || errorMessage.includes('denied access')) {
      errorType = 'permission';
    } else if (errorMessage.includes('key') || errorMessage.includes('Key') || errorMessage.includes('API_KEY')) {
      errorType = 'api_key';
    }

    // Provide detailed error log, highlighting the resolution
    logs.push({
      id: `log-${requestId}-error`,
      timestamp: new Date().toISOString(),
      level: 'error',
      module: 'GrammarEngine',
      message: `Dynamic AI Check failed: ${errorMessage}. Server requested fallback to client offline engine.`,
      durationMs,
    });
    
    // Instead of throwing a 500 error that interrupts the user's workflow,
    // return a 200 response with fallback flag so the client runs local rules gracefully.
    res.json({ 
      fallback: true,
      errorType,
      errorMessage,
      suggestions: [],
      logs 
    });
  }
});

// Configure Vite integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import express from "express";
import { exec } from "child_process";
import fs from "fs";
import { v4 as uuid } from "uuid";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
// MongoDB connection with retry logic
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/hack";
let mongoConnected = false;

const connectMongo = async () => {
  try {
    await mongoose.connect(MONGO_URI, { 
      dbName: "hack",
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      bufferCommands: false
    });
    mongoConnected = true;
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    mongoConnected = false;
    // Retry connection after 5 seconds
    setTimeout(connectMongo, 5000);
  }
};

connectMongo();

// Session schema/model
const sessionEventSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  type: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true }
}, { _id: false });

// ADD THIS NEW SUB-SCHEMA
const lineVersionSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  // Content can be omitted for metrics-only entries
  content: { type: String, required: false },
  // Optional metrics snapshot for the line at this time
  metrics: { type: mongoose.Schema.Types.Mixed, required: false }
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, index: true },
  userId: { type: String },
  language: { type: String, required: true },
  initialCode: { type: String, required: true },
  startTime: { type: Number, required: true },
  endTime: { type: Number },
  events: { type: [sessionEventSchema], default: [] },
  // ADD THIS NEW FIELD
  lineHistory: {
    type: Map,
    of: [lineVersionSchema],
    default: {}
  },
  // Minimal addition: capture all submissions for a session
  all_submissions: {
    type: [{
      code: { type: String },
      output: { type: String },
      error: { type: String },
      timestamp: { type: Number, default: () => Date.now() }
    }],
    default: []
  },
  meta: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

const SessionModel = mongoose.model("Session", sessionSchema);

// Session endpoints
app.post("/session/start", async (req, res) => {
  try {
    const { userId, language, initialCode, meta } = req.body || {};
    if (!language || typeof initialCode !== 'string') {
      return res.status(400).json({ error: "language and initialCode are required" });
    }
    const sessionId = uuid();
    const startTime = Date.now();
    
    // --- START OF NEW LOGIC ---
    // Create the initial history for every line in the code.
    const initialLineHistory = {};
    const lines = initialCode.split('\n');
    lines.forEach((lineContent, index) => {
        const lineNumber = index + 1; // Line numbers are 1-based
        initialLineHistory[lineNumber] = [{
            timestamp: 0, // Timestamp 0 represents the initial state at startTime
            content: lineContent
        }];
    });
    // --- END OF NEW LOGIC ---

    if (mongoConnected) {
      try {
        // Pass the new initialLineHistory when creating the session document.
        await SessionModel.create({ 
          sessionId, 
          userId: userId || null, 
          language, 
          initialCode, 
          startTime, 
          meta: meta || {},
          lineHistory: initialLineHistory // Add the pre-populated history here
        });
        console.log(`Session started: ${sessionId}`);
      } catch (mongoErr) {
        console.error("MongoDB save error:", mongoErr.message);
        // Continue without failing the request
      }
    } else {
      console.log("MongoDB not connected, session not saved:", sessionId);
    }
    
    return res.json({ ok: true, sessionId, startTime });
  } catch (e) {
    console.error("/session/start error:", e);
    return res.status(500).json({ error: e.message });
  }
});

app.post("/session/event", async (req, res) => {
  try {
    const { sessionId, events } = req.body || {};
    if (!sessionId || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "sessionId and non-empty events are required" });
    }
    
    if (mongoConnected) {
      try {
        // Separate events into raw deltas and our new line updates/metrics
        const rawEvents = events.filter(e => e.type !== 'LINE_UPDATE' && e.type !== 'LINE_METRICS');
        const lineRelated = events.filter(e => e.type === 'LINE_UPDATE' || e.type === 'LINE_METRICS');

        const updateOps = {};

        // Prepare push operation for original raw events (like 'EDIT')
        if (rawEvents.length > 0) {
          updateOps.$push = { events: { $each: rawEvents } };
        }

        // Prepare push operations for each line version update/metrics
        let metricsCount = 0;
        for (const update of lineRelated) {
          const { lineNumber, content, metrics } = update.payload || {};
          const timestamp = update.timestamp;

          if (typeof lineNumber !== 'number') continue;

          // Using dot notation to push into the array within the map field
          const field = `lineHistory.${lineNumber}`;
          if (!updateOps.$push) updateOps.$push = {};

          // Ensure the array exists for this line number before pushing
          if (!updateOps.$push[field]) {
            updateOps.$push[field] = { $each: [] };
          }

          const entry = { timestamp };
          if (typeof content === 'string') entry.content = content;
          if (metrics && typeof metrics === 'object') entry.metrics = metrics;
          updateOps.$push[field].$each.push(entry);
          if (entry.metrics) metricsCount++;
        }
        
        // Only run the update if there's something to do
        if (Object.keys(updateOps).length > 0) {
            await SessionModel.updateOne({ sessionId }, updateOps);
            if (lineRelated.length > 0) {
              console.log(`Session ${sessionId}: appended ${lineRelated.length} line entries (${metricsCount} with metrics)`);
            } else {
              console.log(`Events processed for session: ${sessionId} (${events.length} total)`);
            }
        }

      } catch (mongoErr) {
        console.error("MongoDB update error:", mongoErr.message);
      }
    } else {
      console.log("MongoDB not connected, events not saved:", sessionId);
    }
    
    return res.json({ ok: true });
  } catch (e) {
    console.error("/session/event error:", e);
    return res.status(500).json({ error: e.message });
  }
});

app.post("/session/stop", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    const endTime = Date.now();
    
    if (mongoConnected) {
      try {
        await SessionModel.updateOne({ sessionId }, { $set: { endTime } });
        console.log(`Session stopped: ${sessionId}`);
      } catch (mongoErr) {
        console.error("MongoDB update error:", mongoErr.message);
        // Continue without failing the request
      }
    } else {
      console.log("MongoDB not connected, session not stopped:", sessionId);
    }
    
    return res.json({ ok: true, endTime });
  } catch (e) {
    console.error("/session/stop error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// Ensure tmp directory exists
const tmpDir = path.join(__dirname, "../tmp");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const fileMap = {
  python: { 
    ext: ".py", 
    cmd: (f) => `docker run --rm --cpus=0.5 --memory=256m --network=none -v "${path.dirname(f)}:/work" python:3.9-custom python3 /work/${path.basename(f)}`,
    timeout: 10000
  },
  javascript: { 
    ext: ".js", 
    cmd: (f) => `docker run --rm --cpus=0.5 --memory=256m --network=none -v "${path.dirname(f)}:/work" node:18-custom node /work/${path.basename(f)}`,
    timeout: 10000
  },
  java: { 
    ext: ".java", 
    cmd: (f) => `docker run --rm --cpus=0.5 --memory=256m --network=none -v "${path.dirname(f)}:/work" openjdk:11-custom sh -c "cd /work && javac Main.java && java Main"`,
    timeout: 15000
  },
  c: { 
    ext: ".c", 
    cmd: (f) => `docker run --rm --cpus=0.5 --memory=256m --network=none -v "${path.dirname(f)}:/work" gcc:latest-custom sh -c "cd /work && gcc ${path.basename(f)} -o ${path.basename(f, '.c')} && ./${path.basename(f, '.c')}"`,
    timeout: 15000
  },
  cpp: { 
    ext: ".cpp", 
    cmd: (f) => `docker run --rm --cpus=0.5 --memory=256m --network=none -v "${path.dirname(f)}:/work" gcc:latest-custom sh -c "cd /work && g++ ${path.basename(f)} -o ${path.basename(f, '.cpp')} && ./${path.basename(f, '.cpp')}"`,
    timeout: 15000
  }
};

function getFixedBasename(language) {
  switch (language) {
    case 'python':
      return 'main.py';
    case 'javascript':
      return 'main.js';
    case 'java':
      return 'Main.java';
    case 'c':
      return 'main.c';
    case 'cpp':
      return 'main.cpp';
    default:
      return 'main.txt';
  }
}

// Build compile-only/syntax-only check command per language
function getCheckCommand(language, f) {
  const dir = path.dirname(f);
  const base = path.basename(f);
  switch (language) {
    case 'python':
      return `docker run --rm --cpus=0.5 --memory=256m --network=none -v "${dir}:/work" python:3.9-custom sh -c "python3 -m py_compile /work/${base}"`;
    case 'javascript':
      return `docker run --rm --cpus=0.5 --memory=256m --network=none -v "${dir}:/work" node:18-custom node --check /work/${base}`;
    case 'java':
      return `docker run --rm --cpus=0.5 --memory=256m --network=none -v "${dir}:/work" openjdk:11-custom sh -c "cd /work && javac Main.java"`;
    case 'c':
      return `docker run --rm --cpus=0.5 --memory=256m --network=none -v "${dir}:/work" gcc:latest-custom sh -c "cd /work && gcc -fsyntax-only ${base}"`;
    case 'cpp':
      return `docker run --rm --cpus=0.5 --memory=256m --network=none -v "${dir}:/work" gcc:latest-custom sh -c "cd /work && g++ -fsyntax-only ${base}"`;
    default:
      return '';
  }
}

// Syntax/compile-only check endpoint
app.post("/check", async (req, res) => {
  try {
    const { language, code } = req.body;

    if (!language || !code) {
      return res.status(400).json({ error: "Language and code are required" });
    }

    if (!fileMap[language]) {
      return res.status(400).json({ error: "Unsupported language" });
    }

    const id = uuid();
    const runDir = path.join(tmpDir, id);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }
    const fixedBase = getFixedBasename(language);
    const fileName = path.join(runDir, fixedBase);

    try {
      fs.writeFileSync(fileName, code);

      const command = getCheckCommand(language, fileName);

      exec(command, {
        timeout: fileMap[language].timeout,
        maxBuffer: 1024 * 1024
      }, (err, stdout, stderr) => {
        try {
          if (fs.existsSync(runDir)) {
            fs.rmSync(runDir, { recursive: true, force: true });
          }
        } catch (cleanupError) {
          console.error("Error cleaning up file:", cleanupError);
        }

        const ok = !err;
        return res.json({ ok, stdout: stdout || "", stderr: stderr || "" });
      });
    } catch (writeErr) {
      res.status(500).json({ error: "Failed to write code to file: " + writeErr.message });
    }
  } catch (error) {
    console.error("Check error:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.post("/run", async (req, res) => {
  try {
    const { language, code, sessionId } = req.body;
    
    if (!language || !code) {
      return res.status(400).json({ error: "Language and code are required" });
    }

    if (!fileMap[language]) {
      return res.status(400).json({ error: "Unsupported language" });
    }

  const id = uuid();
  const runDir = path.join(tmpDir, id);
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }
  const fixedBase = getFixedBasename(language);
  const fileName = path.join(runDir, fixedBase);
  
  try {
    // Write code to temporary file
    fs.writeFileSync(fileName, code);
    
    // Execute code in Docker container
    const command = fileMap[language].cmd(fileName);
    
    exec(command, { 
      timeout: fileMap[language].timeout,
      maxBuffer: 1024 * 1024 // 1MB buffer
    }, async (err, stdout, stderr) => {
      // Clean up the temporary file
      try {
        if (fs.existsSync(runDir)) {
          fs.rmSync(runDir, { recursive: true, force: true });
        }
      } catch (cleanupErr) {
        console.error("Error cleaning up file:", cleanupErr);
      }

      if (err) {
        // Handle timeout and other execution errors
        if (err.code === 'TIMEOUT') {
          const payload = { 
            output: "", 
            error: "⏰ Execution timed out. Your code took too long to run." 
          };
          // Save submission if sessionId provided
          if (mongoConnected && sessionId) {
            try {
              await SessionModel.updateOne(
                { sessionId },
                { $push: { all_submissions: { code, output: payload.output, error: payload.error, timestamp: Date.now() } } }
              );
            } catch (_) {}
          }
          return res.json(payload);
        }
        
        // Enhanced error formatting
        let errorMessage = stderr || err.message || "Execution failed";
        
        // Format common error types
        if (errorMessage.includes('SyntaxError')) {
          errorMessage = `🔴 Syntax Error:\n${errorMessage}`;
        } else if (errorMessage.includes('ReferenceError')) {
          errorMessage = `🔴 Reference Error:\n${errorMessage}`;
        } else if (errorMessage.includes('TypeError')) {
          errorMessage = `🔴 Type Error:\n${errorMessage}`;
        } else if (errorMessage.includes('NameError')) {
          errorMessage = `🔴 Name Error:\n${errorMessage}`;
        } else if (errorMessage.includes('IndentationError')) {
          errorMessage = `🔴 Indentation Error:\n${errorMessage}`;
        } else if (errorMessage.includes('error:') && language === 'c') {
          errorMessage = `🔴 Compilation Error:\n${errorMessage}`;
        } else if (errorMessage.includes('error:') && language === 'cpp') {
          errorMessage = `🔴 Compilation Error:\n${errorMessage}`;
        } else if (errorMessage.includes('Exception in thread')) {
          errorMessage = `🔴 Java Runtime Error:\n${errorMessage}`;
        }
        
        const payload = { 
          output: stdout || "", 
          error: errorMessage
        };
        // Save submission if sessionId provided
        if (mongoConnected && sessionId) {
          try {
            await SessionModel.updateOne(
              { sessionId },
              { $push: { all_submissions: { code, output: payload.output, error: payload.error, timestamp: Date.now() } } }
            );
          } catch (_) {}
        }
        return res.json(payload);
      }

      const payload = { 
        output: stdout || "", 
        error: stderr || "" 
      };
      // Save submission if sessionId provided
      if (mongoConnected && sessionId) {
        try {
          await SessionModel.updateOne(
            { sessionId },
            { $push: { all_submissions: { code, output: payload.output, error: payload.error, timestamp: Date.now() } } }
          );
        } catch (_) {}
      }
      res.json(payload);
    });
    
  } catch (writeErr) {
    res.status(500).json({ 
      error: "Failed to write code to file: " + writeErr.message 
    });
  }
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ 
      error: "Internal server error: " + error.message 
    });
  }
});

// Get session data for replay
app.get("/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    
    if (mongoConnected) {
      try {
        const session = await SessionModel.findOne({ sessionId });
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }
        
        return res.json({
          sessionId: session.sessionId,
          userId: session.userId,
          language: session.language,
          initialCode: session.initialCode,
          startTime: session.startTime,
          endTime: session.endTime,
          events: session.events,
          // Expose a summary for quick verification
          lineHistorySummary: (() => {
            try {
              const map = session.lineHistory || new Map();
              const result = {};
              for (const [line, arr] of map.entries ? map.entries() : Object.entries(map)) {
                const list = Array.isArray(arr) ? arr : [];
                result[line] = {
                  versions: list.length,
                  metricsCount: list.filter(v => v && v.metrics).length
                };
              }
              return result;
            } catch (_) { return {}; }
          })(),
          meta: session.meta
        });
      } catch (mongoErr) {
        console.error("MongoDB query error:", mongoErr.message);
        return res.status(500).json({ error: "Database error" });
      }
    } else {
      return res.status(503).json({ error: "Database not connected" });
    }
  } catch (e) {
    console.error("/session/:sessionId error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// List sessions (latest first)
app.get("/sessions", async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const sessions = await SessionModel.find({}, {
      _id: 0,
      sessionId: 1,
      userId: 1,
      language: 1,
      startTime: 1,
      endTime: 1,
      createdAt: 1,
      updatedAt: 1
    }).sort({ updatedAt: -1 }).limit(limit).lean();

    return res.json({ ok: true, sessions });
  } catch (e) {
    console.error("/sessions error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// Cleanup sessions with empty events
app.post("/sessions/cleanup-empty", async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: "Database not connected" });
    }
    const result = await SessionModel.deleteMany({ $or: [ { events: { $size: 0 } }, { events: { $exists: false } } ] });
    return res.json({ ok: true, deletedCount: result?.deletedCount || 0 });
  } catch (e) {
    console.error("/sessions/cleanup-empty error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// AI Chat functionality with context tracking
const chatSessions = new Map(); // Store chat history per session

const getAIResponse = async (userMessage, sessionId = null) => {
  try {
    // Get or create session context
    if (!sessionId) {
      sessionId = uuid();
    }
    
    let sessionContext = chatSessions.get(sessionId) || {
      messages: [],
      sessionId
    };

    // Add user message to context
    sessionContext.messages.push({
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString()
    });

    // Build conversation context for AI
    const contextMessages = sessionContext.messages.slice(-10); // Keep last 10 messages for context
    const conversationHistory = contextMessages.map(msg => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    // Create full prompt with conversation history
    const fullPrompt = conversationHistory ? 
      `Previous conversation:\n${conversationHistory}\n\nCurrent user message: ${userMessage}` : 
      userMessage;

    // System prompt for chatbot assistant
    const systemPrompt = `You are a friendly and helpful AI coding assistant chatbot. You're here to help developers with their coding questions and challenges.

    Your personality:
    - Be conversational, encouraging, and supportive
    - Use a friendly, approachable tone
    - Ask clarifying questions when needed
    - Celebrate successes and provide encouragement
    - Break down complex concepts into understandable parts

    You can help with:
    - Coding questions and problem-solving
    - Algorithm and data structure explanations
    - Debugging assistance
    - Code review and optimization suggestions
    - Learning new programming concepts
    - Best practices and coding standards
    - General programming advice

    Remember the conversation history to provide contextual and personalized responses. Be patient with beginners and detailed with explanations.`;

    // Call AI backend
    const aiResponse = await axios.post('http://localhost:8000/api/llm/generate', {
      session_id: sessionId,
      mode: 'full',
      code: fullPrompt, // Send full conversation context
      metrics: {
        conversationLength: sessionContext.messages.length,
        lastMessageTime: new Date().toISOString()
      }
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    const aiResponseText = aiResponse.data.response;

    // Add AI response to context
    sessionContext.messages.push({
      role: "assistant",
      content: aiResponseText,
      timestamp: new Date().toISOString()
    });

    // Update session context
    chatSessions.set(sessionId, sessionContext);

    return {
      response: aiResponseText,
      sessionId: sessionId
    };

  } catch (error) {
    console.error("AI Backend error:", error);
    
    // Fallback response if AI backend is unavailable
    const fallbackResponses = [
      "I'm having trouble connecting to the AI service right now. Please try again in a moment.",
      "The AI assistant is temporarily unavailable. Please check back later.",
      "Sorry, I'm experiencing technical difficulties. Please try again."
    ];
    
    return {
      response: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)],
      sessionId: sessionId
    };
  }
};

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: "Message is required" });
    }

    const aiResult = await getAIResponse(message, sessionId);

    return res.json({
      response: aiResult.response,
      sessionId: aiResult.sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      error: "Failed to process chat message",
      response: "Sorry, I'm having trouble processing your message right now."
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Make sure Docker is running and the required images are available:");
  console.log("- python:3.9-custom");
  console.log("- node:18-custom");
  console.log("- openjdk:11-custom");
  console.log("- gcc:latest-custom");
  console.log("Run './build-images.sh' to build the required images.");
});

import express from "express";
import { exec } from "child_process";
import fs from "fs";
import { v4 as uuid } from "uuid";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

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
  content: { type: String, required: true }
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
        // Separate events into raw deltas and our new line updates
        const rawEvents = events.filter(e => e.type !== 'LINE_UPDATE');
        const lineUpdates = events.filter(e => e.type === 'LINE_UPDATE');

        const updateOps = {};

        // Prepare push operation for original raw events (like 'EDIT')
        if (rawEvents.length > 0) {
          updateOps.$push = { events: { $each: rawEvents } };
        }

        // Prepare push operations for each line version update
        for (const update of lineUpdates) {
          const { lineNumber, content } = update.payload;
          const timestamp = update.timestamp;
          
          // Using dot notation to push into the array within the map field
          const field = `lineHistory.${lineNumber}`;
          if (!updateOps.$push) updateOps.$push = {};
          
          // Ensure the array exists for this line number before pushing
          if (!updateOps.$push[field]) {
            updateOps.$push[field] = { $each: [] };
          }
          updateOps.$push[field].$each.push({ timestamp, content });
        }
        
        // Only run the update if there's something to do
        if (Object.keys(updateOps).length > 0) {
            await SessionModel.updateOne({ sessionId }, updateOps);
            console.log(`Events processed for session: ${sessionId} (${events.length} total)`);
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
    // Write code to temporary file
    fs.writeFileSync(fileName, code);
    
    // Execute code in Docker container
    const command = fileMap[language].cmd(fileName);
    
    exec(command, { 
      timeout: fileMap[language].timeout,
      maxBuffer: 1024 * 1024 // 1MB buffer
    }, (err, stdout, stderr) => {
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
          return res.json({ 
            output: "", 
            error: "⏰ Execution timed out. Your code took too long to run." 
          });
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
        
        return res.json({ 
          output: stdout || "", 
          error: errorMessage
        });
      }

      res.json({ 
        output: stdout || "", 
        error: stderr || "" 
      });
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

// AI Chat functionality
const getAIResponse = (userMessage) => {
  const message = userMessage.toLowerCase();

  // Default responses
  const responses = [
    "I can help you with Two Sum and general coding concepts! Ask me about time complexity, approaches, edge cases, or implementation details.",
    "I'm here to assist with your coding questions. What specific aspect of the Two Sum problem would you like to explore?",
    "Feel free to ask about algorithms, data structures, or any coding concepts you're working with!"
  ];

  return responses[Math.floor(Math.random() * responses.length)];
};

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: "Message is required" });
    }

    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));

    const response = getAIResponse(message);

    return res.json({
      response,
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

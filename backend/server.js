import express from "express";
import { exec } from "child_process";
import fs from "fs";
import { v4 as uuid } from "uuid";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

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
  let fileName;
  
  // Special handling for Java - save as Main.java
  if (language === 'java') {
    fileName = path.join(tmpDir, 'Main.java');
  } else {
    fileName = path.join(tmpDir, `${language}-${id}${fileMap[language].ext}`);
  }
  
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
        if (fs.existsSync(fileName)) {
          fs.unlinkSync(fileName);
        }
      } catch (cleanupErr) {
        console.error("Error cleaning up file:", cleanupErr);
      }

      if (err) {
        // Handle timeout and other execution errors
        if (err.code === 'TIMEOUT') {
          return res.json({ 
            output: "", 
            error: "Execution timed out. Your code took too long to run." 
          });
        }
        
        return res.json({ 
          output: stdout || "", 
          error: stderr || err.message || "Execution failed" 
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

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
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

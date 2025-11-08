// server.js
import express from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mammoth from "mammoth";
import TurndownService from "turndown";
import pdfParse from "pdf-parse";
import { v4 as uuidv4 } from "uuid";
import sanitizeFilename from "sanitize-filename";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, "outputs");
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "20971520", 10); // 20MB

await fs.mkdir(UPLOAD_DIR, { recursive: true });
await fs.mkdir(OUTPUT_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(morgan("tiny"));
app.use(express.static(path.join(__dirname, "public"))); // serve frontend

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FILE_SIZE }
});

const turndownService = new TurndownService({ headingStyle: "atx" });

// Utility: safe unlink
async function safeUnlink(p) {
  try { await fs.unlink(p); } catch (e) { /* ignore */ }
}

// Helper: write base64 image to disk and return relative path
async function saveBase64Image(base64Data, filenamePrefix = "img") {
  // base64Data like "data:image/png;base64,...."
  const match = base64Data.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const ext = mime.split("/")[1] || "bin";
  const data = match[2];
  const id = uuidv4();
  const fname = `${filenamePrefix}_${id}.${ext}`;
  const folder = path.join(OUTPUT_DIR, "images");
  await fs.mkdir(folder, { recursive: true });
  const outPath = path.join(folder, fname);
  await fs.writeFile(outPath, Buffer.from(data, "base64"));
  // return path relative to OUTPUT_DIR
  return path.join("images", fname).replace(/\\/g, "/");
}

// DOCX -> HTML using mammoth with image handler that saves images to disk
async function docxToHtmlWithImages(buffer, originalName) {
  const images = []; // keep track
  const convertImage = mammoth.images.inline(async function(element) {
    // element.read returns a promise with the image buffer
    const imageBuffer = await element.read();
    const contentType = element.contentType || "image/png";
    const ext = contentType.split("/")[1] || "png";
    const id = uuidv4();
    const imageName = sanitizeFilename(`${path.parse(originalName).name}_${id}.${ext}`);
    const imagesDir = path.join(OUTPUT_DIR, "images");
    await fs.mkdir(imagesDir, { recursive: true });
    const imagePath = path.join(imagesDir, imageName);
    await fs.writeFile(imagePath, imageBuffer);
    images.push({ imageName, imagePath });
    // return a src that turndown will keep (relative to outputs when creating final file)
    return { src: `images/${imageName}` };
  });

  const result = await mammoth.convertToHtml({ buffer }, { convertImage });
  // result.value -> HTML string
  // result.messages -> warnings
  return { html: result.value, messages: result.messages, images };
}

// Very simple PDF-to-markdown heuristics
function pdfTextToMarkdown(text) {
  if (!text) return "";
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const out = [];
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      continue;
    }
    // ALL CAPS -> H2
    const isAllCaps = line.length <= 100 && /^[A-Z0-9\s\W]+$/.test(line) && line.split(/\s+/).length <= 8;
    if (isAllCaps) {
      out.push(`## ${line}`);
      continue;
    }
    // short lines ending with ":" -> H3
    if (line.length < 80 && /:$/.test(line)) {
      out.push(`### ${line.replace(/:$/, "")}`);
      continue;
    }
    // Otherwise push line as-is (paragraph join later)
    out.push(line);
  }
  let md = out.join("\n");
  md = md.replace(/\n{3,}/g, "\n\n");
  return md;
}

// POST /api/convert
// Form field name: "file"
app.post("/api/convert", upload.single("file"), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: "No file uploaded (multipart/form-data, field name = file)" });

  const originalName = f.originalname || "document";
  const ext = path.extname(originalName).toLowerCase();

  const id = uuidv4();
  const safeBase = sanitizeFilename(path.parse(originalName).name) || `doc_${id}`;
  const outBaseName = `${safeBase}.md`;
  const outPath = path.join(OUTPUT_DIR, outBaseName);

  try {
    if (![".docx", ".pdf"].includes(ext)) {
      await safeUnlink(f.path);
      return res.status(400).json({ error: "Unsupported file type. Only .docx and .pdf are supported." });
    }

    let markdown = "";
    if (ext === ".docx") {
      const buffer = await fs.readFile(f.path);
      // convert to HTML, saving images to outputs/images/
      const { html, messages, images } = await docxToHtmlWithImages(buffer, originalName);

      // Convert HTML -> Markdown
      markdown = turndownService.turndown(html);

      // If images were saved by mammoth, they will be referenced as images/<name>
      // Ensure links are relative to the final .md file location (we save md inside OUTPUT_DIR)
      // (They already are "images/..." as we returned earlier.)

      // optional: attach warnings at the top
      if (messages && messages.length > 0) {
        markdown = `<!-- Mammoth warnings:\n${messages.map(m => m.message).join("\n")}\n-->\n\n` + markdown;
      }

    } else if (ext === ".pdf") {
      // PDF processing
      const data = await fs.readFile(f.path);
      const parsed = await pdfParse(data);
      const text = parsed.text || "";
      markdown = pdfTextToMarkdown(text);
    }

    // ensure newline at end
    if (!markdown.endsWith("\n")) markdown += "\n";

    // Write markdown to disk
    await fs.writeFile(outPath, markdown, "utf8");

    // cleanup uploaded file
    await safeUnlink(f.path);

    // Return download link JSON (or stream file immediately)
    // We'll stream the file for a simple UX:
    res.setHeader("Content-Disposition", `attachment; filename="${outBaseName}"`);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    const mdBuffer = await fs.readFile(outPath);
    res.send(mdBuffer);

    // note: we keep the output file and any saved images in OUTPUT_DIR for later inspection.
    // In production you might store outputs in S3 and set up a cleanup policy.

  } catch (err) {
    console.error("Conversion error:", err);
    await safeUnlink(f.path).catch(()=>{});
    return res.status(500).json({ error: "Conversion failed", details: err.message || err.toString() });
  }
});

// simple health
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Smartnote server listening on http://localhost:${PORT}`);
  console.log(`Upload endpoint: POST http://localhost:${PORT}/api/convert (field name 'file')`);
});

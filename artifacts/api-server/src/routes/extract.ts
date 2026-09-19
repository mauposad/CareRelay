import { Router, type IRouter } from "express";
import multer from "multer";
import { authenticate } from "../lib/auth";
import {
  CARE_MODEL,
  extractFromDocument,
  extractFromText,
  isAiEnabled,
} from "../lib/careExtraction";

const router: IRouter = Router();
router.use("/extract", authenticate);

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
});

/** Lets the UI show whether live extraction is wired up before anyone tries it. */
router.get("/extract/status", (_req, res) => {
  res.json({ aiEnabled: isAiEnabled(), model: CARE_MODEL });
});

/** Chat excerpt, typed update or voice transcript -> structured care events. */
router.post("/extract", async (req, res) => {
  const { text, source } = req.body ?? {};

  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "A non-empty 'text' field is required." });
    return;
  }
  if (text.length > 20000) {
    res.status(413).json({ error: "Update is too long to extract (20,000 character limit)." });
    return;
  }

  try {
    const result = await extractFromText(text, typeof source === "string" ? source : "internal");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Extraction request failed");
    res.status(502).json({ error: "Extraction failed. Please try again." });
  }
});

/** Uploaded care document (PDF/JPG/PNG) -> structured care events. */
router.post("/extract/document", upload.single("file"), async (req, res) => {
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "A document file is required." });
    return;
  }
  if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(file.mimetype)) {
    res.status(415).json({
      error: "That file type is not supported. Choose a PDF, JPG, JPEG, or PNG.",
    });
    return;
  }

  try {
    const result = await extractFromDocument({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });
    res.json({ ...result, documentName: file.originalname });
  } catch (err) {
    req.log.error({ err }, "Document extraction request failed");
    res.status(502).json({ error: "Document extraction failed. Please try again." });
  }
});

export default router;

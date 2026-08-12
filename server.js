// Read2Me — upload a document or paste text, and the app reads it aloud
// using the Soniox text-to-speech API (https://soniox.com).
//
// Run:  node server.js   → http://localhost:3020
//
// The Soniox API key lives in secrets.json (gitignored) or the
// SONIOX_API_KEY environment variable. If no key is configured yet, the
// web page shows a one-time setup box that saves it to secrets.json.

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3020;
const SECRETS_PATH = path.join(__dirname, 'secrets.json');

const SONIOX_TTS_URL = 'https://tts-rt.soniox.com/tts';
const SONIOX_TTS_MODEL = 'tts-rt-v1';

// Fallback voice list, used when the live voice list can't be fetched.
const FALLBACK_VOICES = ['Adrian', 'Maya', 'Grace', 'Kenji', 'Priya', 'Meera'];

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// ---------------------------------------------------------------------------
// Soniox API key handling
// ---------------------------------------------------------------------------

function readSecrets() {
  try {
    return JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

function getApiKey() {
  return process.env.SONIOX_API_KEY || readSecrets().sonioxApiKey || '';
}

app.get('/api/key/status', (req, res) => {
  res.json({ configured: !!getApiKey() });
});

app.post('/api/key', (req, res) => {
  const key = String(req.body.key || '').trim();
  if (!key) return res.status(400).json({ error: 'Empty key' });
  const secrets = readSecrets();
  secrets.sonioxApiKey = key;
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------

app.get('/api/voices', async (req, res) => {
  const key = getApiKey();
  if (key) {
    try {
      // Soniox publishes the model + voice catalogue on its main API.
      const r = await fetch('https://api.soniox.com/v1/tts/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (r.ok) {
        const data = await r.json();
        const models = Array.isArray(data) ? data : data.models || [];
        const voices = [];
        for (const m of models) {
          for (const v of m.voices || []) {
            const name = typeof v === 'string' ? v : v.name || v.id;
            if (name && !voices.includes(name)) voices.push(name);
          }
        }
        if (voices.length) return res.json({ voices });
      }
    } catch (e) {
      // fall through to the static list
    }
  }
  res.json({ voices: FALLBACK_VOICES });
});

// ---------------------------------------------------------------------------
// Text extraction (docx / pdf / md / txt / image OCR)
// ---------------------------------------------------------------------------

function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')        // fenced code blocks
    .replace(/`([^`]*)`/g, '$1')            // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')  // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')// links → link text
    .replace(/^#{1,6}\s+/gm, '')            // headings
    .replace(/^\s*[-*+]\s+/gm, '')          // bullet markers
    .replace(/^\s*\d+\.\s+/gm, '')          // numbered-list markers
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // bold / italic
    .replace(/^\s*>\s?/gm, '')              // blockquotes
    .replace(/\|/g, ' ')                    // table pipes
    .replace(/^[-=\s|:]+$/gm, '')           // table/heading rules
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractDocx(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function extractPdf(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  // pdf-parse inserts "-- 1 of 3 --" page markers; don't read those aloud.
  return (result.text || '').replace(/^\s*-+\s*\d+\s+of\s+\d+\s*-+\s*$/gm, '');
}

async function extractImage(buffer, lang) {
  // OCR via tesseract.js. Language data is downloaded and cached on first
  // use, so the very first screenshot takes a little longer.
  // tesseract.js throws worker errors OUTSIDE the promise chain by default
  // (which would kill the whole server), so route them through errorHandler.
  const { createWorker } = require('tesseract.js');
  const ocrLang = lang === 'sq' ? 'sqi' : lang === 'sq+en' ? 'sqi+eng' : 'eng';
  let rejectFailed;
  const failed = new Promise((resolve, reject) => { rejectFailed = reject; });
  const work = (async () => {
    const worker = await createWorker(ocrLang, 1, {
      errorHandler: (e) => rejectFailed(new Error('OCR: ' + ((e && e.message) || e))),
    });
    try {
      const { data } = await worker.recognize(buffer);
      return data.text || '';
    } finally {
      worker.terminate().catch(() => {});
    }
  })();
  const timeout = new Promise((resolve, reject) =>
    setTimeout(() => reject(new Error('OCR timed out after 3 minutes')), 180000).unref());
  return Promise.race([work, failed, timeout]);
}

app.post('/api/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const name = (req.file.originalname || '').toLowerCase();
    const mime = req.file.mimetype || '';
    const buf = req.file.buffer;
    const ocrLang = String(req.body.ocrLang || 'en');

    let text = '';
    let kind = '';
    if (name.endsWith('.docx')) {
      kind = 'docx';
      text = await extractDocx(buf);
    } else if (name.endsWith('.pdf') || mime === 'application/pdf') {
      kind = 'pdf';
      text = await extractPdf(buf);
    } else if (name.endsWith('.md') || name.endsWith('.markdown')) {
      kind = 'markdown';
      text = stripMarkdown(buf.toString('utf8'));
    } else if (name.endsWith('.txt') || mime.startsWith('text/')) {
      kind = 'text';
      text = buf.toString('utf8');
    } else if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name)) {
      kind = 'image';
      text = await extractImage(buf, ocrLang);
    } else {
      return res.status(400).json({
        error: 'Unsupported file type. Use DOCX, PDF, MD, TXT or an image (screenshot).',
      });
    }

    text = String(text).replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
    if (!text) {
      return res.status(422).json({
        error: kind === 'image'
          ? 'No text found in the image.'
          : 'The file contains no readable text.',
      });
    }
    res.json({ text, kind });
  } catch (e) {
    console.error('extract error:', e);
    res.status(500).json({ error: 'Could not read the file: ' + e.message });
  }
});

// ---------------------------------------------------------------------------
// Text-to-speech (proxies Soniox so the API key never reaches the browser)
// ---------------------------------------------------------------------------

app.post('/api/tts', async (req, res) => {
  try {
    const key = getApiKey();
    if (!key) return res.status(401).json({ error: 'Soniox API key is not configured yet.' });

    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'No text to read.' });

    const body = {
      model: SONIOX_TTS_MODEL,
      text,
      voice: String(req.body.voice || 'Adrian'),
      audio_format: 'mp3',
    };
    const language = String(req.body.language || '').trim();
    if (language && language !== 'auto') body.language = language;

    const r = await fetch(SONIOX_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      let detail = '';
      try { detail = await r.text(); } catch (e) {}
      console.error('Soniox TTS error', r.status, detail);
      return res.status(502).json({
        error: `Soniox returned ${r.status}. ${detail}`.trim().slice(0, 500),
      });
    }

    const audio = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
    res.send(audio);
  } catch (e) {
    console.error('tts error:', e);
    res.status(500).json({ error: 'Text-to-speech failed: ' + e.message });
  }
});

// A single bad request (e.g. a stray OCR worker error) must never take the
// whole app down.
process.on('uncaughtException', (e) => console.error('uncaught exception:', e));
process.on('unhandledRejection', (e) => console.error('unhandled rejection:', e));

app.listen(PORT, () => {
  console.log(`Read2Me running on http://localhost:${PORT}`);
  if (!getApiKey()) {
    console.log('No Soniox API key configured yet — open the app and paste it once.');
  }
});

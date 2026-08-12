# 🔊 Read2Me

Upload a document — **DOCX, PDF, MD, TXT or a screenshot** — or just paste
text, and the app reads it aloud using the
[Soniox text-to-speech API](https://soniox.com/docs/api-reference).

## How it works

1. **Drop a file** (or paste text / a screenshot straight from the clipboard).
2. The server extracts the text:
   - `.docx` → mammoth
   - `.pdf` → pdf-parse
   - `.md` → markdown symbols stripped, plain text kept
   - screenshots (PNG/JPG) → OCR with tesseract.js (English / Albanian)
3. Review or edit the extracted text, pick a **voice**, **language** and
   **speed**, and press **▶ Read to me**.
4. Long texts are split into parts at sentence ends so reading starts fast;
   the next part is prefetched while the current one plays.
   You can also **download the whole thing as an MP3**.

The Soniox API key stays on the server (`secrets.json`, gitignored, or the
`SONIOX_API_KEY` environment variable) — it is never sent to the browser.
The browser talks only to this app; the app talks to Soniox.

## Run

```
npm install
node server.js
```

Then open **http://localhost:3020**.

First run: if no key is configured, the page shows a one-time setup box —
paste the Soniox API key there and it is saved to `secrets.json`.
(Or copy `secrets.example.json` to `secrets.json` and fill it in.)

Change the port with the `PORT` environment variable if 3020 is taken.

## Notes

- The first screenshot OCR downloads the language data (~15 MB) once and
  caches it; later screenshots are fast.
- TTS endpoint used: `POST https://tts-rt.soniox.com/tts`
  (model `tts-rt-v1`, MP3 output).

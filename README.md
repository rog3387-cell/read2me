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

First run: the page first asks you to **create the app password** (everyone
uses this one password to open Read2Me — required because the app can be
reachable from outside), then shows a one-time box for the **Soniox API key**.
Both are saved to `secrets.json` (gitignored).
(Or copy `secrets.example.json` to `secrets.json` and fill it in.)

Change the port with the `PORT` environment variable if 3020 is taken.
To change the app password later: edit `appPassword` in `secrets.json` and
restart — every device has to log in again.

## Run permanently on the Windows server

`deploy/start-read2me.ps1` keeps the app running and auto-updates it on every
restart of the node process. Register it once as a startup task — see the
comments at the top of that script.

**Updating later:** press **● Deploy latest version** at the bottom of the
page (visible after login). The app pulls the latest code from GitHub and
restarts itself — nothing else on the server is touched. The version shown
next to the button is the live commit.

## Public access (https)

Read2Me manages its own https name — `read2me.megadistribution.al` — with
its own script. The server runs one shared Caddy for every app on the box;
each app drops its own site file into `C:\caddy\sites\` and this app never
edits the shared config beyond making sure the one `import` line exists.

One-time, in an ADMINISTRATOR PowerShell from the app folder (after the DNS
record for the name points at the server, and with the app password set):

```
powershell -ExecutionPolicy Bypass -File .\deploy\setup-domain.ps1
```

It installs `deploy/read2me.caddy` as `C:\caddy\sites\read2me.caddy`,
validates the whole config, and restarts the Caddy service — rolling back
and restarting nothing if validation fails.

## Notes

- The first screenshot OCR downloads the language data (~15 MB) once and
  caches it; later screenshots are fast.
- TTS endpoint used: `POST https://tts-rt.soniox.com/tts`
  (model `tts-rt-v1`, MP3 output).

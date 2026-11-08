# OnCue

**Hands Busy. Help Ready.**

OnCue is a hands-free assistant for hands-on work. Ask a question by voice or text, capture a photo of what you are working on, and get an answer grounded in local reference guides. When a guide has a relevant demonstration clip, OnCue can show it alongside the answer. Voice commands can capture or retake a photo and control video playback.

The current demo covers a 28BYJ-48 stepper motor, ULN2003 driver board, and Arduino controller.

## What it does

- **Training chat:** Answers questions using the EL-120 assembly guide and inspection criteria. For text questions, semantic embeddings rank guide sections; keyword matching is the fallback if embedding retrieval fails.
- **Photo questions:** Sends the attached photo and the full local guides to Gemini so it can identify what is visible before applying the documented instructions.
- **General chat:** Answers without the training guides or training clips.
- **Voice controls:** Deepgram transcribes speech and routes each turn to a question or an interface action: take, retake, or remove a photo; play, pause, rewind, or forward the visible clip.

## Tech stack

Vanilla HTML, CSS, and JavaScript; a Node.js HTTP server with `ws` for the voice WebSocket; Deepgram Voice Agent for speech transcription and routing (configured with GPT-4o mini for intent selection); Gemini 3.5 Flash for answers; Gemini Embedding 001 for retrieval; and Arduino firmware for the motor demo.

## Run locally

1. Install [Node.js 24](https://nodejs.org/) and run `npm install` in this directory.
2. Create a `.env` file in the project root:

   ```env
   GEMINI_API_KEY=your_gemini_api_key
   DEEPGRAM_API_KEY=your_deepgram_api_key
   GEMINI_MODEL=gemini-3.5-flash
   ```

   The Gemini key is required for chat. The Deepgram key is required for voice mode. Keep `.env` private; it is ignored by Git.

3. Run `npm start` and open [http://localhost:3000](http://localhost:3000). Allow camera and microphone access when prompted. Text questions work without microphone access.

The server listens on `127.0.0.1` by default. Set `PORT` in `.env` to use a different port.

## Demo files

- `docs/EL-120-stepper-drive.md` contains the assembly instructions.
- `docs/EL-120-inspection-criteria.md` contains inspection and troubleshooting guidance.
- `docs/videos.json` maps guide video IDs to the clips in `docs/clips/`.
- `firmware/el120_stepper/el120_stepper.ino` is the Arduino motor sketch.

The server reads the Markdown guides on each training request and refreshes cached document embeddings when a guide file changes. Video clips appear only when the answer refers to a clip listed in `docs/videos.json` and the file exists.

## Team

Built by Sean and Ashim for YCP Hack.

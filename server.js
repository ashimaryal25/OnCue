const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const files = {
  '/': ['index.html', 'text/html'],
  '/index.html': ['index.html', 'text/html'],
  '/styles.css': ['styles.css', 'text/css'],
  '/client.js': ['client.js', 'text/javascript'],
  '/camera.js': ['camera.js', 'text/javascript'],
  '/voice.js': ['voice.js', 'text/javascript'],
  '/docs/videos.json': ['docs/videos.json', 'application/json'],
};
const maxChatBytes = 4 * 1024 * 1024;
const stopWords = new Set('a an and are as at be by can do for from how i in is it of on or should the to what when where which with you'.split(' '));
const words = text => (text.toLowerCase().match(/[a-z0-9]+/g) || [])
  .filter(word => (word.length > 2 || /^\d+$/.test(word)) && !stopWords.has(word))
  .map(word => word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word) ? word.slice(0, -1) : word);

function loadDocs() {
  const directory = path.join(__dirname, 'docs');
  const videos = JSON.parse(fs.readFileSync(path.join(directory, 'videos.json'), 'utf8'));
  const sections = fs.readdirSync(directory).filter(file => file.endsWith('.md')).flatMap(file => {
    const document = fs.readFileSync(path.join(directory, file), 'utf8');
    return document.split(/^## /m).slice(1).map(section => {
      const [title, ...body] = section.trim().split('\n');
      const video = /\[VIDEO: ([\w-]+)\]/.exec(section)?.[1];
      return { title: `${file}: ${title}`, text: body.join('\n').replace(/\[VIDEO: [^\]]+\]/g, '').trim(), video };
    });
  });
  return { videos, sections };
}

// A step title is a stronger match than a word buried in its instructions.
function retrieve(question, sections) {
  const terms = [...new Set(words(question))];
  return sections.map(section => {
    const heading = new Set(words(section.title));
    const body = new Set(words(section.text));
    const score = terms.reduce((sum, term) => sum + (heading.has(term) ? 3 : 0) + (body.has(term) ? 1 : 0), 0);
    return { ...section, score };
  }).filter(section => section.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}

// Only pass small JPEG photos through to Gemini.
function jpegData(image) {
  if (image === undefined) return null;
  const match = typeof image === 'string' && /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match || match[1].length > 2_800_000) return false;
  return Buffer.from(match[1], 'base64').subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? match[1] : false;
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/api/voice-status') {
    return json(response, 200, { configured: !!process.env.DEEPGRAM_API_KEY });
  }
  if (request.method === 'POST' && request.url === '/api/ask') {
    if (!process.env.GEMINI_API_KEY) return json(response, 503, { error: 'Chat is not configured.' });
    if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
      return json(response, 415, { error: 'Expected JSON.' });
    }
    if (Number(request.headers['content-length']) > maxChatBytes) {
      return json(response, 413, { error: 'Message is too large.' });
    }

    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > maxChatBytes) return json(response, 413, { error: 'Message is too large.' });
        chunks.push(chunk);
      }
      const { mode = 'training', question, history = [], image } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!['training', 'general'].includes(mode) || typeof question !== 'string' || !question.trim() || question.length > 4000 ||
          !Array.isArray(history) || history.length > 20 ||
          !history.every(turn => ['user', 'model'].includes(turn?.role) &&
            typeof turn.text === 'string' && turn.text.length <= 4000 &&
            (turn.image === undefined || (turn.role === 'user' && jpegData(turn.image))))) {
        return json(response, 400, { error: 'Invalid question or conversation history.' });
      }
      const jpeg = jpegData(image);
      if (jpeg === false) {
        return json(response, 400, { error: 'Invalid or oversized photo.' });
      }
      let videos, context, noMatch;
      const allowedVideos = new Set();
      if (mode === 'training') {
        const docs = loadDocs();
        videos = docs.videos;
        const matches = retrieve(question, docs.sections);
        const topScore = matches[0]?.score || 0;
        const evidence = jpeg || topScore < 2 ? docs.sections : matches;
        context = evidence.map(section => {
          if (section.video && videos[section.video] &&
              fs.existsSync(path.join(__dirname, 'docs', 'clips', `${section.video}.mp4`))) {
            allowedVideos.add(section.video);
          }
          return `${section.title}\n${section.text}${allowedVideos.has(section.video) ? `\n[VIDEO: ${section.video}]` : ''}`;
        }).join('\n\n');
        noMatch = !matches.length;
      }
      // If no step matches, use the latest photo without unrelated chat history.
      const photoForModel = jpeg || (noMatch && jpegData([...history].reverse().find(turn => turn.image)?.image));
      const contents = (photoForModel && noMatch ? [] : history).map(turn => ({
        role: turn.role,
        parts: [{ text: turn.text }, ...(turn.image ? [{ inlineData: { mimeType: 'image/jpeg', data: jpegData(turn.image) } }] : [])],
      }));
      contents.push({
        role: 'user',
        parts: [
          ...(photoForModel ? [{ inlineData: { mimeType: 'image/jpeg', data: photoForModel } }] : []),
          { text: mode === 'training' ? `User question: ${question}` : question },
          ...(mode === 'training' ? [{ text: `Private reference for answering the question:\n${context}` }] : []),
        ],
      });

      const geminiRequest = {
        method: 'POST',
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: mode === 'training'
            ? `You are OnCue. You help trainees with the EL-120 stepper motor assembly and can use an attached photo when answering. When a photo is attached, first interpret the user's question using only the question and visible evidence in the photo. Resolve what the user is referring to before consulting the private reference. If the photo supports multiple interpretations, explain the ambiguity or ask for a clearer view instead of using the reference to choose one. After the visual subject is identified, use the private reference only to provide the applicable instruction. Keep visible observations separate from instructional guidance, and never imply that written guidance verifies what is in a photo. Do not mention steps, procedures, criteria, excerpts, retrieval, or a knowledge base unless the user explicitly asks for the source. Never present an uncertain visual inference as verified. Do not state how many wires are connected or identify a wire endpoint unless the photo clearly shows it. If a wire is ambiguous, say what cannot be identified, give documented wiring only conditionally, and ask for a close-up. The private reference may contain [VIDEO: id] tags. When a tagged clip directly demonstrates the action you are explaining, include its exact tag once at the end of your answer so the app shows the clip. Do not include a tag for an unrelated question. Never invent a tag or say a clip appears unless you include its tag. The user can say take photo or retake, and while a clip is visible they can say play video, pause video, rewind video, or forward video; seeking moves 3 seconds. When asked what you can do, mention training questions, questions about attached photos, relevant video clips, and these voice controls. A chat answer cannot operate the camera or video: never claim you took a photo or controlled a video. Answer from the private reference first. If it does not fully cover what was asked, you may add relevant general knowledge on the same topic, making clear that part is not from the procedure. Never let general knowledge contradict the reference, never use it to confirm a procedural step or anything in a photo, and do not state specific figures, ratings or tolerances you cannot source. Keep answers concise and natural.`
            : 'You are OnCue in General chat. Answer general questions using your own knowledge and any attached photo. Do not claim you took a photo or controlled the interface. Describe only what is visible in a photo, and say when a photo cannot verify a detail. No training clips are attached in this chat. Keep answers concise.' }] },
          contents,
          generationConfig: { thinkingConfig: { thinkingLevel: 'low' } },
        }),
      };
      const callGemini = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-3.5-flash'}:generateContent`, {
        ...geminiRequest,
        signal: AbortSignal.timeout(60_000),
      });
      let upstream = await callGemini();
      if (upstream.status >= 500) upstream = await callGemini();
      if (!upstream.ok) {
        const detail = await upstream.json().catch(() => ({}));
        const reason = detail.error?.details?.find(item => item.reason)?.reason;
        console.error(`Gemini request failed: HTTP ${upstream.status}${reason ? ` (${reason})` : ''}`);
        const error = reason === 'API_KEY_INVALID' || upstream.status === 401
          ? 'Gemini rejected the API key. Create a new key in Google AI Studio and replace it in .env.'
          : upstream.status === 403
            ? 'Gemini denied access for this key. Check its permissions in Google AI Studio.'
            : upstream.status === 429
              ? 'Gemini rate limit reached. Try again later.'
              : `Gemini request failed (HTTP ${upstream.status}).`;
        return json(response, 502, { error });
      }
      const result = await upstream.json();
      const rawAnswer = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
      if (!rawAnswer) return json(response, 502, { error: 'No answer returned. Try again.' });
      let clip;
      const answer = rawAnswer.replace(/\[VIDEO:\s*([\w-]+)\]/g, (_, id) => {
        if (!clip && allowedVideos.has(id)) clip = id;
        return '';
      }).replace(/\n{3,}/g, '\n\n').trim();
      json(response, 200, { answer, video: clip ? videos[clip] : null });
    } catch (error) {
      if (!response.writableEnded && !response.destroyed) {
        json(response, error instanceof SyntaxError ? 400 : 502, {
          error: error instanceof SyntaxError ? 'Invalid JSON.' : 'Could not connect to Gemini. Check the server connection.',
        });
      }
    }
    return;
  }

  const clip = /^\/docs\/clips\/([\w.-]+\.mp4)$/.exec(request.url);
  if (clip) {
    if (request.method !== 'GET') return response.writeHead(405).end('Method not allowed');
    const clipPath = path.join(__dirname, 'docs', 'clips', path.basename(clip[1]));
    let size;
    try {
      size = fs.statSync(clipPath).size;
    } catch {
      return response.writeHead(404).end('Not found');
    }
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || end < start) {
        return response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      }
      response.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      });
      return fs.createReadStream(clipPath, { start, end }).pipe(response);
    }
    response.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': size,
      'Accept-Ranges': 'bytes',
    });
    return fs.createReadStream(clipPath).pipe(response);
  }

  const file = Object.hasOwn(files, request.url) ? files[request.url] : null;
  if (request.method !== 'GET' || !file) return response.writeHead(404).end('Not found');
  response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` });
  fs.createReadStream(path.join(__dirname, file[0])).pipe(response);
});

const voiceSockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/api/voice' || !process.env.DEEPGRAM_API_KEY) return socket.destroy();
  voiceSockets.handleUpgrade(request, socket, head, browser => {
    const agent = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', ['token', process.env.DEEPGRAM_API_KEY]);
    agent.binaryType = 'arraybuffer';
    browser.on('message', (data, binary) => {
      if (agent.readyState === WebSocket.OPEN) agent.send(binary ? data : data.toString());
    });
    agent.addEventListener('message', event => {
      if (browser.readyState === browser.OPEN) browser.send(event.data);
    });
    agent.addEventListener('error', () => browser.close(1011, 'Voice agent unavailable'));
    agent.addEventListener('close', () => browser.close());
    browser.on('close', () => agent.close());
  });
});

server.listen(Number(process.env.PORT) || 3000, '127.0.0.1', function () {
  console.log(`OnCue running at http://localhost:${this.address().port}`);
});

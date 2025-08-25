const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// v3 Chat Completions URL (JSON response)
const BASE_URL = 'https://clovastudio.stream.ntruss.com';
const MODEL = process.env.CLOVA_MODEL || 'HCX-005';

// Constraints from docs: <= 20MB, long side <= 2240px
const MAX_LONG_SIDE = 2240;
const MAX_BYTES = 20 * 1024 * 1024;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for in-memory file uploads
const upload = multer({ storage: multer.memoryStorage() });

// In-memory temp store for serving images briefly
const tempStore = new Map(); // id -> { buffer, mime, t }

// Public temp routes to serve images
app.get('/tmp/:id.jpg', (req, res) => {
  const item = tempStore.get(req.params.id);
  if (!item) return res.status(404).end();
  res.set('Content-Type', item.mime || 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  return res.send(item.buffer);
});
// Back-compat without extension (not preferred by API, but keep it)
app.get('/tmp/:id', (req, res) => {
  const item = tempStore.get(req.params.id);
  if (!item) return res.status(404).end();
  res.set('Content-Type', item.mime || 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  return res.send(item.buffer);
});

// Simple cleaner to evict stale items
setInterval(() => {
  const now = Date.now();
  for (const [id, it] of tempStore) {
    if (now - it.t > 2 * 60 * 1000) tempStore.delete(id); // 2 minutes
  }
}, 60 * 1000);

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Yeoriggun AI API',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// Health check route
app.get('/health', (_, res) => res.json({ ok: true }));

function modelSupportsStructuredOutputs(model) {
  // 예시: HCX-007만 SO 지원하는 케이스로 가정
  return /^HCX-007/.test(model);
}

async function ensureImageWithinLimits(originalBuffer) {
  let img = sharp(originalBuffer, { failOn: 'none' });
  const meta = await img.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  // Resize if needed based on long side
  const longSide = Math.max(width, height);
  if (longSide > MAX_LONG_SIDE) {
    const resizeOptions = width >= height ? { width: MAX_LONG_SIDE } : { height: MAX_LONG_SIDE };
    img = img.resize({ ...resizeOptions, withoutEnlargement: true, fit: 'inside' });
  }

  // Re-encode to JPEG to control size
  let quality = 85;
  let out = await img.jpeg({ quality, progressive: true }).toBuffer();

  // If still over size, reduce quality iteratively
  while (out.length > MAX_BYTES && quality > 40) {
    quality -= 10;
    out = await sharp(originalBuffer).resize({
      width: width >= height ? Math.min(width, MAX_LONG_SIDE) : undefined,
      height: height > width ? Math.min(height, MAX_LONG_SIDE) : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    }).jpeg({ quality, progressive: true }).toBuffer();
  }

  return { buffer: out, mime: 'image/jpeg' };
}

// Analyze route - accepts an image and returns fruit counts and prices
app.post('/analyze', upload.single('image'), async (req, res) => {
  let cleanupId;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'image is required' });
    }

    const publicBase = process.env.PUBLIC_BASE_URL; // e.g., https://xxxx.ngrok-free.app
    if (!publicBase || !publicBase.startsWith('https://')) {
      return res.status(500).json({
        error: 'invalid_public_base_url',
        detail: 'Set PUBLIC_BASE_URL to an HTTPS public URL (e.g., ngrok https address).',
      });
    }

    // Enforce image constraints
    const processed = await ensureImageWithinLimits(req.file.buffer);

    // Store temporarily in memory and expose via /tmp/:id.jpg
    const id = crypto.randomUUID();
    cleanupId = id;
    tempStore.set(id, { buffer: processed.buffer, mime: processed.mime, t: Date.now() });
    const url = `${publicBase}/tmp/${id}.jpg?ngrok-skip-browser-warning=true`;
    console.log('HCX image URL =>', url);

    // 사용자 지시문 (바구니가 없는 과일은 개별 갯수/가격, 바구니가 있으면 *_바구니만)
    const userInstruction =
      '이미지 속 과일 종류와 갯수와 가격을 JSON으로만 반환하세요. 과일 이름은 모두 한국어로 하세요. 바구니가 없는 과일은 해당 과일의 개별 갯수와 가격을 반환하세요. 특정 과일이 바구니에 담겨 있는 경우에는 그 과일의 개별 갯수와 가격은 반환하지 말고, <과일이름>_바구니 키로 바구니 개수와 바구니 가격만 반환하세요. 가격은 숫자(원 단위, 기호 제거)로만 표기하세요. 값은 0 이상의 정수만, 다른 설명은 금지. 예) 사과 3개(개당 1200원) + 사과 바구니 1개(바구니 5000원) → {"counts":{"사과":3,"사과_바구니":1},"prices":{"사과":1200,"사과_바구니":5000}}';

    // ✅ v3 멀티모달 포맷: type "text" / "imageUrl"
    const body = {
      messages: [
        {
          role: 'system',
          content: [{ type: 'text', text: 'You are a strict counter and price reader. Return ONLY JSON.' }],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userInstruction },
            { type: 'image_url', imageUrl: { url } }, // HTTPS 공개 URL 필수 (확장자 포함)
          ],
        },
      ],
      maxTokens: 600,
      temperature: 0.2,
    };

    // Structured Outputs: 지원 모델에서만
    if (modelSupportsStructuredOutputs(MODEL)) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          strict: true,
          name: 'fruit_counts_prices',
          schema: {
            type: 'object',
            properties: {
              counts: {
                type: 'object',
                additionalProperties: { type: 'integer', minimum: 0 },
              },
              prices: {
                type: 'object',
                additionalProperties: { type: 'integer', minimum: 0 },
              },
            },
            required: ['counts', 'prices'],
            additionalProperties: false,
          },
        },
      };
    }

    const r = await axios.post(`${BASE_URL}/v3/chat-completions/${MODEL}`, body, {
      headers: {
        Authorization: `Bearer ${process.env.CLOVA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Parse result (v3 default JSON response)
    let raw = r.data?.result?.message?.content ?? '';
    if (Array.isArray(raw)) raw = raw[0]?.text ?? '{}';
    if (typeof raw !== 'string') raw = String(raw || '{}');

    // Try direct JSON parse; if fails, extract first {...} block and parse
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = { counts: {}, prices: {} }; }
      } else {
        parsed = { counts: {}, prices: {} };
      }
    }

    const counts = parsed?.counts ?? {};
    const prices = parsed?.prices ?? {};

    // If *_바구니가 있으면 같은 과일의 기본 키는 제거 (counts/prices 모두 적용)
    const resultCounts = {};
    const resultPrices = {};
    const basketFruits = new Set();
    Object.keys(counts).forEach((key) => {
      if (key.endsWith('_바구니') && counts[key] > 0) {
        const fruit = key.slice(0, -4);
        basketFruits.add(fruit);
      }
    });
    Object.keys(counts).forEach((key) => {
      if (key.endsWith('_바구니')) {
        resultCounts[key] = counts[key];
        if (prices[key] != null) resultPrices[key] = prices[key];
      } else if (!basketFruits.has(key)) {
        resultCounts[key] = counts[key];
        if (prices[key] != null) resultPrices[key] = prices[key];
      }
    });

    return res.json({ counts: resultCounts, prices: resultPrices });
  } catch (err) {
    const detail = err?.response?.data || err.message;
    console.error(detail);
    return res.status(500).json({
      error: 'clova_call_failed',
      detail,
    });
  } finally {
    if (cleanupId) tempStore.delete(cleanupId);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Main endpoint: http://localhost:${PORT}/`);
});

module.exports = app;

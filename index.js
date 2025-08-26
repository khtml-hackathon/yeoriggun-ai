const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp');
const DEBUG_RAW = String(process.env.DEBUG_RAW || 'false') === 'true';

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CLOVA Studio v3
const BASE_URL = 'https://clovastudio.stream.ntruss.com';
const MODEL = process.env.CLOVA_MODEL || 'HCX-005';
// CSR (Speech-to-Text)
const CSR_LANG = process.env.CSR_LANG || 'Kor';
const CSR_URL = `https://naveropenapi.apigw.ntruss.com/recog/v1/stt?lang=${CSR_LANG}`;

// 이미지 제약: <= 20MB, 긴 변 <= 2240px
const MAX_LONG_SIDE = 2240;
const MAX_BYTES = 20 * 1024 * 1024;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'audio/wav', limit: MAX_BYTES }));

// 메모리 업로드
const upload = multer({ storage: multer.memoryStorage() });

// ---------- Object Storage (S3 호환) ----------
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: process.env.NCP_OS_REGION,                 // e.g. kr-standard
  endpoint: process.env.NCP_OS_ENDPOINT,             // e.g. https://kr.object.ncloudstorage.com
  credentials: {
    accessKeyId: process.env.NCP_OS_ACCESS_KEY,
    secretAccessKey: process.env.NCP_OS_SECRET_KEY,
  },
  forcePathStyle: true, // NCP는 path-style 편함
});

async function uploadAndGetUrl(buffer, mime) {
  const ext = (mime?.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  // 업로드 (비공개 버킷이어도 됨)
  await s3.send(new PutObjectCommand({
    Bucket: process.env.NCP_OS_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mime || 'application/octet-stream',
  }));

  // presigned GET URL
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.NCP_OS_BUCKET, Key: key }),
    { expiresIn: Number(process.env.PRESIGN_EXPIRES_SEC || 300) }
  );
  return { url, key };
}
// ---------------------------------------------

// 기본/헬스
app.get('/', (_, res) =>
  res.json({ message: 'Yeoriggun AI API', status: 'running', ts: new Date().toISOString() })
);
app.get('/health', (_, res) => res.json({ ok: true }));

// 이미지 리사이즈/재인코딩
async function ensureImageWithinLimits(originalBuffer) {
  let img = sharp(originalBuffer, { failOn: 'none' });
  const meta = await img.metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;

  const longSide = Math.max(w, h);
  if (longSide > MAX_LONG_SIDE) {
    img = img.resize({
      width: w >= h ? MAX_LONG_SIDE : undefined,
      height: h > w ? MAX_LONG_SIDE : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  let quality = 85;
  let out = await img.rotate().jpeg({ quality, progressive: true }).toBuffer();

  // 용량 초과 시 품질 단계적 하향
  while (out.length > MAX_BYTES && quality > 40) {
    quality -= 10;
    out = await sharp(originalBuffer)
      .rotate()
      .resize({
        width: w >= h ? Math.min(w, MAX_LONG_SIDE) : undefined,
        height: h > w ? Math.min(h, MAX_LONG_SIDE) : undefined,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, progressive: true })
      .toBuffer();
  }

  return { buffer: out, mime: 'image/jpeg' };
}

// 메인: 과일 개수만 반환
app.post('/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image is required' });

  let keyForDelete = null;
  try {
    // 1) 이미지 표준화
    const processed = await ensureImageWithinLimits(req.file.buffer);

    // 2) Object Storage 업로드 → presigned HTTPS URL
    const { url, key } = await uploadAndGetUrl(processed.buffer, processed.mime);
    keyForDelete = key;
    console.log('Presigned URL:', url);

    // 3) CLOVA 요청 본문 
    const instruction = `이미지에서 과일별 '바구니 개수'와 '바구니 가격'만 JSON으로 반환하세요.
중요: 이 사진에는 과일 종류가 '한 가지'뿐입니다. 반드시 하나의 과일 이름만 사용하세요.
규칙:
- 최상위 키는 baskets, prices 두 개만 사용합니다.
- baskets: 한국어 과일 이름(예: 사과, 바나나) → 그 과일이 담긴 바구니 개수(정수). 한 바구니=1.
- prices: 해당 과일 가격(정수, 원 단위. ₩/원/쉼표 등 기호 제거).
- 불확실한 항목은 0 대신 키를 생략합니다.
응답 예시:
{"baskets":{"사과":1,"바나나":2},"prices":{"사과_바구니":5000,"바나나_바구니":3900}}`;

    const body = {
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'You are a strict counter. Return ONLY JSON.' }] },
        { role: 'user', content: [{ type: 'text', text: instruction }, { type: 'image_url', imageUrl: { url } }] },
      ],
      maxTokens: 300,
      temperature: 0.2,
    };

    const r = await axios.post(`${BASE_URL}/v3/chat-completions/${MODEL}`, body, {
      headers: { Authorization: `Bearer ${process.env.CLOVA_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    // 4) 응답 파싱
    let raw = r.data?.result?.message?.content ?? '';
    if (Array.isArray(raw)) raw = raw[0]?.text ?? '{}';
    if (typeof raw !== 'string') raw = String(raw || '{}');

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? (JSON.parse(m[0]) || { counts: {} }) : { counts: {} };
    }

    const baskets = parsed?.baskets ?? {};
    const prices = parsed?.prices ?? {};
    return res.json({ baskets, prices });

  } catch (err) {
    const detail = err?.response?.data || err.message;
    console.error(detail);
    return res.status(500).json({ error: 'clova_call_failed', detail });
  } finally {
    // 5) 비용/보관 최소화: presigned 만료와 별개로 객체 즉시 삭제(옵션)
    if (String(process.env.DELETE_AFTER_INFER || 'true') === 'true' && keyForDelete) {
      try { await s3.send(new DeleteObjectCommand({ Bucket: process.env.NCP_OS_BUCKET, Key: keyForDelete })); }
      catch (_) {}
    }
  }
});

// 음성 인식 + 요약
app.post('/stt-summarize', async (req, res) => {
  try {
    const wavBytes = req.body;
    if (!wavBytes || !Buffer.isBuffer(wavBytes) || wavBytes.length === 0) {
      return res.status(400).json({ error: 'wav audio body required (Content-Type: audio/wav)' });
    }

    // 1) CSR 호출
    const csrResp = await axios.post(CSR_URL, wavBytes, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': process.env.NCP_CSR_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': process.env.NCP_CSR_CLIENT_SECRET,
        'Content-Type': 'application/octet-stream',
      },
      timeout: 60000,
    });
    const recognizedText = (csrResp.data && csrResp.data.text) || (typeof csrResp.data === 'string' ? csrResp.data : '');

    // 2) HCX-005 요약
    const summaryPrompt = `아래 판매 멘트를 항목형 텍스트로만 출력하세요.
- 형식 고정, 추가 문장/코드블록 금지
- 없는 항목은 그 줄 자체를 생략
출력 형식(예):
원산지: 미국 캘리포니아, 스페인, 남아공
한 망: 2kg, 6~10개
보관: 상온 가능, 장기 보관 시 냉장 권장\n\n"""\n${recognizedText}\n"""`;

    const body = {
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'You are a helpful summarizer. Return ONLY plain text without markdown.' }] },
        { role: 'user', content: [{ type: 'text', text: summaryPrompt }] },
      ],
      maxTokens: 400,
      temperature: 0.3,
    };
    const r = await axios.post(`${BASE_URL}/v3/chat-completions/${MODEL}`, body, {
      headers: { Authorization: `Bearer ${process.env.CLOVA_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    let summary = r.data?.result?.message?.content ?? '';
    if (Array.isArray(summary)) summary = summary[0]?.text ?? '';
    if (typeof summary !== 'string') summary = String(summary || '');

    return res.json({ text: recognizedText, summary });
  } catch (err) {
    const detail = err?.response?.data || err.message;
    console.error(detail);
    return res.status(500).json({ error: 'stt_or_summary_failed', detail });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📱 Health: http://localhost:${PORT}/health`);
});

module.exports = app;

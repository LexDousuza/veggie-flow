// /api/whatsapp-webhook.js
// Receives incoming WhatsApp messages from Twilio, parses orders with Groq AI,
// and saves them to Supabase.

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const MAX_MESSAGE_LENGTH = 2000;

// Verifies the request actually came from Twilio using the signature Twilio
// computes over the full URL + sorted form params, HMAC-SHA1 with the auth
// token. Without this, anyone who finds this URL can POST fake orders or
// burn the Groq API budget.
function verifyTwilioSignature(req, rawBody) {
  if (!TWILIO_AUTH_TOKEN) {
    console.error("TWILIO_AUTH_TOKEN not configured — rejecting webhook request");
    return false;
  }
  const signature = req.headers["x-twilio-signature"];
  if (!signature) return false;

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = `${proto}://${host}${req.url}`;

  const params = new URLSearchParams(rawBody);
  const entries = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let data = url;
  for (const [key, value] of entries) data += key + value;

  const expected = crypto.createHmac("sha1", TWILIO_AUTH_TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");

  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(signature);
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

function today() {
  return new Date().toISOString().split("T")[0];
}
function tomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}
function genId() {
  return "PK-" + Math.floor(100000 + Math.random() * 900000);
}

const ALLOWED_UNITS = ["kg", "pcs", "bunches", "boxes", "crates", "grams"];
const MAX_QTY = 100000;
const MAX_ITEMS = 50;
const MAX_STR = 200;
const MAX_NOTES = 1000;

// The AI-parsed order comes from an arbitrary WhatsApp message (or OCR'd
// image) — never trust its shape or values before writing them to the DB.
function clampStr(v, max) {
  return String(v ?? "").slice(0, max);
}

function sanitizeParsedOrder(parsed) {
  const items = Array.isArray(parsed?.items) ? parsed.items.slice(0, MAX_ITEMS) : [];
  const cleanItems = items
    .map((it) => {
      const qty = Number(it?.qty);
      if (!Number.isFinite(qty) || qty <= 0) return null;
      return {
        name: clampStr(it?.name, 100) || "Unknown item",
        qty: Math.min(qty, MAX_QTY),
        unit: ALLOWED_UNITS.includes(it?.unit) ? it.unit : "kg",
      };
    })
    .filter(Boolean);

  const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed?.deliveryDate || "")
    ? parsed.deliveryDate
    : "";

  return {
    customer: clampStr(parsed?.customer, MAX_STR),
    business: clampStr(parsed?.business, MAX_STR),
    phone: clampStr(parsed?.phone, MAX_STR),
    deliveryDate,
    deliveryLocation: clampStr(parsed?.deliveryLocation, MAX_STR),
    notes: clampStr(parsed?.notes, MAX_NOTES),
    items: cleanItems,
  };
}

async function parseOrderWithGroq(message) {
  const apiKey = GROQ_API_KEY;
  const prompt = `You are an order extraction AI for an exotic vegetable business in India. Extract order details from this WhatsApp message and return ONLY valid JSON, no markdown, no explanation.

Known vegetables: Broccoli, Iceberg Lettuce, Zucchini, Asparagus, Bok Choy, Kale, Cherry Tomatoes, Red Bell Pepper, Yellow Bell Pepper, Green Bell Pepper, Parsley, Celery, Spinach, Cucumber, Capsicum.

Return this exact JSON structure:
{
  "customer": "customer name or empty string",
  "business": "business name or empty string",
  "phone": "phone number or empty string",
  "deliveryDate": "YYYY-MM-DD or empty string",
  "deliveryLocation": "location or empty string",
  "notes": "special instructions or empty string",
  "items": [{"name": "vegetable name", "qty": number, "unit": "kg|pcs|bunches|boxes|crates|grams"}]
}

For delivery dates: "tomorrow" = ${tomorrowDate()}, "today" = ${today()}, "morning" means note it as early delivery.
Normalize vegetable names to match the known list. Default unit is "kg" if not specified.

WhatsApp message to parse:
"${message}"`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
  });
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "{}";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function parseOrderFromImageUrl(imageUrl) {
  const apiKey = GROQ_API_KEY;

  // Twilio media URLs require Basic Auth to fetch — download and convert to base64
  const authHeader = "Basic " + Buffer.from(
    `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
  ).toString("base64");

  const imgResponse = await fetch(imageUrl, { headers: { Authorization: authHeader } });
  const imgBuffer = await imgResponse.arrayBuffer();
  const base64Image = `data:image/jpeg;base64,${Buffer.from(imgBuffer).toString("base64")}`;

  const prompt = `You are an order extraction AI for an exotic vegetable business in India. Look at this image (likely a screenshot of a WhatsApp order message or handwritten note) and extract the order details. Return ONLY valid JSON, no markdown, no explanation.

Known vegetables: Broccoli, Iceberg Lettuce, Zucchini, Asparagus, Bok Choy, Kale, Cherry Tomatoes, Red Bell Pepper, Yellow Bell Pepper, Green Bell Pepper, Parsley, Celery, Spinach, Cucumber, Capsicum.

Return this exact JSON structure:
{
  "customer": "customer name or empty string",
  "business": "business name or empty string",
  "phone": "phone number or empty string",
  "deliveryDate": "YYYY-MM-DD or empty string",
  "deliveryLocation": "location or empty string",
  "notes": "special instructions or empty string",
  "items": [{"name": "vegetable name", "qty": number, "unit": "kg|pcs|bunches|boxes|crates|grams"}]
}

For delivery dates: "tomorrow" = ${tomorrowDate()}, "today" = ${today()}, "morning" means note it as early delivery.
Normalize vegetable names to match the known list. Default unit is "kg" if not specified.
Read all text in the image carefully, including any handwriting.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: base64Image } },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "{}";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function parseFormBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        const params = new URLSearchParams(raw);
        const fields = {};
        for (const [key, value] of params) fields[key] = value;
        resolve({ raw, fields });
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const { raw, fields: body } = await parseFormBody(req);

    if (!verifyTwilioSignature(req, raw)) {
      console.error("Rejected webhook request: invalid or missing Twilio signature");
      res.status(403).send("Forbidden");
      return;
    }

    const messageText = (body.Body || "").slice(0, MAX_MESSAGE_LENGTH);
    const numMedia = parseInt(body.NumMedia || "0", 10);
    const fromNumber = body.From || "";

    let parsedOrder;
    let rawMessage;

    if (numMedia > 0) {
      // Image message — use vision parsing
      const mediaUrl = body.MediaUrl0;
      parsedOrder = await parseOrderFromImageUrl(mediaUrl);
      rawMessage = "[Order extracted from forwarded image]";
    } else if (messageText.trim()) {
      // Text message — use text parsing
      parsedOrder = await parseOrderWithGroq(messageText);
      rawMessage = messageText;
    } else {
      // Nothing usable in this message
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(
        `<Response><Message>Please send order text or a photo of the order.</Message></Response>`
      );
      return;
    }

    const clean = sanitizeParsedOrder(parsedOrder);
    let orderId = genId();
    let error;
    // genId() is a random 6-digit id with no uniqueness guarantee — on a rare
    // collision (Postgres unique-violation 23505), regenerate and retry.
    for (let attempt = 0; attempt < 5; attempt++) {
      ({ error } = await supabase.from("orders").insert([
        {
          id: orderId,
          customer: clean.customer || "Unknown",
          business: clean.business,
          phone: clean.phone || fromNumber.replace("whatsapp:", ""),
          order_date: today(),
          delivery_date: clean.deliveryDate || tomorrowDate(),
          delivery_location: clean.deliveryLocation,
          items: clean.items,
          notes: clean.notes,
          status: "Pending",
          raw_message: rawMessage,
        },
      ]));
      if (!error || error.code !== "23505") break;
      orderId = genId();
    }

    if (error) {
      console.error("Supabase insert error:", error);
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(
        `<Response><Message>⚠️ Order received but failed to save: ${error.message}</Message></Response>`
      );
      return;
    }

    const itemsSummary = clean.items
      .map((it) => `${it.name} ${it.qty}${it.unit}`)
      .join(", ");

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(
      `<Response><Message>✅ Order ${orderId} created for ${clean.customer || "customer"}!\nItems: ${itemsSummary}\nDelivery: ${clean.deliveryDate || tomorrowDate()}</Message></Response>`
    );
  } catch (err) {
    console.error("Webhook error:", err);
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(
      `<Response><Message>⚠️ Couldn't process that order. Please try again or type it manually.</Message></Response>`
    );
  }
};

// /api/parse-order.js
// Parses a WhatsApp-style order (text or image) into structured JSON using OpenAI.
// Runs server-side only — the OpenAI key must never reach the browser bundle
// (it previously did, via REACT_APP_OPENAI_KEY, called directly from src/App.js).
// Requires a valid Supabase session token so random internet traffic can't
// hit this URL directly and burn the OpenAI budget.

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const DEFAULT_ITEMS = [
  "American Kale","Arugula / Rocket Lettuce","Asparagus Imported","Baby Corn","Baby Spinach",
  "Basil Leaves","Broccoli","Celery Fresh","Chinese Cabbage","Chinese Pakchoy",
  "Curled Parsley","Edible Flower","Fresh Oregano","Iceberg Lettuce","Kafir Lime Leaves",
  "Leeks","Lemon Grass","Lolo Rosso Lettuce","Lotus Stem","Mushroom",
  "Bell Pepper Red","Bell Pepper Yellow","Bell Pepper Mix",
  "Radish Microgreens","Red Cabbage","Red Radish",
  "Romaine Green Lettuce","Rosemary Fresh","Thai Chilli","Thai Ginger / Galangal","Thyme Fresh",
  "Tomato Cherry","Green Zucchini","Yellow Zucchini","Zucchini Mix","Peeled Garlic","Sweet Corn Frozen","Green Peas Frozen",
];

function today(){ return new Date().toISOString().split("T")[0]; }
function tomorrow(){ const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; }

function textPrompt(message){
  return `You are an expert order-entry assistant for "Exotic Greens", a wholesale exotic vegetable supplier in India. Customers send informal WhatsApp messages — extract the order into structured JSON.

KNOWN ITEMS — this is the complete, fixed inventory list. Every item you extract MUST be matched to one of these exact names: ${DEFAULT_ITEMS.join(", ")}.
- "babycorn", "baby corn" → "Baby Corn"
- "baby spinach" → "Baby Spinach"
- "basil", "basil leaves" → "Basil Leaves"
- "broccoli" → "Broccoli"
- "celery" → "Celery Fresh"
- "chinese cabbage", "napa cabbage" → "Chinese Cabbage"
- "pakchoy", "pak choy", "bok choi", "bok choy", "chinese pakchoy" → "Chinese Pakchoy"
- "parsley", "curled parsley" → "Curled Parsley"
- "edible flower", "edible flowers" → "Edible Flower"
- "oregano", "fresh oregano", "oregono" → "Fresh Oregano"
- "iceberg", "ice lettuce", "iceberg lettuce", "ice burg lettuce" → "Iceberg Lettuce"
- "kafir lime", "kaffir lime", "lime leaves", "kafir lime leaves" → "Kafir Lime Leaves"
- "leeks", "leek" → "Leeks"
- "lemongrass", "lemon grass" → "Lemon Grass"
- "lolorosso", "lolo rosso", "lolorasso lettuce" → "Lolo Rosso Lettuce"
- "lotus stem", "lotus root" → "Lotus Stem"
- "mushroom", "mushrooms", "button mushroom" → "Mushroom" (default unit: pcs)
- "red pepper", "red bell pepper", "bell pepper red", "red capsicum", "peppers red" → "Bell Pepper Red"
- "yellow pepper", "yellow bell pepper", "bell pepper yellow", "yellow capsicum", "peppers yellow" → "Bell Pepper Yellow"
- "microgreens", "radish microgreens" → "Radish Microgreens"
- "red cabbage", "redcabbage" → "Red Cabbage"
- "red radish", "radish" (no color specified, default to red) → "Red Radish"
- "romaine", "romaine lettuce", "romaine green lettuce" → "Romaine Green Lettuce"
- "rosemary" → "Rosemary Fresh"
- "thai chilli", "thai chili", "bird's eye chilli" → "Thai Chilli"
- "thai ginger", "galangal", "galangan" → "Thai Ginger / Galangal"
- "thyme" → "Thyme Fresh"
- "cherry tomato", "cherry tomatoes", "tomato cherry", "cherry tom", "cherry toms" → "Tomato Cherry"
- "zucchini" with no color specified, or "green zucchini", "zucchini green" → "Green Zucchini"
- "yellow zucchini" → "Yellow Zucchini"
- "garlic", "peeled garlic" → "Peeled Garlic"
- "sweet corn", "frozen corn", "corn" → "Sweet Corn Frozen"
- "green peas", "frozen peas", "peas" → "Green Peas Frozen"
- "rocket", "arugula", "rocket lettuce" → "Arugula / Rocket Lettuce"
- "asparagus" → "Asparagus Imported"
- "kale", "american kale" → "American Kale"

STRICT MATCHING RULE — you are NOT allowed to invent new item names, and you are NOT allowed to guess a different known item when unsure:
1. If the customer's word clearly and confidently refers to one of the KNOWN ITEMS (a typo, abbreviation, plural, or listed synonym above) → use that exact known name.
2. If the customer's word does NOT confidently match any known item (unclear handwriting, an item you don't recognize, or genuinely ambiguous text) → do NOT pick any known item name, and do NOT make up a new vegetable name either. Instead, set "name" to the raw text you actually saw (e.g. "name":"???broccoli" or whatever was written), and add a flag in notes like: "⚠️ Please verify: could not confidently match item '<raw text>' to inventory."
3. Never default to a fixed fallback item just because you are unsure — always either match confidently or flag and keep the raw text. A wrong specific match is worse than flagging it for human review.

UNITS — be strict, these are NOT interchangeable:
- "kg", "kgs", "kilo" → "kg"
- "g", "gm", "gms", "grams" → "grams" (NEVER convert to kg automatically — keep the number and unit exactly as stated)
- "pc", "pcs", "piece", "pieces", "nos" → "pcs"
- "bunch", "bunches" → "bunches"
- "box", "boxes" → "boxes"
- "crate", "crates" → "crates"
- "pkt", "packet", "packets", "punnet" → "pkt"
- CUSTOMER NAME RULE: If the message contains "#xyz" at the start or anywhere prominent, the customer name is "xyz" (strip the # — do NOT include it in the customer field).
- BELL PEPPER MIX RULE: If the message says "bellpepper 6+6" or "bell pepper 6+6" or "bellpepper mix" with no specific colour, create ONE item: name="Bell Pepper Mix", qty=12 (sum of both), display_qty="(6+6)". If only ONE colour is specified ("red bellpepper 5kg"), use "Bell Pepper Red" or "Bell Pepper Yellow" as a single item. If both colours are listed separately ("red bellpepper 3kg, yellow bellpepper 3kg"), create them as separate items.
- ZUCCHINI MIX RULE: If "zucchini 4+4" or "zucchini mix" with no colour, create ONE item: name="Zucchini Mix", qty=8, display_qty="(4+4)". Green zucchini alone → "Green Zucchini". Yellow alone → "Yellow Zucchini".
- If no unit is given for a vegetable, assume its usual unit: Baby Spinach, Edible Flower, and Radish Microgreens default to "pkt"; everything else defaults to "kg".
- QUANTITY NOTATION: customers sometimes write split quantities like "5+5" or "2+3" meaning multiple bags/batches to sum together. Add them up: "5+5" → qty 10. If genuinely unclear what's being summed, make your best total and flag it in notes.

DATES: today=${today()}, tomorrow=${tomorrow()}. "tomorrow morning"/"tom morning" → deliveryDate=tomorrow, note "morning delivery" in notes. Plain weekday names (e.g. "Friday") → leave deliveryDate empty and put the day name in notes instead of guessing the wrong date.

IMPORTANT — never refuse and never return an empty result. Always extract your single best-guess interpretation of every item, quantity, and detail, even if the message is vague, has typos, or is in mixed Hindi/English. Do your best with partial information rather than skipping it.
If something is genuinely ambiguous (e.g. unclear whether "2-3 kg" means 2 or 3), make a best guess and add a short flag in "notes" like: "⚠️ Please verify: Broccoli quantity was ambiguous, guessed 2kg." Stack multiple flags with line breaks if needed. The order must always come through — flags are a heads-up for the reviewer, not a reason to leave fields blank.

Return ONLY this JSON shape, no markdown, no commentary:
{"customer":"","business":"","phone":"","deliveryDate":"YYYY-MM-DD or empty string","deliveryLocation":"","notes":"","items":[{"name":"","qty":0,"unit":"kg","display_qty":""}]}
display_qty: only set when original order uses split notation like "6+6" — e.g. display_qty="(6+6)". Leave blank otherwise.

EXAMPLE 1
Message: "Hi this is Ramesh from Spice Route restaurant. Need 2kg broccoli, 500g cherry tomato, 10 pcs iceberg lettuce for tomorrow."
Output: {"customer":"Ramesh","business":"Spice Route","phone":"","deliveryDate":"${tomorrow()}","deliveryLocation":"","notes":"","items":[{"name":"Broccoli","qty":2,"unit":"kg"},{"name":"Tomato Cherry","qty":500,"unit":"grams"},{"name":"Iceberg Lettuce","qty":10,"unit":"pcs"}]}

EXAMPLE 2 (unmatched item handling + split quantity + packet unit)
Message: "Rolls n Rice - Dragonfruit 2kg, Peppers red 5+5, Baby spinach 3pkt"
Output: {"customer":"Rolls n Rice","business":"","phone":"","deliveryDate":"","deliveryLocation":"","notes":"⚠️ Please verify: could not confidently match item 'Dragonfruit' to inventory.","items":[{"name":"Dragonfruit","qty":2,"unit":"kg"},{"name":"Bell Pepper Red","qty":10,"unit":"kg"},{"name":"Baby Spinach","qty":3,"unit":"pkt"}]}
(Note: "Peppers red" matches the known item "Bell Pepper Red" directly; "5+5" summed to 10. "Baby spinach" is a packet item, kept as "pkt" not converted to kg. "Dragonfruit" isn't in the known list, so it's kept as raw text and flagged — not replaced with a random known item.)

Now extract this message exactly the same way:
"${message}"`;
}

function imagePrompt(){
  return `You are an expert order-entry assistant for "Exotic Greens", a wholesale exotic vegetable supplier in India. The image is a WhatsApp screenshot or a handwritten order note. Read all visible text carefully, including handwriting, then extract the order into structured JSON.

KNOWN ITEMS — this is the complete, fixed inventory list. Every item you extract MUST be matched to one of these exact names: ${DEFAULT_ITEMS.join(", ")}.
- "babycorn", "baby corn" → "Baby Corn"
- "baby spinach" → "Baby Spinach"
- "basil", "basil leaves" → "Basil Leaves"
- "broccoli" → "Broccoli"
- "celery" → "Celery Fresh"
- "chinese cabbage", "napa cabbage" → "Chinese Cabbage"
- "pakchoy", "pak choy", "bok choi", "bok choy", "chinese pakchoy" → "Chinese Pakchoy"
- "parsley", "curled parsley" → "Curled Parsley"
- "edible flower", "edible flowers" → "Edible Flower"
- "oregano", "fresh oregano", "oregono" → "Fresh Oregano"
- "iceberg", "ice lettuce", "iceberg lettuce", "ice burg lettuce" → "Iceberg Lettuce"
- "kafir lime", "kaffir lime", "lime leaves", "kafir lime leaves" → "Kafir Lime Leaves"
- "leeks", "leek" → "Leeks"
- "lemongrass", "lemon grass" → "Lemon Grass"
- "lolorosso", "lolo rosso", "lolorasso lettuce" → "Lolo Rosso Lettuce"
- "lotus stem", "lotus root" → "Lotus Stem"
- "mushroom", "mushrooms", "button mushroom" → "Mushroom" (default unit: pcs)
- "red pepper", "red bell pepper", "bell pepper red", "red capsicum", "peppers red" → "Bell Pepper Red"
- "yellow pepper", "yellow bell pepper", "bell pepper yellow", "yellow capsicum", "peppers yellow" → "Bell Pepper Yellow"
- "microgreens", "radish microgreens" → "Radish Microgreens"
- "red cabbage", "redcabbage" → "Red Cabbage"
- "red radish", "radish" (no color specified, default to red) → "Red Radish"
- "romaine", "romaine lettuce", "romaine green lettuce" → "Romaine Green Lettuce"
- "rosemary" → "Rosemary Fresh"
- "thai chilli", "thai chili", "bird's eye chilli" → "Thai Chilli"
- "thai ginger", "galangal", "galangan" → "Thai Ginger / Galangal"
- "thyme" → "Thyme Fresh"
- "cherry tomato", "cherry tomatoes", "tomato cherry", "cherry tom", "cherry toms" → "Tomato Cherry"
- "zucchini" with no color specified, or "green zucchini", "zucchini green" → "Green Zucchini"
- "yellow zucchini" → "Yellow Zucchini"
- "garlic", "peeled garlic" → "Peeled Garlic"
- "sweet corn", "frozen corn", "corn" → "Sweet Corn Frozen"
- "green peas", "frozen peas", "peas" → "Green Peas Frozen"
- "rocket", "arugula", "rocket lettuce" → "Arugula / Rocket Lettuce"
- "asparagus" → "Asparagus Imported"
- "kale", "american kale" → "American Kale"

STRICT MATCHING RULE — you are NOT allowed to invent new item names, and you are NOT allowed to guess a different known item when unsure:
1. If the text/handwriting you see clearly and confidently refers to one of the KNOWN ITEMS (a typo, abbreviation, plural, or listed synonym above) → use that exact known name.
2. If it does NOT confidently match any known item (unclear handwriting, an item you don't recognize, or genuinely ambiguous text) → do NOT pick any known item name, and do NOT make up a new vegetable name either. Instead, set "name" to your best transcription of the raw text you actually saw, and add a flag in notes like: "⚠️ Please verify: could not confidently match item '<raw text>' to inventory."
3. Never default to a fixed fallback item just because you are unsure — always either match confidently or flag and keep the raw text. A wrong specific match is worse than flagging it for human review.

UNITS — be strict, these are NOT interchangeable:
- "kg", "kgs", "kilo" → "kg"
- "g", "gm", "gms", "grams" → "grams" (NEVER convert to kg automatically — keep the number and unit exactly as written)
- "pc", "pcs", "piece", "pieces", "nos" → "pcs"
- "bunch", "bunches" → "bunches"
- "box", "boxes" → "boxes"
- "crate", "crates" → "crates"
- "pkt", "packet", "packets", "punnet" → "pkt"
- If no unit is given for a vegetable, assume its usual unit: Baby Spinach, Edible Flower, and Radish Microgreens default to "pkt"; everything else defaults to "kg".
- CUSTOMER NAME RULE: If the image/handwriting contains "#xyz" at the start or anywhere prominent, the customer name is "xyz" (strip the # — do NOT include it in the customer field).
- BELL PEPPER MIX RULE: If you see "bellpepper 6+6" or "bell pepper 6+6" or "bellpepper mix" with no specific colour, create ONE item: name="Bell Pepper Mix", qty=12 (sum of both), display_qty="(6+6)". If only ONE colour is specified use "Bell Pepper Red" or "Bell Pepper Yellow". If both colours are listed separately, create them as separate items.
- ZUCCHINI MIX RULE: If you see "zucchini 4+4" or "zucchini mix" with no colour, create ONE item: name="Zucchini Mix", qty=8, display_qty="(4+4)". Green zucchini alone → "Green Zucchini". Yellow alone → "Yellow Zucchini".
- QUANTITY NOTATION: customers sometimes write split quantities like "5+5" or "2+3" meaning multiple bags/batches to sum together. Add them up: "5+5" → qty 10. If genuinely unclear what's being summed, make your best total and flag it in notes.

DATES: today=${today()}, tomorrow=${tomorrow()}. "tomorrow morning"/"tom morning" → deliveryDate=tomorrow, note "morning delivery" in notes. Plain weekday names (e.g. "Friday") → leave deliveryDate empty and put the day name in notes instead of guessing the wrong date.

IMPORTANT — never refuse and never return an empty result. Always extract your single best-guess interpretation of every item, quantity, and detail you can see, even if the image is blurry, low quality, or handwriting is messy. Do your best with partial or unclear information rather than skipping it.
If something is genuinely too unclear to read with confidence (a smudged number, an illegible word), still make your best guess for the JSON field, and additionally add a short flag in "notes" like: "⚠️ Please verify: quantity for Broccoli was unclear, guessed 5kg." Stack multiple flags in notes with line breaks if needed. The order must always come through — flags are just a heads-up for the person reviewing, not a reason to leave fields blank.

Return ONLY this JSON shape, no markdown, no commentary:
{"customer":"","business":"","phone":"","deliveryDate":"YYYY-MM-DD or empty string","deliveryLocation":"","notes":"","items":[{"name":"","qty":0,"unit":"kg","display_qty":""}]}
display_qty: only set when original order uses split notation like "6+6" — e.g. display_qty="(6+6)". Leave blank otherwise.`;
}

module.exports.config = {
  api: { bodyParser: { sizeLimit: "8mb" } },
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY not configured on the server");
      res.status(500).json({ error: "AI parsing is not configured on the server" });
      return;
    }

    const { mode, message, imageBase64 } = req.body || {};
    let content;
    if (mode === "image") {
      if (!imageBase64) {
        res.status(400).json({ error: "Missing imageBase64" });
        return;
      }
      content = [
        { type: "text", text: imagePrompt() },
        { type: "image_url", image_url: { url: imageBase64 } },
      ];
    } else {
      if (!message) {
        res.status(400).json({ error: "Missing message" });
        return;
      }
      content = textPrompt(message);
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
      }),
    });
    const d = await r.json();
    if (d.error) {
      console.error("OpenAI API error:", d.error);
      res.status(502).json({ error: d.error.message });
      return;
    }

    const parsed = JSON.parse(d.choices?.[0]?.message?.content || "{}");
    res.status(200).json({ data: parsed });
  } catch (err) {
    console.error("parse-order error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

import { useState, useEffect, useRef, useCallback } from "react";

const INITIAL_INVENTORY = {
  "Broccoli": { qty: 120, unit: "kg" },
  "Iceberg Lettuce": { qty: 250, unit: "pcs" },
  "Zucchini": { qty: 80, unit: "kg" },
  "Asparagus": { qty: 40, unit: "kg" },
  "Bok Choy": { qty: 60, unit: "kg" },
  "Kale": { qty: 70, unit: "kg" },
  "Cherry Tomatoes": { qty: 80, unit: "kg" },
  "Red Bell Pepper": { qty: 90, unit: "kg" },
  "Yellow Bell Pepper": { qty: 75, unit: "kg" },
  "Green Bell Pepper": { qty: 85, unit: "kg" },
  "Parsley": { qty: 120, unit: "bunches" },
  "Celery": { qty: 95, unit: "kg" },
  "Spinach": { qty: 50, unit: "kg" },
  "Cucumber": { qty: 110, unit: "kg" },
  "Capsicum": { qty: 60, unit: "kg" },
};

const PRICES = {
  "Broccoli": 180, "Iceberg Lettuce": 45, "Zucchini": 120, "Asparagus": 350,
  "Bok Choy": 140, "Kale": 160, "Cherry Tomatoes": 200, "Red Bell Pepper": 150,
  "Yellow Bell Pepper": 160, "Green Bell Pepper": 130, "Parsley": 30,
  "Celery": 90, "Spinach": 100, "Cucumber": 60, "Capsicum": 140,
};

const STATUS_CONFIG = {
  "New Order": { color: "#1a6b3c", bg: "#e8f5ec", dot: "#2d9e5a" },
  "Picking": { color: "#7a5200", bg: "#fff8e1", dot: "#f0a500" },
  "Packing": { color: "#1a4480", bg: "#e8f0fb", dot: "#3572e3" },
  "Ready for Dispatch": { color: "#5c1a7a", bg: "#f5e8ff", dot: "#9933cc" },
  "Dispatched": { color: "#0d5c7a", bg: "#e0f4fa", dot: "#0ea5c9" },
  "Delivered": { color: "#155724", bg: "#d4edda", dot: "#28a745" },
};

const STATUS_FLOW = Object.keys(STATUS_CONFIG);

const SAMPLE_ORDERS = [
  {
    id: "PK-1001", customer: "Green Basket Store", business: "Green Basket Pvt Ltd",
    phone: "+91 98765 43210", orderDate: "2025-01-15", deliveryDate: "2025-01-16",
    deliveryLocation: "Shop 12, Crawford Market, Mumbai",
    items: [
      { name: "Broccoli", qty: 5, unit: "kg" },
      { name: "Iceberg Lettuce", qty: 10, unit: "pcs" },
      { name: "Red Bell Pepper", qty: 3, unit: "kg" },
      { name: "Cherry Tomatoes", qty: 2, unit: "kg" },
    ],
    notes: "Deliver before 8 AM", status: "Packing",
    rawMessage: "Broccoli 5 kg, Iceberg Lettuce 10 pcs, Red Bell Pepper 3 kg, Cherry Tomatoes 2 kg. Delivery tomorrow morning.",
  },
  {
    id: "PK-1002", customer: "Fresh Mart", business: "Fresh Mart Superstore",
    phone: "+91 87654 32109", orderDate: "2025-01-15", deliveryDate: "2025-01-16",
    deliveryLocation: "Plot 45, Andheri West, Mumbai",
    items: [
      { name: "Parsley", qty: 15, unit: "bunches" },
      { name: "Cherry Tomatoes", qty: 8, unit: "kg" },
      { name: "Yellow Bell Pepper", qty: 10, unit: "kg" },
    ],
    notes: "Cold storage packaging required",
    status: "New Order",
    rawMessage: "Need 15 bunches parsley, 8 kg cherry tomatoes, and 10 kg yellow bell peppers.",
  },
  {
    id: "PK-1003", customer: "Chef Ramesh", business: "",
    phone: "+91 76543 21098", orderDate: "2025-01-15", deliveryDate: "2025-01-17",
    deliveryLocation: "Hotel Oberoi, Nariman Point, Mumbai",
    items: [
      { name: "Asparagus", qty: 3, unit: "kg" },
      { name: "Zucchini", qty: 5, unit: "kg" },
      { name: "Bok Choy", qty: 4, unit: "kg" },
      { name: "Kale", qty: 2, unit: "kg" },
    ],
    notes: "Premium quality, no blemishes",
    status: "Ready for Dispatch",
    rawMessage: "3kg asparagus, 5kg zucchini, 4kg bok choy, 2kg kale for Friday.",
  },
];

function genId() {
  return "PK-" + (1004 + Math.floor(Math.random() * 1000));
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

async function parseOrderWithAI(message) {
  const apiKey = process.env.REACT_APP_GEMINI_KEY;
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

For delivery dates: "tomorrow" = ${tomorrow()}, "today" = ${today()}, "morning" means note it as early delivery.
Normalize vegetable names to match the known list. Default unit is "kg" if not specified.

WhatsApp message to parse:
"${message}"`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  );

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["New Order"];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: cfg.bg, color: cfg.color,
      padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

function OrderCard({ order, onView, onUpdateStatus, onPrint }) {
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1];
  const total = order.items.reduce((s, i) => s + (PRICES[i.name] || 0) * i.qty, 0);

  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "1px solid var(--color-border-tertiary)",
      borderRadius: 12, padding: "16px 18px",
      cursor: "pointer", transition: "box-shadow 0.15s",
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>{order.id}</span>
            <StatusBadge status={order.status} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3, color: "var(--color-text-primary)" }}>{order.customer}</div>
          {order.business && <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{order.business}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a6b3c" }}>₹{total.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>est. value</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
        <span>📅 Delivery: <strong>{order.deliveryDate}</strong></span>
        <span>📦 {order.items.length} items</span>
        {order.phone && <span>📱 {order.phone}</span>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
        {order.items.map((it, i) => (
          <span key={i} style={{
            background: "var(--color-background-secondary)", fontSize: 11,
            padding: "2px 8px", borderRadius: 4, color: "var(--color-text-secondary)",
          }}>
            {it.name} · {it.qty} {it.unit}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--color-border-tertiary)", paddingTop: 10 }}>
        <button onClick={() => onView(order)} style={{ flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 6, border: "1px solid var(--color-border-tertiary)", background: "transparent", cursor: "pointer", color: "var(--color-text-primary)" }}>
          View Details
        </button>
        {nextStatus && (
          <button onClick={() => onUpdateStatus(order.id, nextStatus)} style={{
            flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 6,
            border: "none", background: "#1a6b3c", color: "#fff", cursor: "pointer", fontWeight: 500,
          }}>
            → {nextStatus}
          </button>
        )}
        <button onClick={() => onPrint(order)} style={{
          padding: "6px 12px", fontSize: 12, borderRadius: 6,
          border: "1px solid var(--color-border-tertiary)", background: "transparent",
          cursor: "pointer", color: "var(--color-text-secondary)",
        }}>
          🖨️
        </button>
      </div>
    </div>
  );
}

function PackingSlipModal({ order, onClose }) {
  const total = order.items.reduce((s, i) => s + (PRICES[i.name] || 0) * i.qty, 0);
  const tax = Math.round(total * 0.05);

  const printSlip = () => {
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><title>Packing Slip ${order.id}</title>
      <style>
        body { font-family: 'Courier New', monospace; max-width: 380px; margin: 0 auto; padding: 20px; font-size: 13px; }
        .center { text-align: center; }
        .title { font-size: 18px; font-weight: bold; }
        hr { border: 1px dashed #000; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 3px 0; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .qr { width: 80px; height: 80px; border: 2px solid #000; display: flex; align-items: center; justify-content: center; margin: 10px auto; font-size: 10px; text-align: center; }
        @media print { button { display: none; } }
      </style></head><body>
      <div class="center">
        <div class="title">🥦 VeggieFlow</div>
        <div>Exotic Vegetables – Mumbai</div>
        <div>GSTIN: 27AABCV1234D1Z5</div>
      </div>
      <hr/>
      <div class="bold">PACKING SLIP</div>
      <table>
        <tr><td>Ticket #</td><td class="right">${order.id}</td></tr>
        <tr><td>Date</td><td class="right">${order.orderDate}</td></tr>
        <tr><td>Delivery</td><td class="right">${order.deliveryDate}</td></tr>
        <tr><td>Customer</td><td class="right">${order.customer}</td></tr>
        ${order.business ? `<tr><td>Business</td><td class="right">${order.business}</td></tr>` : ""}
        ${order.phone ? `<tr><td>Phone</td><td class="right">${order.phone}</td></tr>` : ""}
      </table>
      <hr/>
      <div class="bold">Delivery Address:</div>
      <div>${order.deliveryLocation || "–"}</div>
      <hr/>
      <table>
        <tr><td class="bold">Item</td><td class="bold right">Qty</td><td class="bold right">Rate</td><td class="bold right">Amt</td></tr>
        <tr><td colspan="4"><hr/></td></tr>
        ${order.items.map(it => `
          <tr>
            <td>${it.name}</td>
            <td class="right">${it.qty} ${it.unit}</td>
            <td class="right">₹${PRICES[it.name] || 0}</td>
            <td class="right">₹${((PRICES[it.name] || 0) * it.qty).toLocaleString()}</td>
          </tr>`).join("")}
        <tr><td colspan="4"><hr/></td></tr>
        <tr><td colspan="3">Subtotal</td><td class="right">₹${total.toLocaleString()}</td></tr>
        <tr><td colspan="3">GST (5%)</td><td class="right">₹${tax.toLocaleString()}</td></tr>
        <tr><td colspan="3" class="bold">Grand Total</td><td class="right bold">₹${(total + tax).toLocaleString()}</td></tr>
      </table>
      <hr/>
      ${order.notes ? `<div><b>Notes:</b> ${order.notes}</div><hr/>` : ""}
      <div class="center">
        <div class="qr">[QR: ${order.id}]</div>
        <div>Scan for tracking</div>
        <div style="margin-top:10px;">Status: ${order.status}</div>
        <div style="margin-top:8px; font-size:11px;">Thank you for your business!</div>
      </div>
      <button onclick="window.print()">Print</button>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: "var(--color-background-primary)", borderRadius: 16,
        padding: 24, width: 480, maxHeight: "85vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--color-text-primary)" }}>Packing Slip</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{order.id}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>

        <div style={{ background: "#f0f7f2", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-text-primary)" }}>{order.customer}</div>
          {order.business && <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{order.business}</div>}
          {order.phone && <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{order.phone}</div>}
          <div style={{ fontSize: 13, marginTop: 4, color: "var(--color-text-secondary)" }}>📍 {order.deliveryLocation || "–"}</div>
          <div style={{ fontSize: 13, marginTop: 2, color: "var(--color-text-secondary)" }}>📅 Delivery: {order.deliveryDate}</div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Item</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Qty</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Rate</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--color-border-tertiary)" }}>
                <td style={{ padding: "8px 10px" }}>{it.name}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{it.qty} {it.unit}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>₹{PRICES[it.name] || 0}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>₹{((PRICES[it.name] || 0) * it.qty).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--color-border-tertiary)" }}>
              <td colSpan={3} style={{ padding: "8px 10px", color: "var(--color-text-secondary)" }}>Subtotal</td>
              <td style={{ padding: "8px 10px", textAlign: "right" }}>₹{total.toLocaleString()}</td>
            </tr>
            <tr>
              <td colSpan={3} style={{ padding: "4px 10px", color: "var(--color-text-secondary)" }}>GST (5%)</td>
              <td style={{ padding: "4px 10px", textAlign: "right" }}>₹{tax.toLocaleString()}</td>
            </tr>
            <tr style={{ background: "#f0f7f2" }}>
              <td colSpan={3} style={{ padding: "10px", fontWeight: 700, fontSize: 15 }}>Grand Total</td>
              <td style={{ padding: "10px", textAlign: "right", fontWeight: 700, fontSize: 15, color: "#1a6b3c" }}>₹{(total + tax).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>

        {order.notes && (
          <div style={{ background: "#fff8e1", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 14, color: "#7a5200" }}>
            📝 {order.notes}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={printSlip} style={{
            flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
            background: "#1a6b3c", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14,
          }}>
            🖨️ Print Slip & Invoice
          </button>
          <button onClick={onClose} style={{
            padding: "10px 20px", borderRadius: 8,
            border: "1px solid var(--color-border-tertiary)", background: "transparent",
            cursor: "pointer", fontSize: 14, color: "var(--color-text-secondary)",
          }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function WhatsAppPanel({ onOrderCreated }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [editableOrder, setEditableOrder] = useState(null);

  const EXAMPLES = [
    "Send 10 kg broccoli, 5 kg zucchini and 20 lettuce tomorrow morning.",
    "Need 15 bunches parsley, 8 kg cherry tomatoes, and 10 kg yellow bell peppers. Customer: Fresh Mart, delivery to Andheri West.",
    "Order from Chef Ramesh, Hotel Oberoi: 3kg asparagus, 5kg zucchini, 4kg bok choy, 2kg kale for Friday. No bruising please.",
  ];

  async function handleParse() {
    if (!message.trim()) return;
    setLoading(true);
    setError("");
    setParsed(null);
    try {
      const result = await parseOrderWithAI(message);
      setParsed(result);
      setEditableOrder({
        ...result,
        id: genId(),
        orderDate: today(),
        deliveryDate: result.deliveryDate || tomorrow(),
        status: "New Order",
        rawMessage: message,
      });
    } catch (e) {
      setError("Failed to parse order. Please check the message format.");
    }
    setLoading(false);
  }

  function confirmOrder() {
    if (!editableOrder) return;
    onOrderCreated(editableOrder);
    setMessage("");
    setParsed(null);
    setEditableOrder(null);
  }

  return (
    <div style={{ display: "flex", gap: 20, height: "100%" }}>
      <div style={{ flex: 1 }}>
        <div style={{
          background: "#075e54", borderRadius: "12px 12px 0 0",
          padding: "14px 18px", display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: "#25d366",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🥦</div>
          <div>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>VeggieFlow Bot</div>
            <div style={{ color: "#c8e6c9", fontSize: 11 }}>● Online · Order Processing</div>
          </div>
        </div>

        <div style={{
          background: "#e5ddd5", padding: 16, minHeight: 200,
          borderRadius: "0 0 0 0", border: "1px solid #ccc", borderTop: "none",
        }}>
          {EXAMPLES.map((ex, i) => (
            <div key={i} style={{
              background: "#fff", borderRadius: "0 8px 8px 8px",
              padding: "8px 12px", marginBottom: 8, fontSize: 13,
              maxWidth: "80%", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            }} onClick={() => setMessage(ex)}>
              {ex}
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 3, textAlign: "right" }}>Tap to use</div>
            </div>
          ))}

          {loading && (
            <div style={{ textAlign: "center", padding: 20, color: "#666" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
              <div>AI is processing the order...</div>
            </div>
          )}

          {error && (
            <div style={{ background: "#ffebee", borderRadius: 8, padding: "10px 14px", color: "#c62828", fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        <div style={{
          background: "#f0f0f0", padding: 10,
          borderRadius: "0 0 12px 12px", display: "flex", gap: 8,
          border: "1px solid #ccc", borderTop: "none",
        }}>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Paste or type a WhatsApp order message..."
            rows={3}
            style={{
              flex: 1, borderRadius: 20, border: "none", padding: "8px 14px",
              fontSize: 13, resize: "none", outline: "none", background: "#fff",
            }}
          />
          <button onClick={handleParse} disabled={loading || !message.trim()} style={{
            background: "#25d366", border: "none", borderRadius: "50%",
            width: 44, height: 44, cursor: "pointer", fontSize: 20,
            alignSelf: "flex-end", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {loading ? "⏳" : "→"}
          </button>
        </div>
      </div>

      {editableOrder && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, color: "var(--color-text-primary)" }}>
            ✅ Order Extracted — Review & Confirm
          </div>

          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
            {[
              ["Customer", "customer"], ["Business", "business"],
              ["Phone", "phone"], ["Delivery Date", "deliveryDate"],
              ["Location", "deliveryLocation"], ["Notes", "notes"],
            ].map(([label, key]) => (
              <div key={key}>
                <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>{label}</label>
                <input
                  value={editableOrder[key] || ""}
                  onChange={e => setEditableOrder({ ...editableOrder, [key]: e.target.value })}
                  style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border-tertiary)", fontSize: 13, boxSizing: "border-box", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                />
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Items:</div>
          {editableOrder.items?.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13, flex: 2, color: "var(--color-text-primary)" }}>{it.name}</span>
              <input
                type="number"
                value={it.qty}
                onChange={e => {
                  const items = [...editableOrder.items];
                  items[i] = { ...it, qty: parseFloat(e.target.value) };
                  setEditableOrder({ ...editableOrder, items });
                }}
                style={{ width: 60, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
              />
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{it.unit}</span>
            </div>
          ))}

          <button onClick={confirmOrder} style={{
            width: "100%", marginTop: 14, padding: "12px 0",
            background: "#1a6b3c", color: "#fff", border: "none",
            borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}>
            ✓ Create Order Ticket
          </button>
        </div>
      )}
    </div>
  );
}

function Dashboard({ orders, onUpdateStatus, onView, onPrint }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortBy, setSortBy] = useState("deliveryDate");

  const filtered = orders
    .filter(o => {
      const q = search.toLowerCase();
      const matchSearch = !q || o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q);
      const matchStatus = filterStatus === "All" || o.status === filterStatus;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === "deliveryDate") return a.deliveryDate.localeCompare(b.deliveryDate);
      if (sortBy === "customer") return a.customer.localeCompare(b.customer);
      return b.id.localeCompare(a.id);
    });

  const countByStatus = STATUS_FLOW.reduce((acc, s) => {
    acc[s] = orders.filter(o => o.status === s).length;
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          ["Total Orders", orders.length, "#1a6b3c"],
          ["Pending Packing", (countByStatus["New Order"] || 0) + (countByStatus["Picking"] || 0), "#f0a500"],
          ["Ready to Dispatch", countByStatus["Ready for Dispatch"] || 0, "#3572e3"],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: "var(--color-background-secondary)",
            borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by order ID or customer..."
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
          <option value="All">All Status</option>
          {STATUS_FLOW.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
          <option value="deliveryDate">Sort: Delivery Date</option>
          <option value="customer">Sort: Customer</option>
          <option value="id">Sort: Order ID</option>
        </select>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)" }}>
            No orders found.
          </div>
        ) : (
          filtered.map(o => (
            <OrderCard key={o.id} order={o} onView={onView} onUpdateStatus={onUpdateStatus} onPrint={onPrint} />
          ))
        )}
      </div>
    </div>
  );
}

function InventoryPanel({ orders }) {
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);

  const used = {};
  orders.filter(o => ["Packing", "Ready for Dispatch", "Dispatched", "Delivered"].includes(o.status))
    .forEach(o => o.items.forEach(it => {
      used[it.name] = (used[it.name] || 0) + it.qty;
    }));

  const LOW_THRESHOLD = 20;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: "var(--color-text-primary)" }}>Stock Levels</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          Auto-updates when orders are packed. Low stock alerts shown in red.
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {Object.entries(inventory).map(([name, { qty, unit }]) => {
          const u = used[name] || 0;
          const remaining = Math.max(0, qty - u);
          const pct = Math.round((remaining / qty) * 100);
          const isLow = remaining < LOW_THRESHOLD;
          const price = PRICES[name] || 0;

          return (
            <div key={name} style={{
              background: "var(--color-background-primary)",
              border: `1px solid ${isLow ? "#ffcdd2" : "var(--color-border-tertiary)"}`,
              borderRadius: 10, padding: "12px 14px",
              background: isLow ? "#fff5f5" : "var(--color-background-primary)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: "var(--color-text-primary)" }}>
                  {isLow && "⚠️ "}{name}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--color-text-secondary)" }}>
                  <span style={{ color: isLow ? "#c62828" : "inherit" }}>{remaining} {unit} left</span>
                  <span>Used: {u} {unit}</span>
                  <span>₹{price}/{unit}</span>
                </div>
              </div>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: isLow ? "#ef5350" : pct > 60 ? "#2d9e5a" : "#f0a500",
                  borderRadius: 4, transition: "width 0.3s",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderDetailModal({ order, onClose, onUpdateStatus, onPrint }) {
  if (!order) return null;
  const total = order.items.reduce((s, i) => s + (PRICES[i.name] || 0) * i.qty, 0);
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
    }} onClick={onClose}>
      <div style={{
        background: "var(--color-background-primary)", borderRadius: 16,
        padding: 24, width: 540, maxHeight: "85vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--color-text-primary)" }}>{order.id}</div>
            <StatusBadge status={order.status} />
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            ["Customer", order.customer],
            ["Business", order.business || "–"],
            ["Phone", order.phone || "–"],
            ["Order Date", order.orderDate],
            ["Delivery Date", order.deliveryDate],
            ["Location", order.deliveryLocation || "–"],
          ].map(([k, v]) => (
            <div key={k} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{v}</div>
            </div>
          ))}
        </div>

        {order.rawMessage && (
          <div style={{ background: "#e5ddd5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#333" }}>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Original WhatsApp Message:</div>
            "{order.rawMessage}"
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: "var(--color-text-primary)" }}>Order Items</div>
          {order.items.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-border-tertiary)", fontSize: 13 }}>
              <span style={{ color: "var(--color-text-primary)" }}>{it.name}</span>
              <span style={{ color: "var(--color-text-secondary)" }}>{it.qty} {it.unit}</span>
              <span style={{ color: "var(--color-text-secondary)" }}>₹{(PRICES[it.name] || 0) * it.qty}</span>
            </div>
          ))}
          <div style={{ textAlign: "right", fontWeight: 700, fontSize: 15, marginTop: 8, color: "#1a6b3c" }}>
            Total: ₹{total.toLocaleString()}
          </div>
        </div>

        {order.notes && (
          <div style={{ background: "#fff8e1", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 14, color: "#7a5200" }}>
            📝 {order.notes}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {nextStatus && (
            <button onClick={() => { onUpdateStatus(order.id, nextStatus); onClose(); }} style={{
              flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
              background: "#1a6b3c", color: "#fff", fontWeight: 600, cursor: "pointer",
            }}>
              → Move to {nextStatus}
            </button>
          )}
          <button onClick={() => onPrint(order)} style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            border: "1px solid var(--color-border-tertiary)", background: "transparent",
            cursor: "pointer", fontSize: 13, color: "var(--color-text-primary)",
          }}>
            🖨️ Print Slip
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [orders, setOrders] = useState(SAMPLE_ORDERS);
  const [tab, setTab] = useState("whatsapp");
  const [viewOrder, setViewOrder] = useState(null);
  const [printOrder, setPrintOrder] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleOrderCreated(order) {
    setOrders(prev => [order, ...prev]);
    showToast(`Order ${order.id} created for ${order.customer}`);
    setTab("dashboard");
  }

  function handleUpdateStatus(id, newStatus) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    showToast(`Order moved to "${newStatus}"`);
    if (viewOrder?.id === id) setViewOrder(prev => ({ ...prev, status: newStatus }));
  }

  const TABS = [
    { id: "whatsapp", label: "📱 Order Intake", icon: "📱" },
    { id: "dashboard", label: "📋 Dashboard", icon: "📋" },
    { id: "inventory", label: "📦 Inventory", icon: "📦" },
  ];

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", minHeight: "100vh", background: "var(--color-background-tertiary)" }}>
      <div style={{
        background: "var(--color-background-primary)",
        borderBottom: "1px solid var(--color-border-tertiary)",
        padding: "0 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 0" }}>
          <div style={{ fontSize: 28 }}>🥦</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--color-text-primary)" }}>VeggieFlow</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Exotic Vegetable Order Management</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: tab === t.id ? "#1a6b3c" : "transparent",
              color: tab === t.id ? "#fff" : "var(--color-text-secondary)",
              cursor: "pointer", fontWeight: tab === t.id ? 600 : 400, fontSize: 13,
              transition: "all 0.15s",
            }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {orders.length} orders · {orders.filter(o => o.status === "New Order").length} new
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        {tab === "whatsapp" && <WhatsAppPanel onOrderCreated={handleOrderCreated} />}
        {tab === "dashboard" && (
          <Dashboard
            orders={orders}
            onUpdateStatus={handleUpdateStatus}
            onView={setViewOrder}
            onPrint={setPrintOrder}
          />
        )}
        {tab === "inventory" && <InventoryPanel orders={orders} />}
      </div>

      {viewOrder && (
        <OrderDetailModal
          order={viewOrder}
          onClose={() => setViewOrder(null)}
          onUpdateStatus={handleUpdateStatus}
          onPrint={setPrintOrder}
        />
      )}

      {printOrder && (
        <PackingSlipModal order={printOrder} onClose={() => setPrintOrder(null)} />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.type === "success" ? "#1a6b3c" : "#c62828",
          color: "#fff", padding: "12px 20px", borderRadius: 10,
          fontSize: 14, fontWeight: 500, boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
          animation: "fadeIn 0.2s ease",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

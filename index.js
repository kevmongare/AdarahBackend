// index.js
import dotenv from "dotenv";
dotenv.config(); // must be first

import express from "express";
import cors from "cors";
import { OpenAI } from "openai";
import { pool } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// === Emergency red flags ===
const redFlags = [
    "bleeding",
    "convulsions",
    "baby not moving",
    "difficulty breathing"
];

// === Initialize Hugging Face OpenAI-compatible client ===
const client = new OpenAI({
    apiKey: process.env.HF_API_KEY,
    baseURL: "https://router.huggingface.co/v1"
});

// === CHAT ENDPOINT ===
app.post("/api/chat", async (req, res) => {
    const { message } = req.body || {};

    // ✅ Guard if message missing
    if (!message || typeof message !== "string") {
        return res.status(400).json({
            urgency: "Error",
            advice: "Invalid message.",
            disclaimer: ""
        });
    }

    // 1️⃣ Emergency detection
    const isEmergency = redFlags.some(flag =>
        message.toLowerCase().includes(flag)
    );

    if (isEmergency) {
        return res.json({
            urgency: "Emergency",
            advice: "Please go to nearest hospital immediately.",
            disclaimer: "This AI does not replace medical care."
        });
    }

    try {
        // 2️⃣ Call HF Mistral via OpenAI-compatible API
        const chatCompletion = await client.chat.completions.create({
            model: "mistralai/Mistral-7B-Instruct-v0.2",
            messages: [
                {
                    role: "user",
                    content: `
You are Adarah, a maternal health AI.

Classify urgency as:
Normal / Monitor / Emergency

Respond ONLY in strict JSON.
Do NOT use markdown.
Do NOT use triple quotes.
Return plain text inside strings.

{
  "urgency": "",
  "advice": "",
  "disclaimer": ""
}

User: ${message}
`
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        // 3️⃣ Extract AI response safely
        // 3️⃣ Extract AI response safely
        let parsed = {
            urgency: "Error",
            advice: "System error.",
            disclaimer: ""
        };

        try {
            let rawText =
                chatCompletion?.choices?.[0]?.message?.content;

            if (!rawText) throw new Error("Empty AI response");

            // 🔥 Remove BOM / invisible unicode characters
            rawText = rawText.replace(/^\uFEFF/, "");

            // 🔥 Remove ALL non-printable control characters
            rawText = rawText.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

            rawText = rawText.trim();

            // 🔥 Remove markdown fences if present
            rawText = rawText.replace(/```json/gi, "");
            rawText = rawText.replace(/```/g, "");
            rawText = rawText.trim();

            // 🔥 Extract strict JSON block
            const firstBrace = rawText.indexOf("{");
            const lastBrace = rawText.lastIndexOf("}");

            if (firstBrace === -1 || lastBrace === -1) {
                throw new Error("No JSON braces found");
            }

            let jsonString = rawText.slice(firstBrace, lastBrace + 1);

            parsed = JSON.parse(jsonString);

        } catch (err) {
            console.error("JSON parse error:", err.message);
            console.log(
                "Raw AI output:",
                chatCompletion?.choices?.[0]?.message?.content
            );
        }

        // 4️⃣ Save conversation to DB
        try {
            await pool.query(
                "INSERT INTO conversations (user_message, ai_response, urgency) VALUES ($1, $2, $3)",
                [message, parsed.advice || "", parsed.urgency || "Unknown"]
            );
        } catch (dbErr) {
            console.error("DB Insert Error:", dbErr.message);
        }

        // 5️⃣ Return AI response
        return res.json(parsed);

    } catch (err) {
        console.error("AI Error:", err.message);
        return res.status(500).json({
            urgency: "Error",
            advice: "System error.",
            disclaimer: ""
        });
    }
});

// === GET FEEDBACK ENDPOINT ===
app.get("/api/feedback", async (req, res) => {
    try {
        // 1️⃣ Query all feedback from the database
        const result = await pool.query(
            "SELECT * FROM feedback ORDER BY created_at DESC"
        );

        // 2️⃣ Return the rows as a JSON array
        return res.json(result.rows);
    } catch (err) {
        console.error("DB Fetch Error:", err.message);
        return res.status(500).json({
            status: "error",
            message: "Failed to fetch feedback."
        });
    }
});
// === FEEDBACK ENDPOINT ===
app.post("/api/feedback", async (req, res) => {
    const { response, helpful, extra } = req.body || {};

    if (typeof helpful !== "boolean") {
        return res.status(400).json({ status: "error", message: "Invalid helpful value" });
    }

    try {
        await pool.query(
            "INSERT INTO feedback (ai_response, helpful, extra_feedback) VALUES ($1, $2, $3)",
            [JSON.stringify(response || {}), helpful, extra || null]
        );
        res.json({ status: "saved" });
    } catch (err) {
        console.error("DB Feedback Error:", err.message);
        res.status(500).json({ status: "error" });
    }
});
// === START SERVER ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

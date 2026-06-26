import { GoogleGenerativeAI } from "@google/generative-ai";

// ✅ Correctly read API key from Vite env
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// ✅ Fallback if AI fails — app never crashes
const fallbackResponse = {
    confidenceScore: 60,
    riskLevel: "Moderate",
    riskReason: "FlowMind AI is currently running on baseline fallback parameters.",
    agentMessage: "I've structured a fallback execution plan for you. Check your urgent timeline blocks and start today!",
    todayPlan: [
        "Review primary milestone documentation",
        "Solve pending homework equations"
    ],
    upcomingTasks: [
        "Deloitte Revision exercises",
        "AQI testing suite configuration"
    ],
    deadlineAnalysis: {
        mostUrgentTask: "Homework Submission",
        daysRemaining: 1
    },
    recommendedFocus: "Complete basic deliverables first",
    estimatedHoursNeeded: 6,
    strictlyDoToday: ["Homework Submission"],
    postponeTomorrow: ["AQI Testing"],
    dropCancel: ["Extra secondary readings"]
};

/**
 * Generates an AI productivity plan using Gemini 2.5 Flash.
 * Uses responseSchema for crash-proof structured JSON output.
 * @param {string} promptUserContext - Tasks typed by the user
 * @returns {Promise<Object>} Structured JSON response
 */
export async function generatePlan(promptUserContext) {

    // Guard: if key missing, return fallback
    if (!GEMINI_API_KEY) {
        console.warn("WARN: VITE_GEMINI_API_KEY is missing. Using fallback.");
        return fallbackResponse;
    }

    try {
        // ✅ Correct SDK initialization
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

        // ✅ Strict JSON schema — Gemini will NEVER return markdown
        const responseSchema = {
            type: "OBJECT",
            properties: {
                confidenceScore: { type: "INTEGER" },
                riskLevel: { type: "STRING" },
                riskReason: { type: "STRING" },
                agentMessage: { type: "STRING" },
                todayPlan: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                },
                upcomingTasks: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                },
                deadlineAnalysis: {
                    type: "OBJECT",
                    properties: {
                        mostUrgentTask: { type: "STRING" },
                        daysRemaining: { type: "INTEGER" }
                    },
                    required: ["mostUrgentTask", "daysRemaining"]
                },
                recommendedFocus: { type: "STRING" },
                estimatedHoursNeeded: { type: "INTEGER" },
                strictlyDoToday: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                },
                postponeTomorrow: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                },
                dropCancel: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                }
            },
            required: [
                "confidenceScore",
                "riskLevel",
                "riskReason",
                "agentMessage",
                "todayPlan",
                "upcomingTasks",
                "deadlineAnalysis",
                "recommendedFocus",
                "estimatedHoursNeeded",
                "strictlyDoToday",
                "postponeTomorrow",
                "dropCancel"
            ]
        };

        // ✅ Correct model setup with responseSchema
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.2
            },
            systemInstruction: `You are FlowMind, an autonomous AI Execution Coach.
You replace passive reminders with hard execution coaching.

Rules:
1. confidenceScore: 0-100. Be realistic. Penalize tight deadlines and high workload.
2. riskLevel: exactly one of "Low", "Moderate", "High"
3. agentMessage: speak directly like a coach. Be specific, not generic.
4. todayPlan: exactly what to do TODAY, in order.
5. upcomingTasks: next important tasks after today.
6. deadlineAnalysis: identify the single most urgent task.
7. strictlyDoToday: tasks that MUST happen today or deadlines will be missed.
8. postponeTomorrow: tasks safe to delay without consequences.
9. dropCancel: low-value distractions to ignore today.
10. Never leave arrays empty when inference is possible.
11. Always mention actual task names from user input.`
        });

        // ✅ Correct API call format
        const result = await model.generateContent(
            `Generate my execution plan based on this: ${promptUserContext}`
        );

        // ✅ Correct way to get text from response
        const rawText = result.response.text();

        if (!rawText) {
            throw new Error("Empty response from Gemini.");
        }

        // ✅ Parse JSON — responseSchema guarantees clean JSON, no markdown
        const parsed = JSON.parse(rawText);

        // ✅ Save to localStorage so Dashboard can read it
        localStorage.setItem("flowmind_plan", JSON.stringify(parsed));

        console.log("✅ FLOWMIND GEMINI SUCCESS:", parsed);
        return parsed;

    } catch (error) {
        console.error("❌ Gemini Error:", error);
        return fallbackResponse;
    }
}
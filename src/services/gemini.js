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

/**
 * Generates an emergency "Save My Day" execution plan using Gemini 2.5 Flash.
 * @param {number} availableHours - The hours the user has left today.
 * @param {Object} currentPlan - The current AI plan to re-evaluate.
 * @returns {Promise<Object>} Structured JSON prioritization.
 */
export async function generateSaveMyDay(availableHours, currentPlan) {
    if (!GEMINI_API_KEY) {
        console.warn("WARN: VITE_GEMINI_API_KEY is missing. Returning Save My Day fallback.");
        return {
            strictlyDoToday: [{ task: "Critical Mission Task", hours: availableHours, reason: "Fallback emergency prioritization." }],
            postponeTomorrow: [{ task: "Secondary Task", reason: "Not enough hours today." }],
            dropCancel: [{ task: "Low Impact Reading", reason: "Does not move the needle today." }],
            confidenceMessage: `You have only ${availableHours} hours today. I've locked your focus to the absolute essentials.`
        };
    }

    try {
        // ✅ Applying the same safe SDK initialization here
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

        const smdSchema = {
            type: "OBJECT",
            properties: {
                strictlyDoToday: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            task: { type: "STRING" },
                            hours: { type: "NUMBER" },
                            reason: { type: "STRING" }
                        },
                        required: ["task", "hours", "reason"]
                    }
                },
                postponeTomorrow: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            task: { type: "STRING" },
                            reason: { type: "STRING" }
                        },
                        required: ["task", "reason"]
                    }
                },
                dropCancel: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            task: { type: "STRING" },
                            reason: { type: "STRING" }
                        },
                        required: ["task", "reason"]
                    }
                },
                confidenceMessage: { type: "STRING" }
            },
            required: ["strictlyDoToday", "postponeTomorrow", "dropCancel", "confidenceMessage"]
        };

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: smdSchema,
                temperature: 0.1 // Kept low for ruthless logic
            },
            systemInstruction: `You are FlowMind's execution strategist.
            The user only has a limited number of hours today.
            Analyze every task in their current plan.
            Be ruthless. Prioritize only the highest-impact work.
            Never exceed the user's available hours for today's workload.
            Return tasks that MUST be completed today, tasks that should move to tomorrow, and tasks that should be dropped entirely.`
        });

        const result = await model.generateContent(
            `I only have ${availableHours} hours available today. Re-evaluate this plan: ${JSON.stringify(currentPlan)}`
        );

        // ✅ Using the correct extraction method here as well
        const rawText = result.response.text();

        if (!rawText) {
            throw new Error("Empty response from Save My Day model.");
        }

        const parsedData = JSON.parse(rawText.trim());
        console.log("✅ SAVE MY DAY SUCCESS:", parsedData);
        return parsedData;

    } catch (error) {
        console.error("❌ Save My Day Integration Error:", error);
        return {
            strictlyDoToday: [{ task: "Emergency Core Task", hours: availableHours, reason: "Network fallback mode active." }],
            postponeTomorrow: [{ task: "All other pending items", reason: "Postponed due to offline status." }],
            dropCancel: [],
            confidenceMessage: `Network error. Focus entirely on your most critical immediate task for the next ${availableHours} hours.`
        };
    }
}

/**
 * Evaluates progress and updates the confidence/risk metrics without regenerating the plan.
 * @param {Array<string>} completedTasks - Array of task strings completed
 * @param {Array<string>} remainingTasks - Array of task strings remaining
 * @param {Object} currentPlan - The current AI plan context
 * @returns {Promise<Object>} Structured JSON containing updated metrics
 */
export async function recalculateAnalysis(completedTasks, remainingTasks, currentPlan) {
    if (!GEMINI_API_KEY) {
        console.warn("WARN: VITE_GEMINI_API_KEY is missing. Returning Recalculate fallback.");
        return {
            confidenceScore: currentPlan?.confidenceScore || 50,
            riskLevel: currentPlan?.riskLevel || "Moderate",
            riskReason: "Fallback mode active. Unable to recalculate live risk.",
            agentMessage: "Offline mode active. Keep pushing through your remaining tasks!"
        };
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

        const analysisSchema = {
            type: "OBJECT",
            properties: {
                confidenceScore: { type: "INTEGER" },
                riskLevel: { type: "STRING" },
                riskReason: { type: "STRING" },
                agentMessage: { type: "STRING" }
            },
            required: ["confidenceScore", "riskLevel", "riskReason", "agentMessage"]
        };

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: analysisSchema,
                temperature: 0.2
            },
            systemInstruction: `You are FlowMind's AI Progress Analyst.
            Analyze:
            - completed tasks
            - remaining tasks
            - current execution plan
            
            Do NOT regenerate today's plan.
            Do NOT generate new tasks.
            Only recalculate:
            - confidenceScore
            - riskLevel
            - riskReason
            - agentMessage
            
            The confidence score should increase when important tasks are completed and decrease when high-priority work remains unfinished.`
        });

        const prompt = `
            Completed Tasks: ${JSON.stringify(completedTasks)}
            Remaining Tasks: ${JSON.stringify(remainingTasks)}
            Current Plan: ${JSON.stringify(currentPlan)}
        `;

        const result = await model.generateContent(prompt);
        const rawText = result.response.text();

        if (!rawText) {
            throw new Error("Empty response from Recalculate model.");
        }

        const parsedData = JSON.parse(rawText.trim());
        console.log("✅ RECALCULATE ANALYSIS SUCCESS:", parsedData);
        return parsedData;

    } catch (error) {
        console.error("❌ Recalculate Analysis Error:", error);
        return {
            confidenceScore: currentPlan?.confidenceScore || 50,
            riskLevel: currentPlan?.riskLevel || "Moderate",
            riskReason: "API Error: Defaulted to baseline metrics.",
            agentMessage: "There was an issue updating your analysis, but don't let it stop your progress."
        };
    }
}
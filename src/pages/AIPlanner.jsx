import { useState, useRef, useEffect } from "react";
import MainLayout from "../components/layout/MainLayout";
import { generatePlan } from "../services/gemini";
import { savePlan } from "../services/firebaseService";

// Array of steps for the AI Thinking Overlay
const THINKING_STEPS = [
    "🧠 Reading your tasks...",
    "Understanding deadlines...",
    "Calculating confidence score...",
    "Detecting scheduling risks...",
    "Prioritizing your workload...",
    "Building today's execution strategy...",
    "✨ Finalizing your AI plan..."
];

function AIPlanner() {
    // =====================================
    // FLOWMIND AI PLANNER (AI Execution Coach)
    // =====================================

    const [prompt, setPrompt] = useState("");
    const [response, setResponse] = useState(null);
    const [loading, setLoading] = useState(false);

    // AI Thinking & Success States
    const [thinkingStep, setThinkingStep] = useState(0);
    const [showSuccess, setShowSuccess] = useState(false);

    // Voice Recognition States
    const [isListening, setIsListening] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const recognitionRef = useRef(null);

    // Keep a ref of the latest prompt so the Voice Command closure always has the freshest text
    const promptRef = useRef(prompt);
    useEffect(() => {
        promptRef.current = prompt;
    }, [prompt]);

    // =====================================
    // AI THINKING TIMER (Progressive Steps)
    // =====================================
    useEffect(() => {
        let interval;
        if (loading) {
            setThinkingStep(0); 
            interval = setInterval(() => {
                setThinkingStep((prev) => 
                    prev < THINKING_STEPS.length - 1 ? prev + 1 : prev
                );
            }, 1000); 
        }
        return () => clearInterval(interval); 
    }, [loading]);

    // =====================================
    // WEB SPEECH API & VOICE COMMANDS ENGINE
    // =====================================
    const handleVoiceInput = () => {
        if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
            showToast("Voice recognition is not supported in this browser.");
            return;
        }

        if (isListening) {
            recognitionRef.current?.stop();
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();

        recognitionRef.current.continuous = false; 
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onstart = () => {
            setIsListening(true);
        };

        recognitionRef.current.onresult = (event) => {
            if (!event.results[0].isFinal) return;

            const transcript = event.results[0][0].transcript;
            const command = transcript.toLowerCase().trim();

            const clearKeywords = ["clear input", "clear", "reset", "remove everything", "empty input"];
            const generateKeywords = ["create execution plan", "generate plan", "generate", "create plan", "make plan"];

            if (clearKeywords.some(keyword => command.includes(keyword))) {
                setPrompt("");
                showToast("Input cleared.");
                recognitionRef.current?.stop();
                return;
            }

            if (generateKeywords.some(keyword => command.includes(keyword))) {
                showToast("Generating plan via voice command...");
                recognitionRef.current?.stop();
                handleGenerate(promptRef.current);
                return;
            }

            const cleanTranscript = transcript.trim();
            setPrompt((prev) => prev ? `${prev} ${cleanTranscript}` : cleanTranscript);
        };

        recognitionRef.current.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (event.error === 'not-allowed') {
                showToast("Microphone permission denied.");
            } else if (event.error === 'no-speech') {
                showToast("No speech detected. Try again.");
            }
            setIsListening(false);
        };

        recognitionRef.current.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current.start();
    };

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(""), 3000);
    };

    // =====================================
    // AI VOICE SYNTHESIS (SUCCESS RESPONSE)
    // =====================================
    const speakSummary = (planData) => {
        const synth = window.speechSynthesis;
        if (!synth) {
            console.warn("Speech Synthesis API not available");
            return;
        }

        try {
            console.log("🔊 speakSummary called with planData:", planData);
            
            // Get voices
            let voices = synth.getVoices();
            console.log(`📢 Voices available: ${voices.length}`);
            
            if (voices.length === 0) {
                console.log("⏳ No voices yet, waiting for onvoiceschanged event...");
                const voiceChangeHandler = () => {
                    console.log("✓ Voices changed, retrying speakSummary");
                    synth.onvoiceschanged = null;
                    speakSummary(planData);
                };
                synth.onvoiceschanged = voiceChangeHandler;
                return;
            }

            // Extract task text intelligently
            let taskText = "Plan ready";
            if (planData?.deadlineAnalysis?.mostUrgentTask) {
                taskText = `Start with ${planData.deadlineAnalysis.mostUrgentTask}`;
            } else if (planData?.todayPlan?.length > 0) {
                const firstTask = typeof planData.todayPlan[0] === "string" 
                    ? planData.todayPlan[0] 
                    : planData.todayPlan[0]?.title;
                if (firstTask) {
                    taskText = `Start with ${firstTask}`;
                }
            }

            const fullText = `Your execution plan is ready. ${taskText}.`;
            console.log("🎤 Speaking:", fullText);

            // Stop any ongoing speech and clear queue
            if (synth.speaking) {
                synth.cancel();
                console.log("⏹ Stopped previous speech");
            }

            const utterance = new SpeechSynthesisUtterance(fullText);
            
            // DON'T assign voice object - let browser choose default
            // This is a known fix for silent audio issue
            console.log("🎯 Using browser default voice");
            
            utterance.lang = "en-US";
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Add event listeners for debugging
            utterance.onstart = () => console.log("▶ Speech started");
            utterance.onend = () => console.log("⏹ Speech ended");
            utterance.onerror = (event) => console.error("❌ Speech error:", event.error);
            utterance.onpause = () => console.log("⏸ Speech paused");
            utterance.onresume = () => console.log("▶ Speech resumed");

            // Speak
            console.log("📢 Calling synth.speak()...");
            synth.speak(utterance);
            console.log("✅ speak() called successfully");
            
        } catch (error) {
            console.error("❌ Speech Synthesis Error:", error);
        }
    };

    // =====================================
    // AI GENERATION LOGIC
    // =====================================
    const handleGenerate = async (explicitPrompt = null) => {
        const textToProcess = typeof explicitPrompt === "string" ? explicitPrompt : prompt;
        
        if (!textToProcess.trim()) {
            console.warn("❌ Empty prompt");
            return;
        }

        console.log("🚀 handleGenerate started");

        // --- CRITICAL: AUDIO UNLOCK HACK ---
        // MUST happen SYNCHRONOUSLY in user gesture context, BEFORE any await
        if ("speechSynthesis" in window) {
            const synth = window.speechSynthesis;
            console.log("🔓 Attempting audio unlock...");
            console.log(`   - speaking: ${synth.speaking}`);
            console.log(`   - pending: ${synth.pending}`);
            
            // Stop any currently speaking utterance
            if (synth.speaking || synth.pending) {
                synth.cancel();
                console.log("   ⏹ Cancelled previous speech queue");
            }

            // Fire empty utterance with 0 volume to unlock permissions
            const unlockUtterance = new SpeechSynthesisUtterance("");
            unlockUtterance.volume = 0;
            synth.speak(unlockUtterance);
            console.log("   ✅ Unlock utterance sent (before await)");
        }
        // ----------------------------------
        
        setLoading(true);
        setShowSuccess(false);
        setResponse(null);

        try {
            console.log("📡 Calling generatePlan API...");
            const result = await generatePlan(textToProcess);
            console.log("✅ API Response received:", result);

            if (!result) {
                console.warn("⚠️ API returned null/undefined");
                setLoading(false);
                return;
            }

            setResponse(result);
            setShowSuccess(true);
            
            // Save plan to Firestore + localStorage
            await savePlan(result);
            console.log("💾 Plan saved to hybrid storage");
            
            console.log("🎵 Attempting to speak summary...");
            // Voice synthesis now works because permission was unlocked BEFORE the await
            speakSummary(result);

            setTimeout(() => {
                setShowSuccess(false);
            }, 4000);

        } catch (error) {
            console.error("❌ Generate Error:", error);
            showToast("Error generating plan. Check console for details.");
        } finally {
            setLoading(false);
        }
    };

    const getConfidenceDetails = (score) => {
        const val = Number(score) || 0;
        if (val <= 40) return { text: "Risk of missing one or more deadlines", color: "bg-red-500" };
        if (val <= 70) return { text: "Moderate chance of completing all goals on time", color: "bg-yellow-500" };
        return { text: "High chance of completing all goals on time", color: "bg-green-500" };
    };

    const getRiskBadgeStyles = (risk) => {
        const currentRisk = risk?.toLowerCase() || "";
        if (currentRisk === "low" || currentRisk === "safe") return "bg-green-500/20 text-green-400 border border-green-500/30";
        if (currentRisk === "moderate" || currentRisk === "medium") return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
        return "bg-red-500/20 text-red-400 border border-red-500/30";
    };

    const isCrisisModeActive = response && (Number(response.confidenceScore) < 40);

    return (
        <MainLayout>
            
            <style>{`
                @keyframes slideIndeterminate {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(200%); }
                }
            `}</style>

            {toastMessage && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#18181B] text-white px-6 py-3 rounded-xl shadow-xl shadow-purple-950/40 border border-purple-500 flex items-center gap-3 animate-fade-in">
                    <span className="text-sm font-bold tracking-wide text-purple-400">{toastMessage}</span>
                </div>
            )}

            {isCrisisModeActive && (
                <div className="mb-6 p-4 bg-red-900/30 border border-red-500/40 rounded-xl flex items-start gap-3 shadow-lg shadow-red-950/20 animate-pulse">
                    <span className="text-2xl mt-0.5">🚨</span>
                    <div>
                        <h4 className="text-red-400 font-bold tracking-wide uppercase text-sm">CRITICAL RISK</h4>
                        <p className="text-zinc-200 text-sm mt-1">
                            You may miss your deadline. <span className="text-red-400 font-semibold">Complete your most urgent task today.</span>
                        </p>
                    </div>
                </div>
            )}

            <h1 className="text-4xl font-bold mb-6 text-white tracking-tight">
                AI Planner <span className="text-xs font-semibold uppercase tracking-widest bg-purple-600/20 text-purple-400 px-2.5 py-1 rounded-full border border-purple-500/30 ml-2">Execution Coach</span>
            </h1>

            <div className="relative">
                <textarea
                    className={`w-full h-40 p-4 pr-16 bg-zinc-900 border rounded-lg text-white placeholder-zinc-500 focus:outline-none transition duration-200 ${
                        isListening ? "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]" : "border-zinc-700 focus:border-purple-500"
                    }`}
                    placeholder="Enter your tasks or click the microphone to speak... (Try saying 'Generate Plan' or 'Clear')"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={loading} 
                />
                
                <button
                    onClick={handleVoiceInput}
                    title="Speak your tasks or commands"
                    disabled={loading}
                    className={`absolute top-4 right-4 p-2 rounded-lg transition-all duration-300 flex items-center justify-center ${
                        isListening 
                        ? "bg-red-500/20 text-red-500 animate-pulse border border-red-500/50" 
                        : "bg-purple-900/40 text-purple-400 hover:bg-purple-600/40 border border-transparent hover:border-purple-500/30 disabled:opacity-50"
                    }`}
                >
                    {isListening ? (
                        <span className="relative flex h-5 w-5 items-center justify-center">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                        </span>
                    ) : (
                        <span className="text-xl leading-none">🎙️</span>
                    )}
                </button>
            </div>

            <button
                onClick={() => handleGenerate()}
                disabled={loading || isListening}
                className="mt-4 px-6 py-3 bg-purple-600 font-medium text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 shadow-lg shadow-purple-600/20"
            >
                {loading ? "Generating Plan..." : "Generate Plan"}
            </button>

            {/* =====================================
              AI THINKING OVERLAY
            ===================================== */}
            {loading && (
                <div className="mt-6 p-6 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg shadow-purple-900/10 transition-all duration-300">
                    <div className="space-y-3 mb-6">
                        {THINKING_STEPS.map((step, index) => {
                            if (index > thinkingStep) return null; 
                            
                            const isCurrent = index === thinkingStep;
                            
                            return (
                                <div 
                                    key={index} 
                                    className={`flex items-center gap-3 transition-opacity duration-500 ${
                                        isCurrent ? "text-purple-400 animate-pulse font-medium" : "text-zinc-500"
                                    }`}
                                >
                                    <span className={isCurrent ? "text-lg" : "text-green-500"}>
                                        {isCurrent ? "⚙️" : "✓"}
                                    </span>
                                    <span className="text-sm tracking-wide">{step}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden relative">
                        <div 
                            className="absolute top-0 left-0 h-full bg-purple-500 w-1/2 rounded-full"
                            style={{ animation: "slideIndeterminate 1.5s ease-in-out infinite" }}
                        ></div>
                    </div>
                </div>
            )}

            {/* =====================================
              SUCCESS BANNER
            ===================================== */}
            {!loading && showSuccess && (
                <div className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3 transition-all duration-500">
                    <span className="text-xl">✨</span>
                    <span className="text-green-400 font-semibold tracking-wide">Your AI Execution Plan is Ready!</span>
                </div>
            )}

            {/* AI Response Section */}
            {response && !loading && (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 text-white transition-opacity duration-500">

                    <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition">
                        <h3 className="text-zinc-400 text-sm mb-2 font-medium">Confidence Score</h3>
                        <p className="text-3xl font-bold">{response.confidenceScore}%</p>
                        <p className="text-sm text-zinc-400 mt-1 mb-4">{getConfidenceDetails(response.confidenceScore).text}</p>
                        <div className="w-full bg-zinc-800 rounded-full h-3">
                            <div
                                className={`${getConfidenceDetails(response.confidenceScore).color} h-3 rounded-full transition-all duration-500`}
                                style={{ width: `${response.confidenceScore}%` }}
                            ></div>
                        </div>
                    </div>

                    <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition flex flex-col justify-between">
                        <div>
                            <h3 className="text-zinc-400 text-sm mb-3 font-medium">Risk Level</h3>
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold tracking-wide ${getRiskBadgeStyles(response.riskLevel)}`}>
                                {response.riskLevel || "Low"}
                            </span>
                        </div>
                        {response.riskReason && (
                            <p className="text-sm text-zinc-400 mt-4 leading-relaxed italic">{response.riskReason}</p>
                        )}
                    </div>

                    <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition md:col-span-2">
                        <h3 className="text-zinc-400 text-sm mb-3 font-medium">Deadline Analysis</h3>
                        {response.deadlineAnalysis?.mostUrgentTask ? (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-zinc-800/40 border border-zinc-800 p-4 rounded-lg gap-3">
                                <div>
                                    <span className="text-xs font-semibold text-red-400 tracking-wider uppercase block mb-1">🚨 Most Urgent Task</span>
                                    <h4 className="font-semibold text-white text-lg">{response.deadlineAnalysis.mostUrgentTask}</h4>
                                </div>
                                <div className="bg-zinc-800 px-4 py-2 rounded-md border border-zinc-700 flex items-center shrink-0 self-start sm:self-center">
                                    <span className="text-sm font-medium text-amber-400">⏳ {response.deadlineAnalysis.daysRemaining} Days Remaining</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-zinc-500 text-sm italic">No urgent deadlines detected</p>
                        )}
                    </div>

                    <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition md:col-span-2">
                        <h3 className="text-zinc-400 text-sm mb-2 font-medium">Agent Message</h3>
                        <p className="text-zinc-300 leading-relaxed">{response.agentMessage}</p>
                    </div>

                    <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition">
                        <h3 className="text-zinc-400 text-sm mb-3 font-medium">Today's Plan</h3>
                        <ul className="space-y-2">
                            {response.todayPlan?.map((task, index) => (
                                <li key={index} className="bg-zinc-800/60 border border-zinc-800/50 p-3 rounded-lg flex items-start gap-2 text-sm text-zinc-200">
                                    <span className="shrink-0 text-purple-400">✓</span> {task}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition">
                        <h3 className="text-zinc-400 text-sm mb-3 font-medium">Upcoming Tasks</h3>
                        {response.upcomingTasks?.length > 0 ? (
                            response.upcomingTasks.map((task, index) => (
                                <div key={index} className="bg-zinc-800/60 border border-zinc-800/50 p-4 rounded-lg mb-3 last:mb-0">
                                    <h4 className="font-semibold text-white text-sm">
                                        {typeof task === "string" ? task : task.title}
                                    </h4>
                                    {typeof task !== "string" && (
                                        <div className="mt-2 flex items-center gap-4 text-xs">
                                            <span className="text-zinc-400">⏱ {task.estimatedTime}</span>
                                            <span className="text-purple-400 font-medium">Priority: {task.priority}</span>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-zinc-500 text-sm italic">No upcoming tasks</p>
                        )}
                    </div>

                    <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition">
                        <h3 className="text-zinc-400 text-sm mb-2 font-medium">Risk Reason</h3>
                        <p className="text-sm text-zinc-300 leading-relaxed">{response.riskReason || "No major risks detected"}</p>
                    </div>

                    <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition">
                        <h3 className="text-zinc-400 text-sm mb-2 font-medium">Recommended Focus</h3>
                        <p className="text-sm text-zinc-300 leading-relaxed">{response.recommendedFocus || "No recommendation available"}</p>
                    </div>

                    <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition md:col-span-2">
                        <h3 className="text-zinc-400 text-sm mb-1 font-medium">Estimated Hours Needed</h3>
                        <p className="text-3xl font-bold text-white">{response.estimatedHoursNeeded || 0} hrs</p>
                        <p className="text-xs text-zinc-500 mt-1 tracking-wide uppercase font-medium">Estimated workload remaining</p>
                    </div>

                </div>
            )}
        </MainLayout>
    );
}

export default AIPlanner;
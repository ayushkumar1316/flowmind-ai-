import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../components/layout/MainLayout";
import { generateSaveMyDay, recalculateAnalysis } from "../services/gemini";
import { loadPlan, savePlan } from "../services/firebaseService";

function Dashboard() {
    // =====================================
    // FLOWMIND AI DASHBOARD COMMAND CENTER
    // Status: DASHBOARD = DYNAMIC SYNC LOCKED
    // =====================================

    const [currentTime, setCurrentTime] = useState("");
    const [currentDate, setCurrentDate] = useState("");
    const [toastMessage, setToastMessage] = useState("");
    
    // Refresh Analysis Loading State
    const [refreshingAI, setRefreshingAI] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            let hours = now.getHours();
            const minutes = now.getMinutes().toString().padStart(2, "0");
            const ampm = hours >= 12 ? "PM" : "AM";
            hours = hours % 12 || 12; 
            setCurrentTime(`${hours}:${minutes} ${ampm}`);

            const formattedDate = now.toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
            });
            setCurrentDate(formattedDate);
        };

        updateClock();
        const intervalId = setInterval(updateClock, 1000); 
        return () => clearInterval(intervalId);
    }, []);

    // =====================================
    // LOAD PLAN FROM HYBRID STORAGE
    // =====================================
    useEffect(() => {
        const initializePlan = async () => {
            try {
                console.log("📂 Dashboard: Loading plan from hybrid storage...");
                const planFromStorage = await loadPlan();
                
                if (planFromStorage) {
                    localStorage.setItem("flowmind_plan", JSON.stringify(planFromStorage));
                    console.log("✅ Dashboard: Plan loaded and synced");
                }
            } catch (error) {
                console.error("❌ Dashboard: Error loading plan:", error);
            }
        };

        initializePlan();
    }, []);

    // =====================================
    // 1. DATA HYDRATION
    // =====================================
    const [dashboardData, setDashboardData] = useState(() => {
        const savedPlan = localStorage.getItem("flowmind_plan");
        const activeTodayPlan = localStorage.getItem("flowmind_today_plan");
        let activeMessage = null;

        if (activeTodayPlan) {
            try {
                const parsedActive = JSON.parse(activeTodayPlan);
                activeMessage = parsedActive.confidenceMessage;
            } catch (e) {
                console.error("Failed to parse flowmind_today_plan for message:", e);
            }
        }

        if (savedPlan) {
            try {
                const plan = JSON.parse(savedPlan);
                return {
                    lastAnalyzed: "Just Now",
                    aiStatus: "Monitoring Progress",
                    mostUrgentTask: {
                        title: plan.deadlineAnalysis?.mostUrgentTask || "No Urgent Tasks",
                        daysRemaining: plan.deadlineAnalysis?.daysRemaining || 0,
                        priority: "Critical"
                    },
                    confidenceScore: plan.confidenceScore || 0,
                    riskLevel: plan.riskLevel || "Low",
                    riskReason: plan.riskReason || "No major risks detected.",
                    estimatedHoursNeeded: plan.estimatedHoursNeeded || 0,
                    aiInsight: plan.recommendedFocus || "Stay focused on your primary schedule.",
                    aiCoachMessage: activeMessage || plan.agentMessage || "Let's get to work and execute your plan!",
                    deadlineStack: [
                        { 
                            id: 1, 
                            title: plan.deadlineAnalysis?.mostUrgentTask || "General Milestones", 
                            daysRemaining: plan.deadlineAnalysis?.daysRemaining || 0 
                        }
                    ],
                    upcomingTasks: Array.isArray(plan.upcomingTasks) 
                        ? plan.upcomingTasks.map((t) => ({ 
                            title: typeof t === 'string' ? t : t.title, 
                            priority: t.priority || "MEDIUM" 
                        }))
                        : []
                };
            } catch (e) {
                console.error("Failed to parse flowmind_plan:", e);
                return null;
            }
        }
        return null;
    });

    // =====================================
    // 2. FOCUS TASKS HYDRATION & PERSISTENCE
    // =====================================
    const [focusTasks, setFocusTasks] = useState(() => {
        const activeTodayPlan = localStorage.getItem("flowmind_today_plan");

        if (activeTodayPlan) {
            try {
                const parsedActive = JSON.parse(activeTodayPlan);
                if (Array.isArray(parsedActive.strictlyDoToday)) {
                    return parsedActive.strictlyDoToday.map((item, index) => ({
                        id: index + 1,
                        text: item.task || item.text || item, 
                        completed: item.completed || false
                    }));
                }
            } catch (e) { console.error(e); }
        }

        const savedPlan = localStorage.getItem("flowmind_plan");
        if (savedPlan) {
            try {
                const plan = JSON.parse(savedPlan);
                if (Array.isArray(plan.todayPlan)) {
                    return plan.todayPlan.map((t, index) => ({
                        id: index + 1,
                        text: typeof t === 'string' ? t : t.title,
                        completed: t.completed || false 
                    }));
                }
            } catch (e) { console.error(e); }
        }
        return [];
    });

    // Centralized function to sync task changes to local and cloud
    const syncTasksToStorage = async (updatedTasks) => {
        const activeTodayPlan = localStorage.getItem("flowmind_today_plan");
        const savedPlan = localStorage.getItem("flowmind_plan");

        if (activeTodayPlan) {
            try {
                const plan = JSON.parse(activeTodayPlan);
                plan.strictlyDoToday = updatedTasks.map(t => ({
                    task: t.text,
                    completed: t.completed
                }));
                localStorage.setItem("flowmind_today_plan", JSON.stringify(plan));
            } catch (e) { console.error(e); }
        } else if (savedPlan) {
            try {
                const plan = JSON.parse(savedPlan);
                plan.todayPlan = updatedTasks.map(t => ({
                    title: t.text,
                    completed: t.completed
                }));
                localStorage.setItem("flowmind_plan", JSON.stringify(plan));
                
                if (typeof savePlan === 'function') {
                    await savePlan(plan);
                }
            } catch (e) { console.error(e); }
        }
    };

    const handleToggleTask = async (id) => {
        const updatedTasks = focusTasks.map(task =>
            task.id === id ? { ...task, completed: !task.completed } : task
        );
        setFocusTasks(updatedTasks);
        await syncTasksToStorage(updatedTasks);
    };

    const handleDeleteTask = async (id, e) => {
        e.stopPropagation();
        if (window.confirm("Delete this task?")) {
            const updatedTasks = focusTasks.filter(task => task.id !== id);
            setFocusTasks(updatedTasks);
            await syncTasksToStorage(updatedTasks);
            
            setToastMessage("✅ Task deleted successfully.");
            setTimeout(() => setToastMessage(""), 3000);
        }
    };

    // =====================================
    // REFRESH AI ANALYSIS LOGIC
    // =====================================
    const handleRefreshAnalysis = async () => {
        setRefreshingAI(true);
        try {
            const completed = focusTasks.filter(t => t.completed).map(t => t.text);
            const remaining = focusTasks.filter(t => !t.completed).map(t => t.text);
            const currentPlan = JSON.parse(localStorage.getItem("flowmind_plan")) || {};

            const newAnalysis = await recalculateAnalysis(completed, remaining, currentPlan);

            setDashboardData(prev => ({
                ...prev,
                confidenceScore: newAnalysis.confidenceScore,
                riskLevel: newAnalysis.riskLevel,
                riskReason: newAnalysis.riskReason,
                aiCoachMessage: newAnalysis.agentMessage
            }));

            const planToSave = { ...currentPlan, ...newAnalysis };
            localStorage.setItem("flowmind_plan", JSON.stringify(planToSave));
            if (typeof savePlan === 'function') {
                await savePlan(planToSave);
            }

            // Crisis Escape Sequence
            if (isCrisisMode && newAnalysis.confidenceScore >= 40) {
                setIsCrisisResolved(true);
                setToastMessage("✅ Great progress! Crisis Mode cleared.");
            } else {
                setToastMessage("🧠 AI Analysis updated based on your progress.");
            }
            setTimeout(() => setToastMessage(""), 4000);

        } catch (error) {
            console.error("Failed to refresh analysis:", error);
            setToastMessage("❌ Failed to contact AI. Try again.");
            setTimeout(() => setToastMessage(""), 3000);
        } finally {
            setRefreshingAI(false);
        }
    };

    // =====================================
    // CRISIS MODE STATE & SMD LOGIC
    // =====================================
    const [isCrisisResolved, setIsCrisisResolved] = useState(() => {
        return !!localStorage.getItem("flowmind_today_plan");
    });

    const [isSmdOpen, setIsSmdOpen] = useState(false);
    const [smdHours, setSmdHours] = useState("");
    const [smdLoading, setSmdLoading] = useState(false);
    const [smdResult, setSmdResult] = useState(null);

    const handleGenerateSMD = async () => {
        if (!smdHours || isNaN(smdHours) || Number(smdHours) <= 0) return;
        setSmdLoading(true);
        try {
            const currentPlan = JSON.parse(localStorage.getItem("flowmind_plan")) || {};
            const result = await generateSaveMyDay(Number(smdHours), currentPlan);
            setSmdResult(result);
        } catch (error) {
            console.error("Save My Day generation failed", error);
        } finally {
            setSmdLoading(false);
        }
    };

    const handleApplySMD = () => {
        if (!smdResult) return;

        const todayPlanObject = {
            strictlyDoToday: smdResult.strictlyDoToday,
            postponeTomorrow: smdResult.postponeTomorrow,
            dropCancel: smdResult.dropCancel,
            confidenceMessage: smdResult.confidenceMessage,
            activatedAt: new Date().toISOString()
        };

        localStorage.setItem("flowmind_today_plan", JSON.stringify(todayPlanObject));

        setFocusTasks(smdResult.strictlyDoToday.map((item, index) => ({
            id: index + 1,
            text: item.task,
            completed: false
        })));

        setDashboardData(prev => ({
            ...prev,
            aiCoachMessage: smdResult.confidenceMessage
        }));

        setToastMessage("✅ Recovery plan activated.");
        setIsSmdOpen(false);
        setSmdResult(null);
        setSmdHours("");
        setIsCrisisResolved(true); 

        setTimeout(() => setToastMessage(""), 3000);
    };

    // Helper Styles
    const getConfidenceMeta = (score) => {
        const val = Number(score) || 0;
        if (val >= 80) return { text: "High chance of completing all goals on time", badge: "ON TRACK", badgeColor: "bg-green-500/20 text-green-400 border-green-500/30", color: "bg-green-500" };
        if (val >= 60) return { text: "Moderate chance of completing all goals on time", badge: "AT RISK", badgeColor: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", color: "bg-yellow-500" };
        return { text: "Risk of missing one or more deadlines", badge: "CRITICAL", badgeColor: "bg-red-500/20 text-red-400 border-red-500/30", color: "bg-red-500" };
    };

    const getPriorityBadgeStyles = (priority) => {
        const p = priority?.toUpperCase();
        if (p === "HIGH") return "bg-red-500/10 text-red-400 border-red-500/20";
        if (p === "MEDIUM") return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
        return "bg-green-500/10 text-green-400 border-green-500/20";
    };

    const getRiskColor = (level) => {
        const risk = level?.toLowerCase();
        if (risk === "low" || risk === "safe") return "text-green-400 bg-green-500/10 border-green-500/20";
        if (risk === "moderate" || risk === "medium") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
        return "text-red-400 bg-red-500/10 border-red-500/20";
    };

    const getDeadlineStackStyles = (days) => {
        if (days <= 3) return "bg-red-500/10 text-red-400 border-red-500/20";
        if (days <= 10) return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
        return "bg-green-500/10 text-green-400 border-green-500/20";
    };

    const cardHoverEffect = "transition-all duration-200 hover:border-zinc-700 hover:shadow-lg hover:shadow-black/50 hover:scale-[1.01]";

    // Progress Bar Math
    const completedTaskCount = focusTasks.filter(t => t.completed).length;
    const totalTaskCount = focusTasks.length;
    const progressPercentage = totalTaskCount === 0 ? 0 : Math.round((completedTaskCount / totalTaskCount) * 100);

    const isPlanValid = () => {
        if (!dashboardData) return false;
        const isTodayInvalid = focusTasks.some(t => t.text?.includes("Awaiting task input"));
        const isUpcomingInvalid = dashboardData.upcomingTasks.some(t => t.title?.includes("Awaiting task input"));
        const isUrgentInvalid = dashboardData.mostUrgentTask?.title?.includes("No tasks provided");
        const isConfidenceInvalid = dashboardData.confidenceScore <= 10;
        const isRiskReasonInvalid = dashboardData.riskReason?.includes("No actionable tasks");
        const isMessageInvalid = dashboardData.aiCoachMessage?.toLowerCase().includes("provide tasks");

        if (isTodayInvalid || isUpcomingInvalid || isUrgentInvalid || isConfidenceInvalid || isRiskReasonInvalid || isMessageInvalid) {
            return false;
        }
        return true;
    };

    if (!isPlanValid()) {
        return (
            <MainLayout>
                <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 animate-fade-in">
                    <div className="bg-[#18181B] border border-[#27272A] p-8 md:p-10 rounded-2xl max-w-lg w-full shadow-2xl shadow-black/50 relative overflow-hidden">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
                        <span className="text-6xl drop-shadow-lg shadow-purple-500 mb-6 block relative z-10">🤖</span>
                        <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2 relative z-10">
                            Welcome to FlowMind
                        </h2>
                        <p className="text-zinc-400 mb-8 font-medium relative z-10">
                            No AI execution plan found.
                        </p>
                        <div className="bg-[#09090B] border border-[#27272A] rounded-xl p-5 mb-8 text-left relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-4 text-center">
                                Generate your first AI plan to unlock:
                            </p>
                            <ul className="space-y-3.5">
                                <li className="flex items-center gap-3 text-sm text-zinc-300 font-medium">
                                    <span className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20 text-sm">📊</span> Smart Dashboard
                                </li>
                                <li className="flex items-center gap-3 text-sm text-zinc-300 font-medium">
                                    <span className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20 text-sm">🤖</span> AI Coach
                                </li>
                                <li className="flex items-center gap-3 text-sm text-zinc-300 font-medium">
                                    <span className="w-7 h-7 rounded-lg bg-green-500/10 text-green-400 flex items-center justify-center border border-green-500/20 text-sm">✅</span> Task Board
                                </li>
                                <li className="flex items-center gap-3 text-sm text-zinc-300 font-medium">
                                    <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 text-sm">💡</span> Productivity Insights
                                </li>
                            </ul>
                        </div>
                        <button onClick={() => navigate("/planner")} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm px-6 py-3.5 rounded-xl shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2 border border-purple-400/30 relative z-10">
                            <span className="text-lg">✨</span> Generate My First Plan
                        </button>
                    </div>
                </div>
            </MainLayout>
        );
    }

    const confidenceMeta = getConfidenceMeta(dashboardData.confidenceScore);
    const safeDaysLeft = Math.max(1, Number(dashboardData.mostUrgentTask?.daysRemaining) || 1);
    const hrsPerDay = Math.round((Number(dashboardData.estimatedHoursNeeded) || 0) / safeDaysLeft);

    const isCrisisMode = dashboardData.confidenceScore < 40 && !isCrisisResolved;

    return (
        <MainLayout>
            {/* TOAST NOTIFICATION */}
            {toastMessage && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] bg-[#18181B] text-white px-6 py-3 rounded-xl shadow-xl shadow-green-950/40 border border-green-500 flex items-center gap-3 animate-fade-in">
                    <span className="text-sm font-bold tracking-wide text-green-400">{toastMessage}</span>
                </div>
            )}

            {/* SAVE MY DAY MODAL */}
            {isSmdOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-4">
                    <div className="bg-[#18181B] border border-purple-500/30 rounded-2xl p-6 max-w-2xl w-full shadow-2xl shadow-purple-950/40 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                        
                        <div className="flex items-center justify-between mb-6 border-b border-[#27272A] pb-4">
                            <div className="flex items-center gap-3">
                                <span className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center text-xl border border-red-500/20">🚨</span>
                                <div>
                                    <h3 className="text-white font-black text-xl tracking-tight">Save My Day</h3>
                                    <p className="text-xs text-zinc-400 font-mono mt-0.5">Agentic Execution Override</p>
                                </div>
                            </div>
                            <button onClick={() => { setIsSmdOpen(false); setSmdResult(null); setSmdHours(""); }} className="text-zinc-500 hover:text-white transition-colors">
                                ✖
                            </button>
                        </div>

                        {!smdResult && (
                            <div className="space-y-5 py-4">
                                <div>
                                    <label className="block text-sm font-bold text-zinc-300 mb-2">How many hours do you have available today?</label>
                                    <input 
                                        type="number" placeholder="e.g., 4" value={smdHours} onChange={(e) => setSmdHours(e.target.value)}
                                        className="w-full bg-[#09090B] border border-[#27272A] text-white p-4 rounded-xl text-lg font-bold focus:outline-none focus:border-purple-500 transition-colors"
                                    />
                                </div>
                                <button
                                    onClick={handleGenerateSMD} disabled={smdLoading || !smdHours}
                                    className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2"
                                >
                                    {smdLoading ? <span className="animate-pulse">🤖 Re-evaluating Constraints...</span> : <><span>⚡</span> Generate Today's Plan</>}
                                </button>
                            </div>
                        )}

                        {smdResult && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="space-y-3">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-green-400 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span> Strictly Do Today
                                    </h4>
                                    <div className="grid grid-cols-1 gap-3">
                                        {smdResult.strictlyDoToday.map((item, idx) => (
                                            <div key={idx} className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-bold text-white text-sm">{item.task}</span>
                                                    <span className="text-[10px] font-mono bg-green-500/20 text-green-300 px-2 py-0.5 rounded font-bold">~{item.hours} HRS</span>
                                                </div>
                                                <p className="text-xs text-green-200/70 italic border-l-2 border-green-500/40 pl-2">AI Reason: {item.reason}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <button onClick={handleApplySMD} className="w-full mt-4 bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-xl shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
                                    ✅ Apply Today's Plan
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CRISIS MODE OVERLAY */}
            {isCrisisMode ? (
                <div className="fixed inset-0 z-[40] bg-gradient-to-br from-[#09090B] via-red-950 to-[#09090B] backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-fade-in text-center overflow-y-auto">
                    <span className="text-6xl mb-4 animate-pulse">🚨</span>
                    <h1 className="text-4xl md:text-6xl font-black text-red-500 tracking-tighter mb-6 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">CRITICAL RISK</h1>
                    
                    <div className="bg-black/60 border border-red-500/40 p-6 md:p-8 rounded-2xl max-w-2xl w-full backdrop-blur-md shadow-2xl shadow-red-900/30 text-left space-y-6">
                        <div className="grid grid-cols-2 gap-4 border-b border-red-500/20 pb-6">
                            <div>
                                <p className="text-red-300/70 text-xs font-bold uppercase tracking-widest mb-1">Confidence Score</p>
                                <p className="text-5xl font-black text-white">{dashboardData.confidenceScore}%</p>
                            </div>
                            <div>
                                <p className="text-red-300/70 text-xs font-bold uppercase tracking-widest mb-1">Risk Level</p>
                                <p className="text-2xl font-black text-red-400 uppercase tracking-widest">{dashboardData.riskLevel}</p>
                            </div>
                        </div>

                        <div>
                            <p className="text-red-300/70 text-xs font-bold uppercase tracking-widest mb-2">Risk Reason</p>
                            <p className="text-sm text-zinc-200 italic">"{dashboardData.riskReason}"</p>
                        </div>
                        
                        <div>
                            <p className="text-red-300/70 text-xs font-bold uppercase tracking-widest mb-2">Agent Message</p>
                            <p className="text-sm text-zinc-100 bg-red-500/10 p-4 rounded-xl border border-red-500/30 leading-relaxed font-medium">
                                {dashboardData.aiCoachMessage}
                            </p>
                        </div>

                        <div>
                            <p className="text-red-300/70 text-xs font-bold uppercase tracking-widest mb-3">Priority Tasks For Today</p>
                            <ul className="space-y-2">
                                {focusTasks.slice(0, 3).map((task, idx) => (
                                    <li key={idx} className="bg-red-950/40 border border-red-900/50 p-3.5 rounded-xl text-sm font-semibold text-zinc-200 flex items-center gap-3">
                                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></span> 
                                        {task.text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <button
                        onClick={() => setIsSmdOpen(true)}
                        className="mt-8 bg-red-600 hover:bg-red-500 text-white text-lg font-black uppercase tracking-widest py-4 px-10 rounded-xl shadow-[0_0_40px_rgba(220,38,38,0.5)] transition-all hover:scale-105 hover:shadow-[0_0_60px_rgba(220,38,38,0.7)] flex items-center gap-3 border border-red-400/50"
                    >
                        ☑ Generate Recovery Plan
                    </button>
                </div>
            ) : (
                /* NORMAL DASHBOARD */
                <div className="min-h-screen bg-[#09090B] text-white space-y-6 pb-12">
                    
                    {/* SECTION 1: HEADER */}
                    <div className={`flex flex-col md:flex-row md:items-center justify-between p-6 bg-[#18181B] rounded-xl border border-[#27272A] gap-4 ${cardHoverEffect}`}>
                        <div>
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-2xl font-bold tracking-tight">Welcome Back 👋</h1>
                                {dashboardData.mostUrgentTask?.daysRemaining <= 1 && (
                                    <span className="px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-black tracking-widest rounded-full uppercase shadow-sm">
                                        🚨 Deadline {dashboardData.mostUrgentTask?.daysRemaining === 0 ? "Today" : "Tomorrow"}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-zinc-400 mt-2">Last Analyzed: {dashboardData.lastAnalyzed}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 md:gap-6 text-sm">
                            <div className="bg-[#09090B] px-4 py-2 rounded-lg border border-[#27272A] flex flex-col items-center justify-center shadow-inner min-w-[120px]">
                                <span className="font-mono text-purple-400 font-bold">🕒 {currentTime || "11:42 AM"}</span>
                                <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mt-0.5">{currentDate}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 px-4 py-2 rounded-lg">
                                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                                <span className="text-xs font-medium text-purple-300">AI Status: {dashboardData.aiStatus}</span>
                            </div>
                        </div>
                    </div>

                    {/* SECTION 2: ALERT CENTER */}
                    <div className={`p-6 bg-[#18181B] rounded-xl border-2 border-red-500/30 shadow-lg shadow-red-950/20 relative overflow-hidden group ${cardHoverEffect}`}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl pointer-events-none"></div>
                        <span className="text-xs font-bold uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-md">
                            🚨 Most Urgent Task
                        </span>
                        <h2 className="text-3xl font-black tracking-tight mt-4 text-zinc-100">{dashboardData.mostUrgentTask.title}</h2>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <span className="px-3 py-1 rounded-md text-xs font-semibold bg-red-950/40 text-red-400 border border-red-500/20">
                                {dashboardData.mostUrgentTask.daysRemaining} Days Remaining
                            </span>
                            <span className="px-3 py-1 rounded-md text-xs font-semibold bg-zinc-800 text-zinc-300 border border-[#27272A]">
                                Priority: {dashboardData.mostUrgentTask.priority}
                            </span>
                        </div>
                    </div>

                    {/* SECTION 3: EXECUTIVE OVERVIEW */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className={`p-5 bg-[#18181B] rounded-xl border border-[#27272A] relative overflow-hidden ${cardHoverEffect}`}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-zinc-400 text-xs uppercase tracking-wider font-semibold">Confidence Score</h3>
                                <span className={`text-[10px] font-black tracking-widest px-2 py-0.5 rounded border ${confidenceMeta.badgeColor}`}>
                                    {confidenceMeta.badge}
                                </span>
                            </div>
                            <p className="text-3xl font-extrabold mt-2">{dashboardData.confidenceScore}%</p>
                            <p className="text-xs text-zinc-400 mt-1 mb-4 h-8 line-clamp-2">{confidenceMeta.text}</p>
                            <div className="w-full bg-zinc-800 rounded-full h-2">
                                <div className={`${confidenceMeta.color} h-2 rounded-full transition-all duration-500`} style={{ width: `${dashboardData.confidenceScore}%` }}></div>
                            </div>
                        </div>

                        <div className={`p-5 bg-[#18181B] rounded-xl border border-[#27272A] flex flex-col justify-between ${cardHoverEffect}`}>
                            <div>
                                <h3 className="text-zinc-400 text-xs uppercase tracking-wider font-semibold">Risk Level</h3>
                                <div className="mt-2.5">
                                    <span className={`px-3 py-1 rounded-md text-sm font-bold border ${getRiskColor(dashboardData.riskLevel)}`}>
                                        {dashboardData.riskLevel}
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs text-zinc-400 mt-3 italic leading-relaxed">{dashboardData.riskReason}</p>
                        </div>

                        <div className={`p-5 bg-[#18181B] rounded-xl border border-[#27272A] flex flex-col justify-between ${cardHoverEffect}`}>
                            <div>
                                <h3 className="text-zinc-400 text-xs uppercase tracking-wider font-semibold">Remaining Workload</h3>
                                <div className="mt-2">
                                    <p className="text-3xl font-extrabold text-white">{dashboardData.estimatedHoursNeeded} Hours</p>
                                    <p className="text-xs font-semibold text-purple-400 mt-0.5 tracking-wide">≈ {hrsPerDay} hrs/day needed</p>
                                </div>
                            </div>
                            <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide mt-3">Estimated workload remaining</p>
                        </div>
                    </div>

                    {/* SECTION 4: AI INSIGHT */}
                    <div className={`p-6 bg-[#18181B] rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-950/20 via-[#18181B] to-[#18181B] shadow-lg shadow-purple-500/10 ${cardHoverEffect}`}>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="p-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs">💡</span>
                            <h3 className="text-purple-400 text-xs uppercase tracking-widest font-black">AI INSIGHT</h3>
                        </div>
                        <p className="text-sm font-medium text-zinc-100 leading-relaxed pl-7">{dashboardData.aiInsight}</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Stack */}
                        <div className="space-y-6">
                            
                            {/* SECTION 5: TODAY'S FOCUS WITH CHECKBOXES & PROGRESS */}
                            <div className={`p-5 bg-[#18181B] rounded-xl border border-[#27272A] flex flex-col ${cardHoverEffect}`}>
                                <h3 className="text-zinc-400 text-sm font-semibold mb-3 flex items-center gap-2">
                                    🎯 Focus Today
                                </h3>

                                {totalTaskCount > 0 && (
                                    <div className="mb-4 bg-[#09090B] p-3 rounded-lg border border-[#27272A]">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-xs font-bold tracking-wide text-zinc-400">Progress</span>
                                            <span className="text-xs font-bold text-purple-400">{completedTaskCount} / {totalTaskCount} Tasks Completed</span>
                                        </div>
                                        <div className="w-full bg-zinc-800 rounded-full h-1.5">
                                            <div 
                                                className="bg-purple-500 h-1.5 rounded-full transition-all duration-500" 
                                                style={{ width: `${progressPercentage}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                )}

                                {focusTasks.length > 0 ? (
                                    <ul className="space-y-2.5 mb-4">
                                        {focusTasks.map((task) => (
                                            <li 
                                                key={task.id} 
                                                className={`flex items-center gap-3 p-3.5 bg-[#09090B] rounded-lg border border-[#27272A] transition-all duration-200 group ${
                                                    task.completed ? "opacity-50 bg-zinc-950/40" : ""
                                                }`}
                                            >
                                                <input 
                                                    type="checkbox" 
                                                    checked={task.completed} 
                                                    onChange={() => handleToggleTask(task.id)} 
                                                    className="w-5 h-5 accent-purple-600 rounded cursor-pointer transition-all"
                                                />
                                                
                                                <span className={`text-sm font-medium transition-all duration-200 flex-1 ${
                                                    task.completed ? "line-through text-zinc-500 italic" : "text-zinc-100"
                                                }`}>
                                                    {task.text}
                                                </span>

                                                <button
                                                    onClick={(e) => handleDeleteTask(task.id, e)}
                                                    className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded hover:bg-red-500/10 cursor-pointer"
                                                    title="Delete task"
                                                >
                                                    🗑️
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-zinc-500 italic mb-4">No specific tasks allocated for today.</p>
                                )}

                                {/* REFRESH AI ANALYSIS BUTTON */}
                                <button
                                    onClick={handleRefreshAnalysis}
                                    disabled={refreshingAI}
                                    className="w-full mt-auto py-3 bg-zinc-800/50 hover:bg-zinc-800 text-purple-300 border border-purple-500/20 rounded-xl font-bold tracking-wide text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {refreshingAI ? (
                                        <span className="animate-pulse">🧠 Recalculating...</span>
                                    ) : (
                                        <>🧠 Refresh AI Analysis</>
                                    )}
                                </button>
                            </div>

                            {/* SECTION 6: AI COACH */}
                            <div className={`p-6 bg-[#18181B] rounded-xl border border-[#27272A] flex flex-col justify-between ${cardHoverEffect}`}>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-lg shadow-md shadow-purple-500/20 ring-2 ring-purple-500/30">🤖</div>
                                    <div>
                                        <h3 className="text-zinc-100 text-sm font-bold flex items-center gap-1.5">
                                            FlowMind Coach <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping"></span>
                                        </h3>
                                        <span className="text-[10px] text-purple-400 font-mono tracking-wider uppercase">Executive Partner</span>
                                    </div>
                                </div>
                                <div className="relative bg-[#09090B] p-4 rounded-xl border border-[#27272A] border-l-4 border-l-purple-500 mb-4">
                                    <p className="text-sm text-zinc-200 leading-relaxed italic font-serif">"{dashboardData.aiCoachMessage}"</p>
                                </div>
                                <button onClick={() => setIsSmdOpen(true)} className="w-full py-3.5 mt-auto bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-900/10">
                                    <span className="text-base animate-pulse">🚨</span> Save My Day
                                </button>
                            </div>
                        </div>

                        {/* Right Stack */}
                        <div className="space-y-6">
                            {/* SECTION 7: DEADLINE STACK */}
                            <div className={`p-5 bg-[#18181B] rounded-xl border border-[#27272A] ${cardHoverEffect}`}>
                                <h3 className="text-zinc-400 text-sm font-semibold mb-3 flex items-center gap-2">⏳ Deadline Stack</h3>
                                <div className="space-y-2.5">
                                    {dashboardData.deadlineStack.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between p-3 bg-[#09090B] rounded-lg border border-[#27272A]">
                                            <span className="text-sm font-medium text-zinc-200">{item.title}</span>
                                            <span className={`px-2.5 py-1 rounded text-xs font-semibold border ${getDeadlineStackStyles(item.daysRemaining)}`}>
                                                {item.daysRemaining} {item.daysRemaining === 1 ? "Day" : "Days"} Remaining
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* SECTION 8: UPCOMING TASKS */}
                            <div className={`p-5 bg-[#18181B] rounded-xl border border-[#27272A] ${cardHoverEffect}`}>
                                <h3 className="text-zinc-400 text-sm font-semibold mb-3 flex items-center gap-2">📋 Upcoming Tasks</h3>
                                {dashboardData.upcomingTasks.length > 0 ? (
                                    <div className="divide-y divide-[#27272A] bg-[#09090B] rounded-lg border border-[#27272A] overflow-hidden">
                                        {dashboardData.upcomingTasks.slice(0, 5).map((task, idx) => (
                                            <div key={idx} className="p-3.5 text-sm text-zinc-300 hover:bg-zinc-900/50 transition-colors duration-150 flex items-center justify-between">
                                                <span className="font-medium text-zinc-200">{task.title}</span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider border uppercase ${getPriorityBadgeStyles(task.priority)}`}>
                                                    {task.priority}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-zinc-500 italic bg-[#09090B] p-4 rounded-lg border border-[#27272A]">No upcoming tasks scheduled.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
}

export default Dashboard;
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { savePlan, subscribeToPlan } from "../services/firebaseService";
import { Brain, CalendarDays } from "lucide-react";

const priorityWeights = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const parseDuration = (value = "") => {
    const text = String(value).toLowerCase();
    const number = parseFloat(text) || 0;
    if (text.includes("min")) return number / 60;
    return number;
};

const normalizePriority = (priority) => (priority ? priority.toUpperCase() : "UNSET");

const toTask = (task, index) => {
    const title = typeof task === "string" ? task : task?.title || task?.task || "Untitled task";
    return {
        id: task?.id ?? `today-${index}`,
        title,
        status: task?.status || (task?.completed ? "Completed" : "To Do"),
        priority: normalizePriority(task?.priority),
        deadlineDays: Number.isFinite(Number(task?.deadlineDays ?? task?.daysRemaining)) ? Number(task?.deadlineDays ?? task?.daysRemaining) : null,
        estimatedTime: task?.estimatedTime || task?.duration || task?.timeEstimate || "",
        isRepeating: Boolean(task?.isRepeating),
        currentCount: Number(task?.currentCount || 0),
        targetCount: Number(task?.targetCount || 0),
        createdAt: task?.createdAt || task?.id || index,
        raw: task,
    };
};

const getConfidenceMeta = (score) => {
    const value = Number(score) || 0;
    if (value >= 80) return { text: "You're doing great!", badge: "ON TRACK", badgeColor: "bg-green-50 text-green-700 border-green-200", color: "bg-green-500", hex: "#22c55e" };
    if (value >= 60) return { text: "Moderate risk. Keep pushing.", badge: "AT RISK", badgeColor: "bg-yellow-50 text-yellow-700 border-yellow-200", color: "bg-yellow-500", hex: "#eab308" };
    return { text: "Critical risk of missing goals.", badge: "CRITICAL", badgeColor: "bg-red-50 text-red-700 border-red-200", color: "bg-red-500", hex: "#ef4444" };
};

const getDeadlineStackStyles = (days) => {
    if (days <= 3) return "text-red-600";
    if (days <= 10) return "text-yellow-600";
    return "text-green-600";
};

const getDeadlineBarStyles = (days) => {
    if (days <= 3) return "bg-red-500";
    if (days <= 10) return "bg-yellow-500";
    return "bg-green-500";
};

const getPriorityBadgeStyles = (priority) => {
    const value = normalizePriority(priority);
    if (value === "HIGH") return "bg-red-50 text-red-600 border-red-100";
    if (value === "LOW") return "bg-green-50 text-green-600 border-green-100";
    if (value === "MEDIUM") return "bg-amber-50 text-amber-600 border-amber-100";
    return "bg-gray-50 text-gray-500 border-gray-100";
};

const CoachMessage = memo(function CoachMessage({ message }) {
    const visibleMessage = message || "Your latest AI coach message will appear after your first plan sync.";

    return (
        <p
            key={visibleMessage}
            className="dashboard-coach-fade text-xs text-gray-700 leading-relaxed font-semibold italic line-clamp-3 transition-opacity duration-500"
            aria-live="polite"
        >
            "{visibleMessage}"
        </p>
    );
});

function Dashboard() {
    const [currentTime, setCurrentTime] = useState("");
    const [currentDate, setCurrentDate] = useState("");
    const [nowMs, setNowMs] = useState(0);
    const [plan, setPlan] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [syncingTaskId, setSyncingTaskId] = useState(null);
    const [toastMessage, setToastMessage] = useState("");
    const toastTimeoutRef = useRef(null);

    const navigate = useNavigate();

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setNowMs(now.getTime());
            setCurrentTime(now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }));
            setCurrentDate(now.toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
            }));
        };

        updateClock();
        const intervalId = setInterval(updateClock, 1000);
        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        let isActive = true;
        const unsubscribe = subscribeToPlan((realtimePlan) => {
            if (!isActive) return;
            setPlan(realtimePlan);
            setIsLoading(false);
        });

        if (!unsubscribe) {
            queueMicrotask(() => {
                if (isActive) setIsLoading(false);
            });
        }

        return () => {
            isActive = false;
            if (unsubscribe) unsubscribe();
        };
    }, []);

    useEffect(() => () => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    }, []);

    const tasks = useMemo(() => {
        if (!plan) return [];
        if (Array.isArray(plan.taskBoardTasks)) return plan.taskBoardTasks.map(toTask);
        if (Array.isArray(plan.todayPlan)) return plan.todayPlan.map(toTask);
        if (Array.isArray(plan.strictlyDoToday)) return plan.strictlyDoToday.map(toTask);
        return [];
    }, [plan]);

    const activeTasks = useMemo(() => {
        return tasks
            .filter((task) => task.status !== "Completed")
            .sort((a, b) => {
                const priorityDelta = (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0);
                if (priorityDelta) return priorityDelta;

                const deadlineDelta = (a.deadlineDays ?? 999) - (b.deadlineDays ?? 999);
                if (deadlineDelta) return deadlineDelta;

                const durationDelta = parseDuration(a.estimatedTime) - parseDuration(b.estimatedTime);
                if (durationDelta) return durationDelta;

                return String(a.createdAt).localeCompare(String(b.createdAt));
            });
    }, [tasks]);

    const completedTasks = useMemo(() => tasks.filter((task) => task.status === "Completed"), [tasks]);
    const executionTasks = useMemo(() => activeTasks.filter((task) => !task.isRepeating), [activeTasks]);
    const todayTasks = useMemo(() => executionTasks.slice(0, 5), [executionTasks]);
    const focusTask = executionTasks[0] || null;
    const upcomingDeadlines = useMemo(() => {
        return activeTasks
            .filter((task) => task.deadlineDays !== null)
            .sort((a, b) => {
                const priorityDelta = (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0);
                if (priorityDelta) return priorityDelta;

                const deadlineDelta = (a.deadlineDays ?? 999) - (b.deadlineDays ?? 999);
                if (deadlineDelta) return deadlineDelta;

                return parseDuration(a.estimatedTime) - parseDuration(b.estimatedTime);
            })
            .slice(0, 3);
    }, [activeTasks]);
    const repeatingHabits = useMemo(() => activeTasks.filter((task) => task.isRepeating), [activeTasks]);

    const rawSuccessScore = Number(plan?.confidenceScore ?? plan?.successChance ?? 0);
    const successScore = Number.isFinite(rawSuccessScore) ? Math.min(100, Math.max(0, rawSuccessScore)) : 0;
    const [displayScore, setDisplayScore] = useState(0);
    const [ringPulseVersion, setRingPulseVersion] = useState(0);
    const displayScoreRef = useRef(0);
    const lastPulsedScoreRef = useRef(null);
    const confidenceMeta = getConfidenceMeta(displayScore);
    const completedTaskCount = completedTasks.length;
    const totalTaskCount = tasks.length;
    const progressPercentage = totalTaskCount === 0 ? 0 : Math.round((completedTaskCount / totalTaskCount) * 100);
    const currentStreak = Number(plan?.currentStreak ?? plan?.productivityStreak ?? plan?.streak?.current ?? 0);
    const aiCoachMessage = plan?.aiCoachMessage || plan?.agentMessage || plan?.confidenceMessage || "";
    const syncedAtMs = useMemo(() => {
        const rawDate = plan?.updatedAt || plan?.savedAt || plan?.activatedAt;
        const parsed = rawDate ? new Date(rawDate).getTime() : NaN;
        return Number.isFinite(parsed) ? parsed : null;
    }, [plan?.activatedAt, plan?.savedAt, plan?.updatedAt]);
    const lastSyncedLabel = useMemo(() => {
        if (!syncedAtMs) return "Live";
        const elapsedSeconds = Math.max(0, Math.floor((nowMs - syncedAtMs) / 1000));
        if (elapsedSeconds < 10) return "Just now";
        if (elapsedSeconds < 60) return `${elapsedSeconds} sec ago`;

        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        if (elapsedMinutes === 1) return "1 min ago";
        if (elapsedMinutes < 60) return `${elapsedMinutes} mins ago`;

        const elapsedHours = Math.floor(elapsedMinutes / 60);
        if (elapsedHours === 1) return "1 hour ago";
        return `${elapsedHours} hours ago`;
    }, [nowMs, syncedAtMs]);

    const currentHour = new Date().getHours();
    const timeOfDay = currentHour < 12 ? "Morning" : currentHour < 18 ? "Afternoon" : currentHour < 22 ? "Evening" : "Night";

    const ringRadius = 38;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringOffset = ringCircumference - (displayScore / 100) * ringCircumference;
    const onlyRepeatingHabitsRemain = executionTasks.length === 0 && repeatingHabits.length > 0;
    const calendarMeta = useMemo(() => {
        const date = new Date(nowMs || 0);
        const year = date.getFullYear();
        const month = date.getMonth();
        const today = date.getDate();
        const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const deadlineDays = new Set();

        activeTasks.forEach((task) => {
            if (task.deadlineDays === null || task.deadlineDays < 0) return;
            const deadline = new Date(date);
            deadline.setDate(date.getDate() + task.deadlineDays);
            if (deadline.getFullYear() === year && deadline.getMonth() === month) {
                deadlineDays.add(deadline.getDate());
            }
        });

        return {
            label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
            today,
            deadlineDays,
            days: Array.from({ length: 42 }, (_, index) => {
                const day = index - firstWeekday + 1;
                return day > 0 && day <= daysInMonth ? day : null;
            }),
        };
    }, [activeTasks, nowMs]);

    useEffect(() => {
        let frameId;
        const start = displayScoreRef.current;
        const target = successScore;
        const startTime = performance.now();
        const duration = 900;

        const animateScore = (time) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const nextScore = Math.min(100, Math.max(0, Math.round(start + (target - start) * eased)));
            displayScoreRef.current = nextScore;
            setDisplayScore(nextScore);

            if (progress < 1) {
                frameId = requestAnimationFrame(animateScore);
            } else if (start !== target && lastPulsedScoreRef.current !== target) {
                lastPulsedScoreRef.current = target;
                setRingPulseVersion((version) => version + 1);
            }
        };

        frameId = requestAnimationFrame(animateScore);
        return () => {
            cancelAnimationFrame(frameId);
        };
    }, [successScore]);

    const cardHoverEffect = "min-w-0 bg-white rounded-[22px] border border-[#E9DFD3]/80 shadow-[0_14px_40px_rgba(80,62,38,0.07)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(80,62,38,0.1)] flex flex-col";

    const getFutureDate = useCallback((daysAhead) => {
        const d = new Date();
        d.setDate(d.getDate() + Number(daysAhead || 0));
        return {
            day: d.toLocaleDateString("en-GB", { day: "2-digit" }),
            month: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
        };
    }, []);

    const handleCompleteTask = useCallback(async (taskId) => {
        if (!plan || syncingTaskId) return;

        setSyncingTaskId(taskId);
        try {
            const sourceTasks = Array.isArray(plan.taskBoardTasks) ? plan.taskBoardTasks : tasks.map((task) => task.raw);
            const updatedTasks = sourceTasks.map((task, index) => {
                const normalized = toTask(task, index);
                if (normalized.id !== taskId) return task;
                const baseTask = typeof task === "string" ? { title: task } : task;
                return {
                    ...baseTask,
                    status: "Completed",
                    completed: true,
                    completedAt: new Date().toISOString(),
                    currentCount: baseTask?.targetCount || baseTask?.currentCount,
                };
            });

            const total = updatedTasks.length;
            const completed = updatedTasks.filter((task, index) => toTask(task, index).status === "Completed").length;
            const nextProgress = total === 0 ? 0 : Math.round((completed / total) * 100);

            const didSave = await savePlan({
                ...plan,
                taskBoardTasks: updatedTasks,
                confidenceScore: Math.max(Number(plan.confidenceScore || 0), nextProgress),
            });
            if (!didSave) throw new Error("Plan save was not accepted");
        } catch (error) {
            console.error("Failed to complete task from dashboard", error);
            setToastMessage("Could not sync task. Please try again.");
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => {
                setToastMessage("");
                toastTimeoutRef.current = null;
            }, 3000);
        } finally {
            setSyncingTaskId(null);
        }
    }, [plan, syncingTaskId, tasks]);

    if (isLoading) {
        return (
            <>
                <style>{`
                    @keyframes dashboardShimmer {
                        0% { background-position: -200% 0; }
                        100% { background-position: 200% 0; }
                    }
                    .dashboard-skeleton {
                        background: linear-gradient(90deg, #E9DFD3 25%, #FFFDFB 50%, #E9DFD3 75%);
                        background-size: 200% 100%;
                        animation: dashboardShimmer 1.8s ease-in-out infinite;
                    }
                `}</style>
                <div className="relative min-h-screen text-gray-800 overflow-hidden font-sans pb-5">
                    <div className="relative z-10 max-w-[1510px] mx-auto px-5 py-4 lg:px-7 lg:py-5">
                        <div className="mb-4">
                            <div className="h-3 w-28 rounded-full dashboard-skeleton mb-3"></div>
                            <div className="h-8 w-64 rounded-xl dashboard-skeleton border border-[#E9DFD3]"></div>
                        </div>
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {[0, 1, 2].map((item) => (
                                    <div key={item} className={`${cardHoverEffect} min-h-[162px]`}>
                                        <div className="h-4 w-32 rounded dashboard-skeleton mb-5"></div>
                                        <div className="h-16 rounded-2xl dashboard-skeleton"></div>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                <div className={`lg:col-span-7 ${cardHoverEffect} min-h-[250px]`}>
                                    <div className="h-4 w-36 rounded dashboard-skeleton mb-4"></div>
                                    <div className="space-y-3">
                                        {[0, 1, 2].map((item) => <div key={item} className="h-12 rounded-xl dashboard-skeleton"></div>)}
                                    </div>
                                </div>
                                <div className={`lg:col-span-5 ${cardHoverEffect} min-h-[250px]`}>
                                    <div className="h-4 w-36 rounded dashboard-skeleton mb-4"></div>
                                    <div className="space-y-3">
                                        {[0, 1, 2].map((item) => <div key={item} className="h-12 rounded-xl dashboard-skeleton"></div>)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (!plan) {
        return (
            <>
                <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
                    <div className="relative w-full max-w-[640px] md:w-[60%]">
                        {/* Ambient Glow */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-56 h-56 bg-purple-300/20 blur-[80px] rounded-full pointer-events-none"></div>

                        <div className="relative bg-white border border-[#E9DFD3]/80 rounded-[22px] shadow-[0_14px_40px_rgba(80,62,38,0.07)] px-8 py-8 text-center animate-fade-in-up">
                            {/* Brain Logo */}
                            <div className="w-16 h-16 mx-auto rounded-[20px] bg-purple-50 border border-purple-100 shadow-[0_0_20px_rgba(147,51,234,0.1)] flex items-center justify-center animate-float mb-5">
                                <Brain className="w-8 h-8 text-purple-600" />
                            </div>

                            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-950">
                                Your Dashboard is Ready
                            </h2>

                            <p className="mt-3 text-sm md:text-base text-gray-500 leading-relaxed max-w-md mx-auto">
                                Create your first AI execution plan and FlowMind will
                                automatically organize your tasks, priorities,
                                habits, and insights.
                            </p>

                            <button
                                onClick={() => navigate("/planner")}
                                className="mt-6 inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-purple-600 text-white text-sm font-bold shadow-lg shadow-purple-500/20 hover:-translate-y-0.5 hover:bg-purple-500 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2"
                            >
                                ✨ Create My First AI Plan
                            </button>

                            <p className="mt-2 text-[11px] font-bold text-gray-400 tracking-wide uppercase">
                                Takes less than 30 seconds
                            </p>

                            {/* Flow Preview */}
                            <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-2.5 md:gap-3">
                                {[
                                    { icon: "📝", title: "Describe Goal" },
                                    { icon: "🧠", title: "AI Plans Everything" },
                                    { icon: "🚀", title: "Start Executing" },
                                ].map((item, index, arr) => (
                                    <div key={item.title} className="flex flex-col md:flex-row items-center gap-2.5 md:gap-3">
                                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FAF8F4] border border-[#EFE5D9]">
                                            <span className="text-base">{item.icon}</span>
                                            <span className="font-bold text-xs text-gray-700">{item.title}</span>
                                        </div>
                                        {index < arr.length - 1 && (
                                            <span className="text-gray-300 text-lg md:rotate-0 rotate-90 my-1 md:my-0">→</span>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Feature Chips */}
                            <div className="mt-7 flex flex-wrap justify-center gap-2">
                                {[
                                    "✓ Smart Planning",
                                    "✓ AI Coach",
                                    "✓ Live Tracking",
                                    "✓ Daily Habits",
                                ].map((chip) => (
                                    <span
                                        key={chip}
                                        className="px-3 py-1.5 rounded-lg bg-white border border-[#E9DFD3] text-[11px] font-bold text-gray-500 tracking-wide"
                                    >
                                        {chip}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <style>{`
                @keyframes dashboardRingPulse {
                    0% { transform: scale(1); opacity: 0.42; }
                    60% { transform: scale(1.1); opacity: 0; }
                    100% { transform: scale(1.1); opacity: 0; }
                }
                @keyframes dashboardCoachFade {
                    from { opacity: 0; transform: translateY(3px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .dashboard-ring-pulse {
                    animation: dashboardRingPulse 420ms ease-out 1;
                }
                .dashboard-coach-fade {
                    animation: dashboardCoachFade 360ms ease-out 1;
                }
                .dashboard-root button:focus-visible {
                    outline: 2px solid #C4B5FD;
                    outline-offset: 2px;
                }
                @media (prefers-reduced-motion: reduce) {
                    .dashboard-ring-pulse,
                    .dashboard-coach-fade {
                        animation: none;
                    }
                }
            `}</style>
            {toastMessage && (
                <div role="alert" aria-live="assertive" className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] max-w-[calc(100vw-2rem)] bg-white text-gray-900 px-6 py-3 rounded-xl shadow-xl border border-red-200 flex items-center gap-3 animate-fade-in">
                    <span className="text-sm font-bold tracking-wide text-red-600">{toastMessage}</span>
                </div>
            )}

            <div className="dashboard-root relative min-h-screen bg-transparent text-gray-800 overflow-hidden font-sans pb-5">
                <div className="relative z-10 max-w-[1510px] mx-auto px-5 py-4 lg:px-7 lg:py-5">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 mt-0">
                        <div>
                            <h2 className="text-[#A09486] text-[11px] font-black uppercase tracking-[0.18em] mb-0.5">Good {timeOfDay}!</h2>
                            <h1 className="text-[28px] font-black tracking-tight text-gray-950 leading-tight">Welcome Back 👋</h1>
                            <p className="text-[11px] font-medium text-gray-500 mt-1 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                Last Synced: <span className="text-gray-700 font-semibold">{lastSyncedLabel}</span>
                            </p>
                        </div>

                        <div className="flex w-full flex-wrap items-center gap-2.5 mt-3 md:mt-0 md:w-auto">
                            <div className="min-w-0 max-w-full bg-white/95 px-3.5 py-1.5 rounded-xl border border-[#E9DFD3] shadow-[0_8px_24px_rgba(80,62,38,0.06)] flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-gray-900 font-bold text-xs tracking-tight">
                                    <span className="text-sm text-purple-600">🕒</span>
                                    {currentTime}
                                </div>
                                <div className="w-px h-3.5 bg-gray-200"></div>
                                <div className="truncate text-[10px] text-gray-500 font-extrabold uppercase tracking-wider">
                                    {currentDate}
                                </div>
                            </div>
                            <div role="status" className="flex items-center gap-1.5 bg-purple-50/90 border border-purple-100 px-3 py-1.5 rounded-xl shadow-[0_8px_24px_rgba(80,62,38,0.04)] cursor-default">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse ring-2 ring-purple-200"></span>
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700">Realtime Ready</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className={`${cardHoverEffect} min-h-[162px]`}>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-gray-900 text-sm font-extrabold tracking-tight">Success Chance</h3>
                                    <span role="img" aria-label="Realtime value from Firebase" className="text-gray-400 text-xs cursor-help">ⓘ</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 my-auto py-1 xl:gap-5">
                                    <div className="flex min-w-0 flex-col justify-center">
                                        <p className="text-3xl font-black tracking-tight text-green-600 leading-none transition-all duration-500 xl:text-4xl">{displayScore}%</p>
                                        <span className={`text-[9px] font-black tracking-widest px-2 py-0.5 rounded border w-max mt-3 mb-2 ${confidenceMeta.badgeColor}`}>
                                            {confidenceMeta.badge}
                                        </span>
                                        <p className="text-xs text-gray-500 font-semibold leading-normal truncate">{confidenceMeta.text}</p>
                                    </div>
                                    <div className="relative w-[92px] h-[92px] flex items-center justify-center shrink-0">
                                        {ringPulseVersion > 0 && (
                                            <span key={ringPulseVersion} className="dashboard-ring-pulse absolute inset-1 rounded-full pointer-events-none" style={{ backgroundColor: confidenceMeta.hex }}></span>
                                        )}
                                        <svg aria-hidden="true" className="transform -rotate-90 w-full h-full relative z-10" style={{ filter: `drop-shadow(0 0 10px ${confidenceMeta.hex}40)` }}>
                                            <circle cx="46" cy="46" r={ringRadius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100" />
                                            <circle cx="46" cy="46" r={ringRadius} stroke={confidenceMeta.hex} strokeWidth="8" fill="transparent" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center z-20">
                                            <span className="text-lg font-black text-green-600 transition-all duration-500">{displayScore}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={`${cardHoverEffect} min-h-[162px] bg-gradient-to-br from-white to-red-50/30 border-red-100/80 hover:-translate-y-1 hover:shadow-[0_20px_55px_rgba(239,68,68,0.12)]`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-gray-900 text-sm font-extrabold tracking-tight">Today's Focus</h3>
                                    <span role="img" aria-label="Highest priority active task" className="text-red-400/70 text-xs cursor-help">ⓘ</span>
                                </div>
                                <h2 className="text-lg font-black tracking-tight text-gray-950 line-clamp-2 leading-snug">
                                    {focusTask?.title || (onlyRepeatingHabitsRemain ? "Great work. Keep your streak alive." : "You're all caught up.")}
                                </h2>
                                <div className="mt-auto pt-4 flex flex-col items-start justify-between gap-3 xl:flex-row xl:items-center">
                                    {focusTask ? (
                                        <>
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-white text-red-600 border border-red-100 shadow-[0_6px_16px_rgba(239,68,68,0.08)]">
                                                    {focusTask.deadlineDays !== null ? `${focusTask.deadlineDays} Days Left` : "No Deadline"}
                                                </span>
                                                <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black border uppercase tracking-wider ${getPriorityBadgeStyles(focusTask.priority)}`}>
                                                    {focusTask.priority}
                                                </span>
                                                {focusTask.estimatedTime && (
                                                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-white text-gray-500 border border-gray-100">
                                                        {focusTask.estimatedTime}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button type="button" onClick={() => navigate("/tasks")} className="text-[10px] font-black uppercase tracking-[0.18em] text-red-500 bg-red-50 border border-red-100 rounded-full px-2.5 py-1 transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
                                                    Start Focus
                                                </button>
                                                <button type="button" onClick={() => navigate("/tasks")} className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600 bg-purple-50 border border-purple-100 rounded-full px-2.5 py-1 transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300">
                                                    View Full Plan
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <button type="button" onClick={() => navigate("/tasks")} className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600 bg-purple-50 border border-purple-100 rounded-full px-2.5 py-1 transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300">
                                            View Full Plan
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={`${cardHoverEffect} min-h-[162px]`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-base border border-purple-100 shadow-2xs">🤖</div>
                                        <div>
                                            <h3 className="text-gray-900 text-sm font-extrabold flex items-center gap-1.5 leading-none">
                                                AI Coach <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                                            </h3>
                                            <span className="text-[9px] text-gray-400 font-extrabold tracking-wider uppercase mt-0.5 block">From Firebase</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-[#F7F2FF] p-3 rounded-xl border border-purple-100 my-auto flex items-center min-h-[74px]">
                                    <CoachMessage message={aiCoachMessage} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                            <div className={`lg:col-span-7 ${cardHoverEffect} min-h-[250px]`}>
                                <div className="flex items-center justify-between mb-2.5">
                                    <h3 className="text-gray-900 text-base font-bold flex items-center gap-2">🎯 Today's Tasks</h3>
                                    <button type="button" onClick={() => navigate("/tasks")} className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg font-bold tracking-wide text-[10px] transition-all duration-200 flex items-center gap-1.5">
                                        📋 View Full Plan
                                    </button>
                                </div>

                                {totalTaskCount > 0 && (
                                    <div className="mb-3 rounded-xl bg-[#FAF8F4] border border-[#EFE5D9] px-3 py-2">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Task Progress</span>
                                            <span className="text-xs font-bold text-green-600">{completedTaskCount} / {totalTaskCount} Completed</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-1">
                                            <div className={`${confidenceMeta.color} h-1 rounded-full transition-all duration-700 ease-out`} style={{ width: `${progressPercentage}%` }}></div>
                                        </div>
                                    </div>
                                )}

                                {todayTasks.length > 0 ? (
                                    <div className="space-y-2 flex-1 flex flex-col justify-center">
                                        {todayTasks.map((task) => (
                                            <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-gray-100 shadow-[0_4px_14px_rgba(80,62,38,0.03)] transition-all duration-200 group hover:border-purple-100">
                                                <button
                                                    type="button"
                                                    onClick={() => handleCompleteTask(task.id)}
                                                    disabled={syncingTaskId === task.id}
                                                    className="w-3.5 h-3.5 border border-gray-300 rounded cursor-pointer transition-all disabled:cursor-wait disabled:opacity-60 hover:border-green-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300 focus-visible:ring-offset-2"
                                                    aria-label={`Complete ${task.title}`}
                                                />
                                                <span className="text-xs font-bold transition-all duration-200 flex-1 text-gray-800 truncate">{task.title}</span>
                                                <span className={`hidden sm:inline-block px-1.5 py-0.5 border text-[9px] font-extrabold rounded uppercase ${getPriorityBadgeStyles(task.priority)}`}>
                                                    {task.priority}
                                                </span>
                                                <span className="hidden sm:inline-block px-1.5 py-0.5 bg-gray-50 text-gray-400 border border-gray-100 text-[9px] font-extrabold rounded uppercase">
                                                    {task.estimatedTime || "No estimate"}
                                                </span>
                                                {task.isRepeating && (
                                                    <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 text-[9px] font-extrabold rounded uppercase">
                                                        {task.currentCount}/{task.targetCount || "?"}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-xl border border-gray-100 border-dashed p-6">
                                        <p className="text-xs text-gray-400 font-bold">
                                            {onlyRepeatingHabitsRemain ? "🌱 Great work. Keep your streak alive." : "You're all caught up."}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className={`lg:col-span-5 ${cardHoverEffect} min-h-[250px]`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center">
                                            <CalendarDays className="w-4 h-4" aria-hidden="true" />
                                        </span>
                                        <div>
                                            <h3 className="text-gray-900 text-sm font-black leading-tight">Smart Calendar</h3>
                                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-400">{calendarMeta.label}</p>
                                        </div>
                                    </div>
                                    <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[10px] font-black text-orange-600">
                                        🔥 {currentStreak} day streak
                                    </span>
                                </div>

                                <div className="grid grid-cols-7 gap-x-1 gap-y-0.5 flex-1">
                                    {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                                        <span key={`${day}-${index}`} className="h-5 text-center text-[9px] font-black text-gray-400">
                                            {day}
                                        </span>
                                    ))}
                                    {calendarMeta.days.map((day, index) => {
                                        const isToday = day === calendarMeta.today;
                                        const hasDeadline = day !== null && calendarMeta.deadlineDays.has(day);
                                        return (
                                            <div key={index} className="relative h-6 flex items-center justify-center">
                                                {day !== null && (
                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold transition-colors ${
                                                        isToday
                                                            ? "bg-purple-600 text-white shadow-[0_5px_14px_rgba(147,51,234,0.28)]"
                                                            : "text-gray-600 hover:bg-purple-50"
                                                    }`}>
                                                        {day}
                                                    </span>
                                                )}
                                                {hasDeadline && (
                                                    <span className={`absolute bottom-0 w-1 h-1 rounded-full ${isToday ? "bg-white" : "bg-red-500"}`}></span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-2 flex items-center justify-between border-t border-[#EFE5D9] pt-2">
                                    <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                        Upcoming deadline
                                    </span>
                                    <span className="text-[10px] font-black text-green-600">{completedTaskCount} completed</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                            <div className={`lg:col-span-7 ${cardHoverEffect} min-h-[250px]`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-gray-900 text-sm font-bold flex items-center gap-1.5">⏳ Upcoming Deadlines</h3>
                                    <button type="button" className="text-purple-600 text-[11px] font-bold hover:underline" onClick={() => navigate("/tasks")}>View All</button>
                                </div>
                                <div className="space-y-2.5 flex-1 flex flex-col justify-center">
                                    {upcomingDeadlines.length > 0 ? upcomingDeadlines.map((item) => {
                                        const dateData = getFutureDate(item.deadlineDays);
                                        return (
                                            <div key={item.id} className="p-3.5 bg-[#FFFCF8] rounded-2xl border border-[#EFE5D9] hover:border-purple-100 transition-colors shadow-[0_8px_24px_rgba(80,62,38,0.04)]">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col items-center justify-center w-12 h-12 bg-white rounded-xl border border-red-100 text-gray-900 shrink-0 shadow-[0_8px_20px_rgba(239,68,68,0.06)]">
                                                        <span className="text-[8px] font-black uppercase text-red-400">{dateData.month}</span>
                                                        <span className="text-lg font-black leading-none mt-0.5">{dateData.day}</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-black text-gray-950 truncate">{item.title}</h4>
                                                        <p className="text-[11px] font-bold text-gray-400 mt-0.5">{item.priority} priority</p>
                                                    </div>
                                                    <div className="w-20 shrink-0 sm:w-[170px]">
                                                        <p className={`text-[11px] font-black text-right ${getDeadlineStackStyles(item.deadlineDays)}`}>
                                                            {item.deadlineDays} {item.deadlineDays === 1 ? "Day" : "Days"} Left
                                                        </p>
                                                        <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                            <div className={`h-1.5 rounded-full ${getDeadlineBarStyles(item.deadlineDays)}`} style={{ width: `${Math.max(18, 100 - Math.min(100, item.deadlineDays * 10))}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-xl border border-gray-100 border-dashed p-6">
                                            <p className="text-xs text-gray-400 font-bold">No upcoming deadlines.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className={`lg:col-span-5 ${cardHoverEffect} min-h-[250px]`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-gray-900 text-base font-bold flex items-center gap-2">✅ Completed Today</h3>
                                    <span className="text-purple-600 text-[11px] font-bold">{completedTaskCount}</span>
                                </div>
                                <div className="relative pl-2 flex-1 flex flex-col justify-around space-y-2.5 my-1">
                                    <div className="absolute top-2 bottom-2 left-3 w-px bg-gray-100"></div>
                                    {completedTasks.slice(0, 5).map((item) => (
                                        <div key={item.id} className="relative flex items-center gap-3.5 z-10">
                                            <div className="w-2 h-2 rounded-full ring-[5px] ring-white shrink-0 bg-green-500"></div>
                                            <div className="flex-1 flex justify-between items-center bg-white rounded min-w-0 gap-2">
                                                <span className="text-xs font-bold truncate transition-colors text-gray-400 line-through font-medium">{item.title}</span>
                                                <span className="text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider shrink-0 min-w-[78px] text-center bg-green-50 text-green-600">Done</span>
                                            </div>
                                        </div>
                                    ))}
                                    {completedTasks.length === 0 && (
                                        <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-100 bg-gray-50 p-6">
                                            <p className="text-xs text-gray-400 font-bold">No tasks completed yet.</p>
                                        </div>
                                    )}
                                </div>
                                <button type="button" onClick={() => navigate("/tasks")} className="w-full mt-3 py-2 bg-[#FAF8F4] hover:bg-purple-50 text-gray-700 hover:text-purple-700 rounded-xl font-bold text-[11px] transition-colors flex items-center justify-center gap-1 shrink-0">
                                    View Full Plan →
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Dashboard;

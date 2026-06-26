import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import MainLayout from "../components/layout/MainLayout";

function TaskBoard() {
    // =====================================
    // FLOWMIND AI TASK BOARD
    // Status: TASK BOARD = FINAL SYNC LOCKED 🔒
    // Integration: Save My Day + Dashboard Sync + Interactive Subtasks
    // =====================================

    // Core Functional States
    const [nlInput, setNlInput] = useState("");
    const [aiState, setAiState] = useState(null); // null | "recalculating" | "success"
    const [filter, setFilter] = useState("All");

    // NEW: Save My Day Highlights
    const [todayPlanTasks, setTodayPlanTasks] = useState([]);

    // Hydrate "Today's Plan" highlights from Save My Day (flowmind_today_plan)
    useEffect(() => {
        const smdPlan = localStorage.getItem("flowmind_today_plan");
        if (smdPlan) {
            try {
                const parsed = JSON.parse(smdPlan);
                if (Array.isArray(parsed.strictlyDoToday)) {
                    // Extract just the task titles to match against our board tasks
                    const titles = parsed.strictlyDoToday.map(t => typeof t === 'string' ? t : t.task);
                    setTodayPlanTasks(titles);
                }
            } catch (e) {
                console.error("Failed to parse flowmind_today_plan for TaskBoard", e);
            }
        }
    }, []);

    // Task Database 
    // Point 1 & 2: Subtasks are now objects with `completed` states.
    const [tasks, setTasks] = useState([
        {
            id: 1,
            title: "AQI Project",
            priority: "High",
            deadlineDays: 5,
            estimatedTime: "4 Hours",
            timeBlock: "10:00 AM - 2:00 PM",
            category: "Project",
            status: "To Do",
            subtasks: [
                { id: "s1", title: "Research", completed: false },
                { id: "s2", title: "Documentation", completed: false },
                { id: "s3", title: "PPT", completed: false },
                { id: "s4", title: "Testing", completed: false },
                { id: "s5", title: "Final Review", completed: false }
            ],
            gain: 8
        },
        {
            id: 2,
            title: "Homework Submission",
            priority: "High",
            deadlineDays: 1,
            estimatedTime: "2 Hours",
            timeBlock: "3:00 PM - 5:00 PM",
            category: "Academics",
            status: "In Progress",
            // Empty subtasks -> AI Plan section completely hidden
            subtasks: [], 
            gain: 8
        },
        {
            id: 3,
            title: "Deloitte Preparation",
            priority: "Medium",
            deadlineDays: 15,
            estimatedTime: "1 Hour",
            timeBlock: "6:00 PM - 7:00 PM",
            category: "Placement",
            status: "To Do",
            subtasks: [
                { id: "s6", title: "Quant Mock Test", completed: false },
                { id: "s7", title: "Logical Reasoning Review", completed: false }
            ],
            gain: 3
        }
    ]);

    const priorityWeights = { HIGH: 3, MEDIUM: 2, LOW: 1 };

    // Dashboard Sync Helper (Point 4)
    // Synchronizes progress to master plan confidence score without page refresh
    const syncProgressToDashboard = (updatedTasks) => {
        const completedCount = updatedTasks.filter(t => t.status === "Completed").length;
        const masterPlan = localStorage.getItem("flowmind_plan");
        if (masterPlan) {
            try {
                let parsed = JSON.parse(masterPlan);
                // Artificially bump confidence score in background
                parsed.confidenceScore = Math.min(100, (parsed.confidenceScore || 60) + (completedCount * 3));
                localStorage.setItem("flowmind_plan", JSON.stringify(parsed));
            } catch (e) {
                console.error("Dashboard sync failed", e);
            }
        }
    };

    // Header Metrics Engine
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === "Completed").length;
    const progressPercent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    const getProgressStatus = (pct, count) => {
        if (count === 0) return { label: "GET STARTED", color: "bg-purple-500/15 text-purple-400 border-purple-500/30", bar: "bg-purple-500" };
        if (pct >= 80) return { label: "ON TRACK", color: "bg-green-500/15 text-green-400 border-green-500/20", bar: "bg-green-500" };
        if (pct >= 50) return { label: "AT RISK", color: "bg-amber-500/15 text-amber-400 border-amber-500/20", bar: "bg-amber-500" };
        return { label: "CRITICAL", color: "bg-red-500/15 text-red-400 border-red-500/20", bar: "bg-red-500" };
    };

    const currentProgressStatus = getProgressStatus(progressPercent, completedTasks);

    // AI Recalculating trigger (approx 2 seconds)
    const triggerRecalculation = (isCompletion = false) => {
        setAiState("recalculating");
        setTimeout(() => {
            if (isCompletion) {
                setAiState("success");
                setTimeout(() => setAiState(null), 2000);
            } else {
                setAiState(null);
            }
        }, 1800); // Set near 2 seconds as requested
    };

    const moveTask = (taskId, newStatus) => {
        const updated = tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t);
        setTasks(updated);
        triggerRecalculation(newStatus === "Completed");
        syncProgressToDashboard(updated);
    };

    // Subtask Interactivity Engine (Points 1 & 2 & 5)
    const toggleSubtask = (taskId, subtaskId) => {
        setTasks(prev => prev.map(t => {
            if (t.id === taskId) {
                const updatedSubtasks = t.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
                return { ...t, subtasks: updatedSubtasks };
            }
            return t;
        }));
        // Trigger AI logic on subtask change
        triggerRecalculation(false);
    };
    const handleNLSubmit = (e) => {
        e.preventDefault();
        if (!nlInput.trim()) return;
        
        triggerRecalculation(false);

        setTimeout(() => {
            const lowerInput = nlInput.toLowerCase();
            const isComplex = lowerInput.includes("project") || lowerInput.includes("prep") || lowerInput.includes("exam");
            
            const autoGeneratedSubtasks = isComplex 
                ? [
                    { id: Date.now() + 1, title: "Research & Scope", completed: false },
                    { id: Date.now() + 2, title: "Core Implementation", completed: false },
                    { id: Date.now() + 3, title: "Draft Review", completed: false },
                    { id: Date.now() + 4, title: "Final QA & Submit", completed: false }
                  ] 
                : [];

            const newTask = {
                id: Date.now(),
                title: nlInput.split(" due")[0] || "New AI Task",
                priority: lowerInput.includes("urgent") ? "High" : "Medium",
                deadlineDays: lowerInput.includes("tomorrow") ? 1 : (lowerInput.includes("friday") ? 3 : 5),
                estimatedTime: lowerInput.includes("hours") ? "4 Hours" : "2 Hours",
                timeBlock: "Flexible Block",
                category: lowerInput.includes("project") ? "Project" : "Academics",
                status: "To Do",
                subtasks: autoGeneratedSubtasks,
                gain: isComplex ? 6 : 3
            };

            const updatedTasks = [newTask, ...tasks];
            setTasks(updatedTasks);
            setNlInput("");
            syncProgressToDashboard(updatedTasks);
        }, 800);
    };

    const recommendedAction = useMemo(() => {
        const pending = tasks.filter(t => t.status !== "Completed");
        if (pending.length === 0) return null;
        return [...pending].sort((a, b) => {
            if (a.deadlineDays !== b.deadlineDays) return a.deadlineDays - b.deadlineDays;
            return (priorityWeights[b.priority.toUpperCase()] || 0) - (priorityWeights[a.priority.toUpperCase()] || 0);
        })[0];
    }, [tasks]);

    const location = useLocation();

    useEffect(() => {
        if (location && location.state && location.state.highlight) {
            const title = location.state.highlight;
            try {
                const safe = title.replace(/"/g, '\\"');
                const selector = `[data-task-title="${safe}"]`;
                const el = document.querySelector(selector);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('ring-2', 'ring-yellow-400', 'ring-offset-2');
                    setTimeout(() => {
                        el.classList.remove('ring-2', 'ring-yellow-400', 'ring-offset-2');
                    }, 4000);
                }
            } catch (e) {
                console.error('Highlight scroll failed', e);
            }
        }
    }, [location, tasks]);

    const getDeadlineColor = (days) => {
        if (days <= 2) return "text-red-400 font-bold";
        if (days <= 7) return "text-amber-400 font-semibold";
        return "text-green-400";
    };

    const getGainBadgeStyles = (gain) => {
        if (gain >= 5) return "bg-green-500/10 text-green-400 border-green-500/20";
        if (gain >= 3) return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
        return "bg-zinc-800 text-zinc-400 border-zinc-700";
    };

    const getPriorityStyles = (priority) => {
        const p = priority.toUpperCase();
        if (p === "HIGH") return "bg-red-500/10 text-red-400 border-red-500/20";
        if (p === "MEDIUM") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
        return "bg-green-500/10 text-green-400 border-green-500/20";
    };

    const getCategoryStyles = (category) => {
        const c = category.toLowerCase();
        if (c === "project") return "bg-purple-500/10 text-purple-400 border-purple-500/20";
        if (c === "placement") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
        return "bg-green-500/10 text-green-400 border-green-500/20";
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-[#09090B] text-white space-y-6 p-4 md:p-6 pb-12 relative select-none">
                
                {/* AI Recalculating Overlay & Success Toast */}
                {aiState === "recalculating" && (
                    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-purple-600 text-white px-6 py-2.5 rounded-full shadow-lg shadow-purple-600/30 border border-purple-400 animate-pulse flex items-center gap-2.5">
                        <span className="text-sm">⚡</span>
                        <span className="font-bold tracking-wide uppercase text-xs">AI Recalculating...</span>
                    </div>
                )}
                
                {aiState === "success" && (
                    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#18181B] text-white px-6 py-3 rounded-xl shadow-xl shadow-green-950/40 border border-green-500 flex items-center gap-3 animate-bounce">
                        <span className="text-xl">✅</span>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-green-400">Task Completed</p>
                            <p className="text-[10px] text-zinc-400">Confidence Score Updated</p>
                        </div>
                    </div>
                )}

                {/* Section 1: Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-[#18181B] rounded-xl border border-[#27272A] gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Task Board</h1>
                        <p className="text-sm text-zinc-400 mt-1">Manage and execute your AI-generated plan.</p>
                    </div>
                    
                    {/* Execution Progress Badge */}
                    <div className="bg-[#09090B] border border-[#27272A] rounded-xl p-4 min-w-[280px]">
                        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Execution Progress</h3>
                        <div className="flex items-end gap-3 mb-1">
                            <span className="text-3xl font-black text-white leading-none">{progressPercent}%</span>
                            <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded border transition-all duration-300 ${currentProgressStatus.color}`}>
                                {currentProgressStatus.label}
                            </span>
                        </div>
                        <p className="text-xs text-zinc-400 font-medium mb-3">{completedTasks} / {totalTasks} Tasks Completed</p>
                        <div className="w-full bg-zinc-800 rounded-full h-1.5">
                            <div className={`${currentProgressStatus.bar} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${progressPercent}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Section 2: Smart NLP Input */}
                <form onSubmit={handleNLSubmit} className="relative">
                    <input 
                        type="text" 
                        placeholder="Try typing: 'AQI project due Friday 4 hours' vs 'Homework due tomorrow'..."
                        value={nlInput}
                        onChange={(e) => setNlInput(e.target.value)}
                        className="w-full bg-[#18181B] border border-[#27272A] rounded-xl p-4 pr-32 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <button 
                        type="submit"
                        disabled={aiState === "recalculating" || !nlInput.trim()}
                        className="absolute right-2 top-2 bottom-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold px-4 rounded-lg transition-colors"
                    >
                        Generate Task
                    </button>
                </form>

                {/* Section 3: Dynamic Recommendation Alert */}
                {recommendedAction && (
                    <div className="p-5 bg-gradient-to-r from-[#18181B] to-purple-950/10 rounded-xl border border-purple-500/20 shadow-lg shadow-purple-900/5">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-purple-400 text-lg">🤖</span>
                            <h3 className="text-purple-400 text-xs font-black uppercase tracking-widest">AI Recommended Action</h3>
                        </div>
                        <h4 className="text-xl font-bold text-white mb-2">Complete {recommendedAction.title}</h4>
                        <p className="text-sm text-zinc-400 border-l-2 border-purple-500 pl-3">
                            <span className="font-semibold text-zinc-300">Reason:</span> Deadline in {recommendedAction.deadlineDays} days and highest impact task currently pending.
                        </p>
                    </div>
                )}

                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                    {["All", "High Priority", "Today", "Overdue", "Completed"].map(f => (
                        <button 
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                filter === f 
                                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20" 
                                : "bg-[#18181B] text-zinc-400 border border-[#27272A] hover:text-white"
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* Sorted Kanban Columns */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {["To Do", "In Progress", "Completed"].map(columnStatus => {
                        
                        const columnTasks = tasks
                            .filter(t => {
                                if (filter === "All") return t.status === columnStatus;
                                if (filter === "High Priority") return t.status === columnStatus && t.priority === "High";
                                if (filter === "Completed") return t.status === "Completed" && columnStatus === "Completed";
                                if (filter === "Today" || filter === "Overdue") return t.status === columnStatus && t.deadlineDays <= 1;
                                return t.status === columnStatus;
                            })
                            .sort((a, b) => (priorityWeights[b.priority.toUpperCase()] || 0) - (priorityWeights[a.priority.toUpperCase()] || 0));

                        return (
                            <div key={columnStatus} className="bg-[#18181B]/50 rounded-xl p-4 border border-[#27272A]/50 min-h-[500px] flex flex-col">
                                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-4 flex items-center justify-between">
                                    <span>{columnStatus} <span className="text-purple-400 font-mono">({columnTasks.length})</span></span>
                                </h3>

                                <div className="space-y-4 flex-1">
                                    {/* Empty State */}
                                    {columnTasks.length === 0 && (
                                        <div className="h-48 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-[#27272A] rounded-xl opacity-50">
                                            {columnStatus === "Completed" ? (
                                                <>
                                                    <p className="text-sm font-bold text-zinc-200 mb-1">✅ No completed tasks yet</p>
                                                    <p className="text-xs text-zinc-400 max-w-[220px] leading-relaxed">Complete your first task to improve your confidence score.</p>
                                                </>
                                            ) : (
                                                <p className="text-xs font-bold text-zinc-500">No tasks currently processing.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Render Task Cards */}
                                    {columnTasks.map(task => {
                                        // Save My Day Integration checking
                                        const isTodayPlan = todayPlanTasks.includes(task.title);

                                        return (
                                            <div 
                                                key={task.id}
                                                data-task-title={task.title}
                                                className={`bg-[#09090B] p-4 rounded-xl border transition-all duration-200 hover:border-purple-500/50 hover:shadow-[0_0_15px_-3px_rgba(168,85,247,0.15)] ${
                                                    task.status === "Completed" ? "opacity-50 border-[#27272A]" : (isTodayPlan ? "border-purple-500/50 shadow-[0_0_15px_-3px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/20" : "border-[#27272A]")
                                                }`}
                                            >
                                                {/* Header With "Save My Day" Badge */}
                                                <div className="mb-2 flex justify-between items-start gap-2">
                                                    <h4 className={`font-bold text-sm ${task.status === "Completed" ? "line-through text-zinc-500" : "text-zinc-100"}`}>
                                                        {task.title}
                                                    </h4>
                                                    {isTodayPlan && task.status !== "Completed" && (
                                                        <span className="bg-purple-600 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shadow-sm shadow-purple-500/40 whitespace-nowrap">
                                                            Today's Plan
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-2 mb-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase ${getPriorityStyles(task.priority)}`}>
                                                        {task.priority}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryStyles(task.category)}`}>
                                                        {task.category}
                                                    </span>
                                                </div>

                                                <div className="space-y-2 mb-4 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-4 text-center">⏳</span>
                                                        <span className={getDeadlineColor(task.deadlineDays)}>
                                                            {task.deadlineDays} Days Remaining
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-4 text-center">⏱️</span>
                                                        <span className="text-zinc-300">{task.estimatedTime}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-4 text-center text-purple-400">🤖</span>
                                                        <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-medium">
                                                            🕒 {task.timeBlock}
                                                        </span>
                                                    </div>
                                                    
                                                    {task.status !== "Completed" && (
                                                        <div className="pt-1">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getGainBadgeStyles(task.gain)}`}>
                                                                +{task.gain}% Confidence Gain
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Point 1 & 2: Conditionally render AI Generated Plan with Progress Bar */}
                                                {task.subtasks && task.subtasks.length > 0 && (
                                                    <div className="mb-4 pt-3 border-t border-[#27272A] space-y-2 bg-purple-950/10 -mx-4 p-4 border-y border-purple-500/10">
                                                        <div className="flex items-center gap-1.5 mb-3">
                                                            <span className="text-xs">🤖</span>
                                                            <span className="text-xs font-bold text-purple-400 tracking-wide uppercase">AI Generated Plan</span>
                                                        </div>

                                                        {/* Subtask Progress Math */}
                                                        {(() => {
                                                            const completedSubs = task.subtasks.filter(s => s.completed).length;
                                                            const totalSubs = task.subtasks.length;
                                                            const subProgress = Math.round((completedSubs / totalSubs) * 100);

                                                            return (
                                                                <div className="mb-3">
                                                                    <div className="flex justify-between items-center text-[10px] font-bold text-purple-300 mb-1.5">
                                                                        <span>{completedSubs}/{totalSubs} Completed</span>
                                                                        <span>{subProgress}%</span>
                                                                    </div>
                                                                    <div className="w-full bg-purple-950/50 rounded-full h-1.5 overflow-hidden border border-purple-900/30">
                                                                        <div className="bg-purple-500 h-1.5 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(168,85,247,0.8)]" style={{ width: `${subProgress}%` }}></div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Subtasks Checklists */}
                                                        <ul className="space-y-2.5 pt-2">
                                                            {task.subtasks.map((sub) => (
                                                                <li 
                                                                    key={sub.id} 
                                                                    className="flex items-start gap-2.5 cursor-pointer group"
                                                                    onClick={() => toggleSubtask(task.id, sub.id)}
                                                                >
                                                                    <div className={`w-4 h-4 rounded mt-0.5 border flex items-center justify-center shrink-0 transition-colors ${
                                                                        sub.completed ? 'bg-purple-500 border-purple-500 text-white' : 'bg-[#09090B] border-purple-500/30 group-hover:border-purple-400'
                                                                    }`}>
                                                                        {sub.completed && <span className="text-[10px] font-bold">✓</span>}
                                                                    </div>
                                                                    <span className={`text-xs font-medium transition-all ${
                                                                        sub.completed ? 'line-through text-zinc-500 italic' : 'text-zinc-200'
                                                                    }`}>
                                                                        {sub.title}
                                                                    </span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Action Buttons */}
                                                <div className="flex gap-2 pt-2">
                                                    {task.status !== "To Do" && (
                                                        <button onClick={() => moveTask(task.id, "To Do")} className="flex-1 bg-[#18181B] hover:bg-zinc-800 text-zinc-400 text-[10px] font-bold py-1.5 rounded transition">
                                                            To Do
                                                        </button>
                                                    )}
                                                    {task.status !== "In Progress" && (
                                                        <button onClick={() => moveTask(task.id, "In Progress")} className="flex-1 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 text-[10px] font-bold py-1.5 rounded transition">
                                                            In Progress
                                                        </button>
                                                    )}
                                                    {task.status !== "Completed" && (
                                                        <button onClick={() => moveTask(task.id, "Completed")} className="flex-1 bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/20 text-[10px] font-bold py-1.5 rounded transition">
                                                            Complete
                                                        </button>
                                                    )}
                                                </div>

                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
        </MainLayout>
    );
}

export default TaskBoard;
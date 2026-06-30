
                        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
                            {[
                                { icon: "🎓", label: "Placement Preparation", prompt: "I have Deloitte OA in 15 days, need to practice DSA arrays and logical reasoning. I have 3 hours today." },
                                { icon: "📚", label: "Semester Project", prompt: "I need to complete the AQI project documentation and frontend integration by tomorrow. Available for 5 hours." },
                                { icon: "💼", label: "Internship Roadmap", prompt: "I need to update my resume and apply for 3 frontend internships today. I have 4 hours available." },
                                { icon: "🏃", label: "Personal Goals", prompt: "I want to start learning Spanish and go for a 5k run today. I have 2 hours of free time." }
                            ].map((chip, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setPrompt(chip.prompt)}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E9DFD3] rounded-full text-xs font-bold text-gray-600 hover:text-purple-700 hover:border-purple-200 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                                >
                                    <span className="text-sm">{chip.icon}</span> {chip.label}
                                </button>
                            ))}
                        </div>
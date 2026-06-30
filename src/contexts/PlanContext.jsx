// src/contexts/PlanContext.jsx
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { subscribeToPlan, savePlan } from "../services/firebaseService";

const PlanContext = createContext();

export const PlanProvider = ({ children }) => {
    const [plan, setPlan] = useState(null);
    const [loadingPlan, setLoadingPlan] = useState(true);

    useEffect(() => {
        const unsubscribe = subscribeToPlan((realtimePlan) => {
            setPlan(realtimePlan);
            setLoadingPlan(false);
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    // Centralized mutation engine for optimistic UI updates
    const updatePlan = useCallback(async (updates) => {
        // Optimistically update local state immediately
        setPlan((prev) => {
            const nextPlan = { ...prev, ...updates };
            return nextPlan;
        });

        // Persist to Firebase
        try {
            const currentPlan = plan || {};
            await savePlan({ ...currentPlan, ...updates });
        } catch (error) {
            console.error("Failed to sync plan update:", error);
        }
    }, [plan]);

    return (
        <PlanContext.Provider value={{ plan, loadingPlan, updatePlan }}>
            {children}
        </PlanContext.Provider>
    );
};

export const usePlan = () => useContext(PlanContext);
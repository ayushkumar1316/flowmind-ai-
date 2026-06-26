import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection } from "firebase/firestore";

// =====================================
// FIREBASE CONFIGURATION
// Using environment variables or inline config
// =====================================
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDWP-xYZ1234567890abcdefghijklmnop",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "flowmind-app.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "flowmind-app",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "flowmind-app.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789012",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789012:web:abcdef1234567890"
};

// Initialize Firebase ONCE at module load time
let db = null;
let isInitialized = false;

try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    isInitialized = true;
    console.log("✅ Firebase initialized successfully (firebaseService.js)");
} catch (error) {
    console.error("❌ Firebase initialization error:", error);
}

/**
 * Generate or retrieve sessionId from localStorage
 * Used to uniquely identify each user session for plan storage
 */
const getOrCreateSessionId = () => {
    const SESSION_ID_KEY = "flowmind_sessionId";
    let sessionId = localStorage.getItem(SESSION_ID_KEY);

    if (!sessionId) {
        // Generate a new sessionId on first visit
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem(SESSION_ID_KEY, sessionId);
        console.log("🆔 New sessionId created:", sessionId);
    } else {
        console.log("🆔 SessionId retrieved:", sessionId);
    }

    return sessionId;
};

/**
 * savePlan - Hybrid storage: saves to Firestore + localStorage simultaneously
 * Firestore is primary, localStorage is cache/fallback
 * 
 * @param {Object} planData - The plan object from Gemini API
 * @returns {Promise<boolean>} - True if save was successful, false otherwise
 */
export const savePlan = async (planData) => {
    if (!planData) {
        console.warn("⚠️ savePlan called with null/undefined planData");
        return false;
    }

    if (!isInitialized || !db) {
        console.warn("⚠️ Firebase not initialized");
        return false;
    }

    const sessionId = getOrCreateSessionId();
    const timestamp = new Date().toISOString();

    try {
        // Save to localStorage immediately (synchronous, always works)
        localStorage.setItem("flowmind_plan", JSON.stringify(planData));
        localStorage.setItem("flowmind_plan_timestamp", timestamp);
        console.log("💾 Plan saved to localStorage");

        // Try to save to Firestore (asynchronous)
        const planRef = doc(db, "plans", sessionId);
        await setDoc(planRef, {
            ...planData,
            sessionId: sessionId,
            savedAt: timestamp,
            updatedAt: timestamp
        });

        console.log("🔥 Plan saved to Firestore successfully");
        return true;

    } catch (error) {
        console.error("❌ Error saving plan:", error);
        // Even if Firestore fails, localStorage has the data
        console.log("📍 Fallback: Plan is saved in localStorage");
        return true; // Graceful fallback
    }
};

/**
 * loadPlan - Hybrid retrieval: attempts Firestore first, falls back to localStorage
 * 
 * @returns {Promise<Object|null>} - The plan object or null if not found
 */
export const loadPlan = async () => {
    if (!isInitialized || !db) {
        console.warn("⚠️ Firebase not initialized, using localStorage only");
        // Still try localStorage
        try {
            const localPlan = localStorage.getItem("flowmind_plan");
            if (localPlan) {
                const parsedPlan = JSON.parse(localPlan);
                console.log("💾 Plan loaded from localStorage (cache/fallback)");
                return parsedPlan;
            }
        } catch (error) {
            console.error("❌ Error parsing localStorage plan:", error);
        }
        return null;
    }

    const sessionId = getOrCreateSessionId();

    try {
        // Try Firestore first (primary source)
        const planRef = doc(db, "plans", sessionId);
        const snapshot = await getDoc(planRef);

        if (snapshot.exists()) {
            const firestorePlan = snapshot.data();
            console.log("🔥 Plan loaded from Firestore");
            
            // Update localStorage with fresh Firestore data
            localStorage.setItem("flowmind_plan", JSON.stringify(firestorePlan));
            localStorage.setItem("flowmind_plan_timestamp", firestorePlan.updatedAt);
            
            return firestorePlan;
        } else {
            console.log("📍 No plan found in Firestore, checking localStorage...");
        }

    } catch (error) {
        console.error("⚠️ Firestore retrieval error:", error);
        console.log("📍 Falling back to localStorage...");
    }

    // Fallback to localStorage
    try {
        const localPlan = localStorage.getItem("flowmind_plan");
        if (localPlan) {
            const parsedPlan = JSON.parse(localPlan);
            console.log("💾 Plan loaded from localStorage (cache/fallback)");
            return parsedPlan;
        }
    } catch (error) {
        console.error("❌ Error parsing localStorage plan:", error);
    }

    console.log("ℹ️ No plan found anywhere");
    return null;
};

/**
 * Utility: Get storage status (for debugging)
 */
export const getStorageStatus = async () => {
    const sessionId = getOrCreateSessionId();
    
    const localPlan = localStorage.getItem("flowmind_plan");
    let firestorePlan = null;

    try {
        if (isInitialized && db) {
            const planRef = doc(db, "plans", sessionId);
            const snapshot = await getDoc(planRef);
            if (snapshot.exists()) {
                firestorePlan = snapshot.data();
            }
        }
    } catch (error) {
        console.error("❌ Error checking Firestore status:", error);
    }

    return {
        sessionId,
        hasLocalStorage: !!localPlan,
        hasFirestore: !!firestorePlan,
        firebaseInitialized: isInitialized,
        firebaseAvailable: db !== null
    };
};

// Export db instance for use in other services
export { db, isInitialized };

// src/services/firebaseService.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const isInitialized = true;

const getOrCreateSessionId = () => {
    const SESSION_ID_KEY = "flowmind_sessionId";
    let sessionId = localStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    return sessionId;
};

export const savePlan = async (planData) => {
    if (!planData || !isInitialized || !db) return false;

    const sessionId = getOrCreateSessionId();
    const timestamp = new Date().toISOString();

    try {
        const planRef = doc(db, "plans", sessionId);
        
        // Clean undefined values
        const cleanedPlanData = {};
        Object.keys(planData).forEach(key => {
            if (planData[key] !== null && planData[key] !== undefined) {
                cleanedPlanData[key] = planData[key];
            }
        });

        const mergedPlan = {
            ...cleanedPlanData,
            sessionId: sessionId,
            updatedAt: timestamp
        };

        // Write directly to Firestore - onSnapshot will handle local sync
        await setDoc(planRef, mergedPlan, { merge: true });
        return true;
    } catch (error) {
        console.error("❌ Error saving plan:", error);
        return false;
    }
};

export const loadPlan = async () => {
    if (!isInitialized || !db) return null;
    const sessionId = getOrCreateSessionId();
    try {
        const planRef = doc(db, "plans", sessionId);
        const snapshot = await getDoc(planRef);
        if (snapshot.exists()) return snapshot.data();
    } catch (error) {
        console.error("⚠️ Firestore retrieval error:", error);
    }
    return null;
};

export const subscribeToPlan = (callback) => {
    if (!isInitialized || !db) return null;

    const sessionId = getOrCreateSessionId();
    const planRef = doc(db, "plans", sessionId);

    const unsubscribe = onSnapshot(planRef, (snapshot) => {
        if (snapshot.exists()) {
            const firestorePlan = snapshot.data();
            localStorage.setItem("flowmind_plan", JSON.stringify(firestorePlan));
            if (callback) callback(firestorePlan);
        } else {
            if (callback) callback(null);
        }
    }, (error) => {
        console.error("❌ Realtime subscription error:", error);
    });

    return unsubscribe;
};

export { app, auth, db, isInitialized };
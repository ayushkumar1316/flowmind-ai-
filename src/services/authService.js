import { 
    signInWithPopup, 
    GoogleAuthProvider, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

// ONLY import the shared instances from your central firebaseService
import { auth, db } from "./firebaseService";

const googleProvider = new GoogleAuthProvider();

// Generate readable username from display name
const generateUsername = (name) => {
    if (!name) return `user-${Math.floor(Math.random() * 10000)}`;
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);
};

export const checkAndUpdateStreak = async (uid, currentStats) => {
    const today = new Date().toLocaleDateString('en-CA'); // Local YYYY-MM-DD
    const stats = currentStats || { currentStreak: 1, bestStreak: 1, lastActiveDate: today, createdAt: new Date().toISOString() };

    if (stats.lastActiveDate === today) return stats; // Already logged in today

    const lastActive = new Date(stats.lastActiveDate);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const isYesterday = lastActive.toLocaleDateString('en-CA') === yesterday.toLocaleDateString('en-CA');

    const newCurrent = isYesterday ? (stats.currentStreak || 0) + 1 : 1;
    const newBest = Math.max(newCurrent, stats.bestStreak || 1);

    const newStats = { 
        ...stats,
        currentStreak: newCurrent, 
        bestStreak: newBest, 
        lastActiveDate: today 
    };

    await setDoc(doc(db, "users", uid), { stats: newStats }, { merge: true });
    return newStats;
};

const syncUserProfile = async (user, additionalData = {}) => {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    const isNewUser = !userSnap.exists();
    let profileCompleted = false;

    const displayName = user.displayName || additionalData.displayName || "User";

    if (!isNewUser) {
        profileCompleted = userSnap.data().profileCompleted ?? false;
    }

    const userData = {
        displayName: displayName,
        username: isNewUser ? generateUsername(displayName) : (userSnap.data().username || generateUsername(displayName)),
        email: user.email,
        photoURL: user.photoURL || null,
        uid: user.uid,
        lastLogin: serverTimestamp(),
        ...(isNewUser ? { createdAt: serverTimestamp(), profileCompleted: false } : {}),
        ...additionalData
    };

    await setDoc(userRef, userData, { merge: true });
    
    return { ...userData, profileCompleted: isNewUser ? false : profileCompleted };
};

export const signInWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return await syncUserProfile(result.user);
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        throw error;
    }
};

export const emailLogin = async (email, password) => {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return await syncUserProfile(result.user);
    } catch (error) {
        console.error("Email Login Error:", error);
        throw error;
    }
};

export const emailSignUp = async (email, password, displayName) => {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        return await syncUserProfile(result.user, { displayName });
    } catch (error) {
        console.error("Email Sign-Up Error:", error);
        throw error;
    }
};

export const logoutUser = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        throw error;
    }
};

export const getUserProfile = async (uid) => {
    try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        return userSnap.exists() ? userSnap.data() : null;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        throw error;
    }
};

export const checkAuthState = (callback) => {
    return onAuthStateChanged(auth, callback);
};

export const completeUserSetup = async (uid, profileData) => {
    try {
        const userRef = doc(db, "users", uid);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const locale = navigator.language || "en-US";

        await setDoc(userRef, {
            profileCompleted: true,
            aiReady: true,
            onboardingVersion: 1,
            timezone: timezone,
            locale: locale,
            profile: {
                name: profileData.name,
                occupation: profileData.occupation,
                goal: profileData.goal,
                availableHours: Number(profileData.availableHours),
                preferredWorkTime: profileData.preferredWorkTime,
                updatedAt: serverTimestamp()
            }
        }, { merge: true });

        return true;
    } catch (error) {
        console.error("Error updating profile:", error);
        throw error;
    }
};
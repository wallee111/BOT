// Authentication module for the app
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithRedirect,
    signInWithPopup,
    getRedirectResult,
    signOut,
} from 'firebase/auth';
import { app } from './firebase.js';
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

// Detect if running on Capacitor (mobile)
const isCapacitor = () => {
    try {
        return window.Capacitor?.isNativePlatform?.() ?? false;
    } catch {
        return false;
    }
};

let currentUser = null;
let authInitialized = false;
let authInitPromise = null;

// Handle redirect result on app startup (called once per session)
async function initializeAuthOnStartup() {
    try {
        // On iOS (Capacitor), check for redirect result from Google OAuth
        if (isCapacitor()) {
            console.log('[auth] Capacitor detected - checking for redirect result on startup');
            const result = await getRedirectResult(auth);
            if (result?.user) {
                console.log('[auth] User authenticated via redirect:', result.user.email);
                currentUser = result.user;
                authInitialized = true;
                return result.user;
            }
        }
    } catch (error) {
        console.error('[auth] Startup redirect check error:', error);
        // Continue even if redirect check fails - user might already be logged in
    }

    // Fall back to normal auth state check
    return waitForAuthState();
}

// Wait for current auth state without creating new users
function waitForAuthState() {
    if (authInitPromise) return authInitPromise;
    authInitPromise = new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
            currentUser = user || null;
            authInitialized = true;
            unsub();
            resolve(currentUser);
        });
    });
    return authInitPromise;
}

// Initialize auth on module load (runs once)
const startupInitPromise = initializeAuthOnStartup();

export async function ensureAuthSession({ requireAuth = false } = {}) {
    // Wait for startup initialization first (handles OAuth redirects)
    await startupInitPromise;

    // Then check current auth state
    const existing = auth.currentUser || currentUser;

    if (existing || !requireAuth) {
        return existing ?? null;
    }
    throw new Error('AUTH_REQUIRED');
}

export async function getCurrentUser() {
    // Wait for startup auth initialization first
    await startupInitPromise;
    const user = auth.currentUser || currentUser;
    return user ?? null;
}

export async function getCurrentUserId() {
    const user = await getCurrentUser();
    return user?.uid ?? null;
}

export async function getCurrentUserProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    return {
        uid: user.uid,
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || ''
    };
}

export async function signInWithGoogle() {
    try {
        // Quick sync check — skip the full startup await
        if (auth.currentUser) {
            console.log('[auth] User already signed in:', auth.currentUser.email);
            return auth.currentUser;
        }

        // Use redirect for Capacitor (iOS/Android), popup for web
        if (isCapacitor()) {
            console.log('[auth] Capacitor detected - using redirect flow');
            await signInWithRedirect(auth, provider);
            // After redirect, page will reload and initializeAuthOnStartup() handles the result
        } else {
            console.log('[auth] Web detected - using popup flow');
            const result = await signInWithPopup(auth, provider);
            currentUser = result.user;
            authInitialized = true;
            console.log('[auth] Popup sign-in successful, user:', result.user.email);
            return result.user;
        }
    } catch (error) {
        console.error('[auth] Sign in error:', error);
        throw error;
    }
}

export async function signOutUser() {
    await signOut(auth);
    currentUser = null;
}

export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

export { auth };

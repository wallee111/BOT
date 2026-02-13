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

export async function ensureAuthSession({ requireAuth = false } = {}) {
    // Always wait for auth state to be initialized
    const existing = auth.currentUser || await waitForAuthState();

    if (existing || !requireAuth) {
        return existing ?? null;
    }
    throw new Error('AUTH_REQUIRED');
}

export async function getCurrentUser() {
    const user = auth.currentUser || (authInitialized ? currentUser : await waitForAuthState());
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
        await ensureAuthSession();
        if (auth.currentUser) {
            console.log('[auth] User already signed in:', auth.currentUser.email);
            return auth.currentUser;
        }

        // Use redirect for Capacitor (iOS/Android), popup for web
        if (isCapacitor()) {
            console.log('[auth] Capacitor detected - using redirect flow');
            console.log('[auth] Redirecting to Google OAuth. Redirect URL: capacitor://com.bot.bucketofthoughts/signin.html');
            await signInWithRedirect(auth, provider);
            // After redirect, page will reload and handleSignInRedirect() will be called
        } else {
            console.log('[auth] Web detected - using popup flow');
            const result = await signInWithPopup(auth, provider);
            currentUser = result.user;
            authInitialized = true;
            console.log('[auth] Popup sign-in successful, user:', result.user.email);

            // Wait for auth state to fully propagate
            return new Promise((resolve) => {
                const unsubscribe = onAuthStateChanged(auth, (user) => {
                    if (user && user.uid === result.user.uid) {
                        console.log('[auth] Auth state confirmed for user:', user.email);
                        currentUser = user;
                        unsubscribe();
                        resolve(user);
                    }
                });

                // Fallback: resolve after 1 second even if onAuthStateChanged doesn't fire
                setTimeout(() => {
                    console.log('[auth] Auth state confirmation timeout, proceeding with result.user');
                    unsubscribe();
                    resolve(result.user);
                }, 1000);
            });
        }
    } catch (error) {
        console.error('[auth] Sign in error:', error);
        throw error;
    }
}

export async function handleSignInRedirect() {
    try {
        console.log('[auth] Checking for redirect result...');

        // First check if Firebase already has a current user (most reliable)
        if (auth.currentUser) {
            console.log('[auth] User already logged in:', auth.currentUser.email);
            currentUser = auth.currentUser;
            authInitialized = true;
            return auth.currentUser;
        }

        // Fallback: Check the redirect result
        const result = await getRedirectResult(auth);
        console.log('[auth] Redirect result:', result);
        if (result?.user) {
            console.log('[auth] User found from redirect:', result.user.email);
            currentUser = result.user;
            authInitialized = true;
            return result.user;
        }
        console.log('[auth] No redirect result found');
    } catch (error) {
        console.error('[auth] Redirect result error:', error);
        console.error('[auth] Error code:', error?.code);
        console.error('[auth] Error message:', error?.message);
        throw error;
    }
    return null;
}

export async function signOutUser() {
    await signOut(auth);
    currentUser = null;
}

export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

export { auth };

// Authentication module for the app
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
} from 'firebase/auth';
import { app } from './firebase.js';
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

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
    const existing = auth.currentUser || (authInitialized ? currentUser : await waitForAuthState());
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
    await ensureAuthSession();
    if (auth.currentUser) {
        return auth.currentUser;
    }
    const result = await signInWithPopup(auth, provider);
    currentUser = result.user;
    return currentUser;
}

export async function signOutUser() {
    await signOut(auth);
    currentUser = null;
}

export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

export { auth };

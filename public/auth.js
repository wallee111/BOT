// Authentication module for the app
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: 'AIzaSyAQzyF1tkzPtmR3jTBaV5I5wZMrTdroX6A',
    authDomain: 'device-dev-1-c0700.firebaseapp.com',
    projectId: 'device-dev-1-c0700',
    storageBucket: 'device-dev-1-c0700.firebasestorage.app',
    messagingSenderId: '494337535749',
    appId: '1:494337535749:web:fb1c8bfb05b6364490916c'
};

const app = initializeApp(firebaseConfig);
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

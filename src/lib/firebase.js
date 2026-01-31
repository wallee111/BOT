import { initializeApp } from 'firebase/app';

const firebaseConfig = {
    apiKey: "AIzaSyDHs4GyV3smDzpLNC48XkevxKPVr7M4zUM",
    authDomain: "bucket0f-thoughts.firebaseapp.com",
    projectId: "bucket0f-thoughts",
    storageBucket: "bucket0f-thoughts.firebasestorage.app",
    messagingSenderId: "843739263347",
    appId: "1:843739263347:web:22de8065b8ace43e825506"
};

export const app = initializeApp(firebaseConfig);

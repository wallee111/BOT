#!/bin/bash

# Backend Deployment Script for Bucket of Thoughts
# Deploys Firestore rules and indexes to production

set -e  # Exit on error

echo "🚀 Deploying Backend Infrastructure..."
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install with: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
echo "📋 Checking Firebase authentication..."
firebase projects:list > /dev/null 2>&1 || {
    echo "❌ Not logged in to Firebase. Run: firebase login"
    exit 1
}

echo "✅ Firebase CLI authenticated"
echo ""

# Display current project
CURRENT_PROJECT=$(firebase use)
echo "📦 Current project: $CURRENT_PROJECT"
echo ""

read -p "Deploy to this project? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "🔒 Deploying Firestore security rules..."
firebase deploy --only firestore:rules

echo ""
echo "📊 Deploying Firestore indexes..."
firebase deploy --only firestore:indexes

echo ""
echo "✅ Backend deployment complete!"
echo ""
echo "⏰ Note: Indexes may take 5-15 minutes to build in production."
echo "    Check status: https://console.firebase.google.com/project/$CURRENT_PROJECT/firestore/indexes"
echo ""
echo "Next steps:"
echo "  1. Test queries in production to verify indexes"
echo "  2. Monitor Firestore usage in Firebase Console"
echo "  3. Proceed with iOS app build: npm run cap:sync"

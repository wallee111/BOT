#!/bin/bash
# Deploy Backend Optimizations for Bucket of Thoughts
# This script deploys Firestore rules, indexes, and the optimized build

set -e  # Exit on error

echo "🚀 Deploying Backend Optimizations..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Install it with: npm install -g firebase-tools${NC}"
    exit 1
fi

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Firebase. Run: firebase login${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1/5: Deploying Firestore Security Rules...${NC}"
firebase deploy --only firestore:rules
echo -e "${GREEN}✅ Security rules deployed${NC}"
echo ""

echo -e "${YELLOW}Step 2/5: Deploying Firestore Indexes...${NC}"
firebase deploy --only firestore:indexes
echo -e "${GREEN}✅ Indexes deployed (may take 5-10 minutes to build)${NC}"
echo ""

echo -e "${YELLOW}Step 3/5: Building optimized app bundle...${NC}"
npm run build
echo -e "${GREEN}✅ Build complete${NC}"
echo ""

echo -e "${YELLOW}Step 4/5: Analyzing bundle size...${NC}"
du -sh dist/
ls -lh dist/assets/*.js | awk '{print $5, $9}'
echo ""

echo -e "${YELLOW}Step 5/5: Deploying to Firebase Hosting...${NC}"
firebase deploy --only hosting
echo -e "${GREEN}✅ Hosting deployed${NC}"
echo ""

echo -e "${GREEN}🎉 All optimizations deployed successfully!${NC}"
echo ""
echo "📊 Next steps:"
echo "  1. Check Firebase Console → Firestore → Indexes (wait for completion)"
echo "  2. Test app in incognito mode"
echo "  3. Enable performance logging: localStorage.setItem('debug_performance', 'true')"
echo "  4. Monitor cache hit rates: window.__perfMonitor.getSummary()"
echo ""
echo "📖 See OPTIMIZATION_GUIDE.md for detailed documentation"

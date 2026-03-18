const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const express = require('express');
const cors = require('cors');

const { validateApiKey } = require('./src/middleware/auth');
const ideasRouter = require('./src/routes/ideas');
const categoriesRouter = require('./src/routes/categories');

// Declare secrets so Firebase makes them available as env vars at runtime
const API_KEY = defineSecret('API_KEY');
const OWNER_USER_ID = defineSecret('OWNER_USER_ID');

const app = express();
app.use(cors({
  origin: [
    'https://bucket0f-thoughts.web.app',
    'https://bucket0f-thoughts.firebaseapp.com',
    'capacitor://com.bot.bucketofthoughts',
  ],
}));
app.use(express.json());
app.use(validateApiKey);

app.use('/api/ideas', ideasRouter);
app.use('/api/categories', categoriesRouter);

exports.api = onRequest(
  { secrets: [API_KEY, OWNER_USER_ID], region: 'us-central1' },
  app
);

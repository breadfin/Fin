import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/breadfinance";

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(__dirname));

// ==================== MONGODB SCHEMAS ====================
const ApplicationSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  dob: String,
  address: String,
  aadhaar: String,
  pan: String,
  employmentStatus: { type: String, default: 'Salaried' },
  monthlyIncome: { type: Number, default: 0 },
  nomineeName: String,
  loanDescription: String,
  loanAmount: { type: Number, default: 100000 },
  tenure: { type: Number, default: 24 },
  bankName: String,
  bankAcc: String,
  bankIfsc: String,
  passwordHash: String,
  status: { type: String, default: 'Pending Loan Approval' },
  walletBalance: { type: Number, default: 0 },
  cancellationStatus: { type: String, default: 'None' },
  cancellationReason: { type: String, default: '' },
  documents: {
    panCard: String,
    aadhaarFront: String,
    aadhaarBack: String,
    nomineeAadhar: String
  },
  version: { type: Number, default: 1 }
}, { timestamps: true });

const Application = mongoose.model('Application', ApplicationSchema);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@breadfinance.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@12345";

// ==================== API ENDPOINTS ====================

// 1. Auth Endpoint
app.post('/api/auth', async (req, res) => {
  try {
    const { action, email, password } = req.body;

    if (action === 'login') {
      // Check Admin Login
      if (email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
        return res.json({
          user: { email: ADMIN_EMAIL, admin: true, fullName: "Super Admin" }
        });
      }

      // Check Client Login
      const client = await Application.findOne({ email: email.toLowerCase() });
      if (!client) {
        return res.status(401).json({ error: 'No account found with this email address.' });
      }

      const isMatch = await bcrypt.compare(password, client.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Incorrect password entered.' });
      }

      return res.json({
        user: { email: client.email, admin: false, id: client.id, fullName: client.fullName }
      });
    }

    if (action === 'logout') {
      return res.json({ success: true });
    }

    res.status(400).json({ error: 'Invalid auth action' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth', (req, res) => {
  res.json({ user: null });
});

// 2. Applications Endpoint
app.get('/api/applications', async (req, res) => {
  try {
    const apps = await Application.find().sort({ createdAt: -1 });
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/applications', async (req, res) => {
  try {
    const data = req.body;

    // Handle older imports if triggered
    if (data.action === 'import' && Array.isArray(data.records)) {
      let count = 0;
      for (const rec of data.records) {
        if (!rec.id) continue;
        await Application.findOneAndUpdate({ id: rec.id }, { $set: rec }, { upsert: true });
        count++;
      }
      return res.json({ imported: count });
    }

    // Auto-generate Unique Client ID (e.g. BF-1001)
    const count = await Application.countDocuments();
    const newId = `BF-${1000 + count + 1}`;

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const newApp = new Application({
      ...data,
      id: newId,
      email: data.email.toLowerCase(),
      passwordHash: hashedPassword,
      status: 'Pending Loan Approval',
      walletBalance: 0,
      cancellationStatus: 'None'
    });

    const saved = await newApp.save();
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Application (Approval, Wallet, Edit Dossier)
app.patch('/api/applications', async (req, res) => {
  try {
    const { id, changes, documents } = req.body;
    const updatePayload = { ...changes };

    if (documents) {
      for (const [key, value] of Object.entries(documents)) {
        updatePayload[`documents.${key}`] = value;
      }
    }
    updatePayload.version = (changes?.version || 1) + 1;

    const updated = await Application.findOneAndUpdate(
      { id },
      { $set: updatePayload },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Application not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Loan Cancellation Request
app.put('/api/applications', async (req, res) => {
  try {
    const { id, action, reason } = req.body;
    if (action === 'cancel') {
      const updated = await Application.findOneAndUpdate(
        { id },
        { 
          $set: { 
            cancellationStatus: 'Requested',
            cancellationReason: reason
          } 
        },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Application not found' });
      return res.json(updated);
    }
    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Document View Endpoint
app.get('/api/documents', async (req, res) => {
  try {
    const { id, field } = req.query;
    const client = await Application.findOne({ id });
    if (!client || !client.documents || !client.documents[field]) {
      return res.status(404).send('Document not found');
    }

    const dataUrl = client.documents[field];
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.redirect(dataUrl);
    }

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    res.setHeader('Content-Type', mimeType);
    res.send(buffer);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Serve frontend for all pages
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server & Connect MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas successfully!');
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
  });

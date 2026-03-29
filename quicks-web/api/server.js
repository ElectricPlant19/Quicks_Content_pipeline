import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // List all databases
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    console.log('Available databases:', dbs.databases.map(db => db.name));

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Current DB Available collections:', collections.map(c => c.name));
    
    // Sample a document from the first likely collection if 'facts' isn't found
    const colName = collections.find(c => c.name === 'facts') ? 'facts' : collections[0]?.name;
    if (colName) {
      const sample = await mongoose.connection.db.collection(colName).findOne({});
      console.log(`Sample document from ${colName}:`, sample);
    }
  })
  .catch(err => console.error('Could not connect to MongoDB:', err));

// Define Fact Schema
const factSchema = new mongoose.Schema({
  hook: String,
  insight: String,
  twist: String,
  category: String,
  tags: [String],
  image_url: String,
  source: {
    title: String,
    url: String
  },
  score: Number,
  status: String,
  scoring: Object
}, { timestamps: true });

const Fact = mongoose.model('Fact', factSchema, 'facts');

// GET all facts
app.get('/api/facts', async (req, res) => {
  try {
    const facts = await Fact.find({ status: 'approved' }).sort({ createdAt: -1 });
    res.json(facts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment.');
  process.exit(1);
}

const factSchema = new mongoose.Schema(
  {
    image_url: String,
  },
  { strict: false, timestamps: true }
);

const Fact = mongoose.model('Fact', factSchema, 'facts');

async function main() {
  await mongoose.connect(MONGODB_URI);

  const filter = {
    $or: [
      { image_url: { $exists: false } },
      { image_url: null },
      { image_url: '' },
    ],
  };

  const toDelete = await Fact.countDocuments(filter);
  console.log(`Matching facts to delete: ${toDelete}`);

  const result = await Fact.deleteMany(filter);
  console.log(`Deleted facts: ${result.deletedCount ?? 0}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});


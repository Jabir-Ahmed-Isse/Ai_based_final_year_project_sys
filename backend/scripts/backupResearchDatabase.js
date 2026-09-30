const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const databaseUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputRoot = process.argv[2] || path.resolve(__dirname, '../../backups', `research-before-import-${timestamp}`);

async function run() {
  await mongoose.connect(databaseUri);
  const db = mongoose.connection.db;
  fs.mkdirSync(outputRoot, { recursive: true });
  const collections = await db.listCollections().toArray();
  const manifest = {
    database: db.databaseName,
    createdAt: new Date().toISOString(),
    format: 'MongoDB Extended JSON, canonical mode',
    collections: []
  };

  for (const descriptor of collections) {
    const collection = db.collection(descriptor.name);
    const [documents, indexes] = await Promise.all([
      collection.find({}).toArray(),
      collection.indexes().catch(() => [])
    ]);
    const ejson = mongoose.mongo.BSON.EJSON.stringify(documents, { relaxed: false, indent: 2 });
    const fileName = `${descriptor.name}.ejson`;
    const filePath = path.join(outputRoot, fileName);
    fs.writeFileSync(filePath, ejson, 'utf8');
    manifest.collections.push({
      name: descriptor.name,
      type: descriptor.type,
      documentCount: documents.length,
      file: fileName,
      sha256: crypto.createHash('sha256').update(ejson).digest('hex'),
      indexes
    });
  }

  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify({ status: 'completed', outputRoot, collections: manifest.collections.length }));
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

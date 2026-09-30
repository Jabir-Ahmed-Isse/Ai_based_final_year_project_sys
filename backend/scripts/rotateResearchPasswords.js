const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const ActivityLog = require('../src/models/ActivityLog');
const { TEST_TAG, TEST_PASSWORD } = require('./seedResearchUsers');

async function run() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Research test passwords cannot be rotated in production');
  }
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const users = await User.find({ testDataTag: TEST_TAG }).sort({ role: 1, email: 1 }).lean();
  if (users.length !== 100) throw new Error(`Expected 100 research test users, found ${users.length}`);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  const update = await User.updateMany(
    { testDataTag: TEST_TAG, isTestAccount: true },
    { $set: { password: passwordHash } }
  );
  if (update.modifiedCount !== 100 && update.matchedCount !== 100) {
    throw new Error(`Expected to update 100 test users, matched ${update.matchedCount} and modified ${update.modifiedCount}`);
  }
  if (!(await bcrypt.compare(TEST_PASSWORD, passwordHash))) throw new Error('Password hash verification failed');

  const roleOrder = { admin: 0, coordinator: 1, student: 2, supervisor: 3 };
  users.sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.email.localeCompare(b.email));
  const rows = users.map(user => ({
    email: user.email,
    role: user.role,
    temporary_password: TEST_PASSWORD,
    test_data: true
  }));
  const headers = ['email', 'role', 'temporary_password', 'test_data'];
  const csv = [headers, ...rows.map(row => headers.map(key => row[key]))]
    .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const output = path.resolve(__dirname, '../../outputs/research-experiment-20260724/test-credentials.csv');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, csv, 'utf8');
  await ActivityLog.create({
    actionType: 'TEST_PASSWORDS_ROTATED',
    status: 'success',
    metadata: { affectedUsers: users.length, bcryptCost: 12, credentialsFile: path.basename(output) }
  });
  console.log(JSON.stringify({ affectedUsers: users.length, passwordLength: TEST_PASSWORD.length, bcryptCost: 12, credentialsFile: output }));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());

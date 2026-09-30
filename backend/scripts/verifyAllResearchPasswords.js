const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const User = require('../src/models/User');

dotenv.config();

async function main() {
  await mongoose.connect(
    process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms'
  );

  const users = await User.find({
    testDataTag: 'RESEARCH_EXPERIMENT'
  }).lean();

  const currentPasswordChecks = await Promise.all(
    users.map(user => bcrypt.compare('12345678', user.password))
  );
  const oldPasswordChecks = await Promise.all(
    users.map(user => bcrypt.compare('123456', user.password))
  );
  const roleCounts = users.reduce((counts, user) => {
    counts[user.role] = (counts[user.role] || 0) + 1;
    return counts;
  }, {});

  const result = {
    testUsers: users.length,
    allUse12345678: currentPasswordChecks.every(Boolean),
    old123456RejectedByAll: oldPasswordChecks.every(matches => !matches),
    roleCounts
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.allUse12345678 || !result.old123456RejectedByAll) {
    process.exitCode = 1;
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

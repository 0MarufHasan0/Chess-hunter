const { connectDB, GuildConfig } = require('./db');
const config = require('./config');

(async () => {
  try {
    await connectDB(config.mongoUri);
    const configs = await GuildConfig.find({});
    console.log('--- MongoDB Guild Configs ---');
    console.log(JSON.stringify(configs, null, 2));
  } catch (err) {
    console.error('Error fetching from DB:', err.message);
  }
  process.exit(0);
})();

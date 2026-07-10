require('dotenv').config();

const requiredEnv = ['DISCORD_TOKEN', 'MONGO_URI', 'TW_USER', 'TW_PASS', 'TW_EMAIL'];

for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable ${envVar}`);
    process.exit(1);
  }
}

module.exports = {
  discordToken: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID || null, // Optional if we extract it from client login, but good for slash command deployment
  mongoUri: process.env.MONGO_URI,
  twitter: {
    username: process.env.TW_USER,
    password: process.env.TW_PASS,
    email: process.env.TW_EMAIL
  },
  pollIntervalCron: process.env.POLL_INTERVAL_CRON || '*/7 * * * *',
  newAccountHours: parseFloat(process.env.NEW_ACCOUNT_HOURS) || 96
};

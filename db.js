const mongoose = require('mongoose');

// Schema for dynamic tweet monitoring rules
const MonitorRuleSchema = new mongoose.Schema({
  channelId: { type: String, required: true },
  name: { type: String, required: true },
  authorKeywords: { type: [String], default: [] },
  includeKeywords: { type: [String], default: [] },
  requiredKeywords: { type: [String], default: [] },
  isGiveaway: { type: Boolean, default: false }
});

// Schema for tracking individual server (guild) configurations
const GuildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  channelId: { type: String, default: null }, // Discord channel where alerts are posted
  keywords: { 
    type: [String], 
    default: [
      'nft', 'pfp', 'hand draw', 'ethereum', 'eth', 'profile pic collection', 
      'awakened', 'mint', 'whitelist', 'wl', 'solana', 'opensea', 'magiceden', 'traits',
      'joegs', 'jpegs', 'collection', 'raw digital', 'raw degital', 'crypto-native',
      'web3', '1/1', '1of1', 'generative art', 'digital art', 'metaverse', 'discord.gg',
      'ordinals', 'dapp', 'dao', 'sol', 'holder', 'staking', 'immutablex', 'imx',
      'arbitrum', 'base chain', 'polygon', 'backed by', 'interesting finds',
      'collection details', 'tba', 'supply', 'early find', 'early alpha'
    ] 
  }, // Tracked keyword list for this guild
  mode: { type: String, enum: ['new-only', 'all-matches'], default: 'new-only' }, // Tracking mode
  monitorChannelId: { type: String, default: null }, // Channel for followed accounts' tweet alerts (legacy)
  monitorKeywords: { type: [String], default: ['early find', 'alpha', 'early alpha', 'interesting find', 'new alpha', 'free mint find', 'early nft find', 'found early'] }, // Keywords to watch in tweets (legacy)
  monitorRules: { type: [MonitorRuleSchema], default: [] } // Dynamic monitor rules
});

// Schema for deduplicating alerts. Ensures we don't alert the same account to the same server twice.
const NotifiedAccountSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  twitterId: { type: String, required: true, index: true },
  notifiedAt: { type: Date, default: Date.now }
});

// Compound unique index to guarantee no duplicates per server/guild
NotifiedAccountSchema.index({ guildId: 1, twitterId: 1 }, { unique: true });

// Schema for deduplicating notified tweets from followed accounts
const NotifiedTweetSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, index: true }, // Added for channel-specific deduplication
  tweetId: { type: String, required: true, index: true },
  notifiedAt: { type: Date, default: Date.now }
});

// Compound unique index for tweet alerts deduplication
NotifiedTweetSchema.index({ guildId: 1, channelId: 1, tweetId: 1 }, { unique: true });

// Schema for caching fetched Twitter profiles to prevent anti-scraping bans
const TwitterProfileCacheSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  name: String,
  followersCount: Number,
  joined: String, // Stored as profile.joined raw string
  avatar: String,
  cachedAt: { type: Date, default: Date.now, expires: 86400 } // Auto-expires after 24 hours (86400 seconds)
});

const GuildConfig = mongoose.model('GuildConfig', GuildConfigSchema);
const NotifiedAccount = mongoose.model('NotifiedAccount', NotifiedAccountSchema);
const NotifiedTweet = mongoose.model('NotifiedTweet', NotifiedTweetSchema);
const TwitterProfileCache = mongoose.model('TwitterProfileCache', TwitterProfileCacheSchema);

/**
 * Connect to MongoDB using Mongoose.
 * @param {string} uri MongoDB connection string.
 */
async function connectDB(uri) {
  try {
    await mongoose.connect(uri);
    console.log('Successfully connected to MongoDB.');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
}

module.exports = {
  connectDB,
  GuildConfig,
  NotifiedAccount,
  NotifiedTweet,
  TwitterProfileCache
};

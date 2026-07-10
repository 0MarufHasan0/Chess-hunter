const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');
const config = require('./config');
const { connectDB, GuildConfig, NotifiedAccount, NotifiedTweet } = require('./db');
const { initTwitter, searchProfilesSafe, delay } = require('./twitter');

// Initialize Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Global reference for the Twitter Scraper instance
let scraper = null;

/**
 * Ensures the Twitter scraper is initialized and logged in.
 * If the session expires, it automatically re-initializes.
 */
async function getTwitterScraper() {
  if (!scraper) {
    scraper = await initTwitter(config.twitter);
  } else {
    try {
      const loggedIn = await scraper.isLoggedIn();
      if (!loggedIn) {
        console.warn('Twitter session expired. Re-authenticating...');
        scraper = await initTwitter(config.twitter);
      }
    } catch (err) {
      console.error('Error checking Twitter login status, re-initializing scraper:', err.message);
      scraper = await initTwitter(config.twitter);
    }
  }
  return scraper;
}

/**
 * Poll Twitter for configured keywords and post matches to Discord.
 */
async function pollTwitter() {
  console.log('--- Starting Twitter Polling Cycle ---');

  // Fetch all guilds that have keywords and a configured alert channel
  const guildConfigs = await GuildConfig.find({
    channelId: { $ne: null },
    keywords: { $exists: true, $not: { $size: 0 } }
  });

  if (guildConfigs.length === 0) {
    console.log('No guilds configured with keywords and channel. Skipping poll.');
    return;
  }

  // Map keywords to guilds tracking them to avoid querying Twitter multiple times for the same keyword
  const keywordToGuilds = {};
  for (const gc of guildConfigs) {
    for (const kw of gc.keywords) {
      if (!keywordToGuilds[kw]) {
        keywordToGuilds[kw] = [];
      }
      keywordToGuilds[kw].push(gc);
    }
  }

  const uniqueKeywords = Object.keys(keywordToGuilds);
  console.log(`Tracking ${uniqueKeywords.length} unique keywords across ${guildConfigs.length} guilds.`);

  let scraperClient;
  try {
    scraperClient = await getTwitterScraper();
  } catch (err) {
    console.error('Skipping polling cycle: Twitter client authentication failed.', err.message);
    return;
  }

  // Iterate over each unique keyword
  for (const keyword of uniqueKeywords) {
    // Search profiles for the keyword
    const profiles = await searchProfilesSafe(scraperClient, keyword, 20);

    // Apply rate-limit safety delay (1.5 seconds) between keyword searches
    await delay(1500);

    if (profiles.length === 0) {
      continue;
    }

    // Process each profile returned
    for (const profile of profiles) {
      const twitterId = profile.id || profile.userId;
      const username = profile.username || profile.handle;

      if (!twitterId || !username) {
        continue; // Invalid profile object
      }

      // Context checks
      const bioLower = (profile.biography || profile.bio || profile.description || '').toLowerCase();
      const nameLower = (profile.name || profile.displayName || '').toLowerCase();
      const usernameLower = username.toLowerCase();

      // Check account age
      const createdAtVal = profile.joined || profile.createdAt;
      const createdAt = createdAtVal ? new Date(createdAtVal) : null;
      const now = new Date();
      const ageHours = createdAt ? (now - createdAt) / (1000 * 60 * 60) : Infinity;

      // Find which guilds care about this keyword match
      const targetGuilds = keywordToGuilds[keyword] || [];

      for (const gc of targetGuilds) {
        try {
          // Verify if the profile matches this guild's keywords or the supply pattern
          let matched = false;
          let matchedKeyword = '';

          for (const kw of gc.keywords) {
            const kwLower = kw.toLowerCase();
            if (bioLower.includes(kwLower) || nameLower.includes(kwLower) || usernameLower.includes(kwLower)) {
              matched = true;
              matchedKeyword = kw;
              break;
            }
          }

          // Check for supply pattern (e.g. 111/2000, 777 supply, supply: 777, 888 mint, size: 5555) in the bio
          if (!matched && gc.keywords.length > 0) {
            const supplyRegex = /\b\d+\s*[\/|of]\s*\d+\b|\b\d+\s*(?:supply|mint|pcs|pieces)\b|\b(?:supply|size|mint)\s*[:\-]?\s*\d+\b/i;
            const match = bioLower.match(supplyRegex);
            if (match) {
              matched = true;
              matchedKeyword = `Supply Pattern (${match[0]})`;
            }
          }

          // Special Robinhood/Robin/Robi Detector Check
          if (!matched) {
            const hasRobinhoodAppTag = bioLower.includes('@robinhoodapp');
            const hasRobinOrRobiName = usernameLower.includes('robin') || 
                                       usernameLower.includes('robi') || 
                                       nameLower.includes('robin') || 
                                       nameLower.includes('robi');
            
            if (hasRobinhoodAppTag || hasRobinOrRobiName) {
              matched = true;
              matchedKeyword = 'Robinhood/Robin/Robi Indicator';
            }
          }

          if (!matched) {
            continue; // Skip, this guild tracks keywords but this profile didn't match keywords or supply pattern
          }

          // Check if already notified to this server
          const alreadyNotified = await NotifiedAccount.findOne({
            guildId: gc.guildId,
            twitterId: twitterId
          });

          if (alreadyNotified) {
            continue; // Skip, already notified to this server
          }

          // Evaluate match mode criteria
          if (gc.mode === 'new-only') {
            if (ageHours > config.newAccountHours) {
              continue; // Skip, account is too old for this guild
            }
          }

          // Fetch the text channel
          const channel = await client.channels.fetch(gc.channelId);
          if (!channel || !channel.isTextBased()) {
            console.warn(`Channel ${gc.channelId} not found or not text-based for guild ${gc.guildId}.`);
            continue;
          }

          // Determine custom color based on blockchain indicators
          let embedColor = 0x1DA1F2; // Default Twitter Blue
          const textToCheck = `${bioLower} ${nameLower} ${usernameLower}`;
          if (textToCheck.includes('solana') || textToCheck.includes('sol ') || textToCheck.includes('magiceden')) {
            embedColor = 0x9945FF; // Solana Purple
          } else if (textToCheck.includes('ethereum') || textToCheck.includes('eth ') || textToCheck.includes('opensea')) {
            embedColor = 0x3C3C3D; // Ethereum Dark Slate
          }

          // Highlight the matched keyword in the bio
          let displayBio = profile.biography || profile.bio || profile.description || '*No bio provided.*';
          if (matchedKeyword) {
            try {
              if (matchedKeyword.startsWith('Supply Pattern')) {
                const supplyRegex = /\b\d+\s*[\/|of]\s*\d+\b/i;
                displayBio = displayBio.replace(supplyRegex, (match) => `**__${match}__**`);
              } else {
                const escapedKeyword = matchedKeyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`\\b(${escapedKeyword})\\b`, 'gi');
                displayBio = displayBio.replace(regex, (match) => `**__${match}__**`);
              }
            } catch (err) {
              // Fallback if regex highlight fails
            }
          }

          // Create date string for display
          const dateStr = createdAt ? createdAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          }) : 'Unknown';

          // Build visually rich embed
          const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`${profile.name || profile.displayName || 'Unknown Name'} (@${username})`)
            .setURL(`https://x.com/${username}`)
            .setDescription(displayBio)
            .setThumbnail(profile.avatar || profile.profileImageUrl || profile.avatarUrl || null)
            .addFields(
              { name: 'Followers', value: String(profile.followersCount ?? 0), inline: true },
              { name: 'Following', value: String(profile.followingCount ?? profile.friendsCount ?? 0), inline: true },
              { name: 'Tweets', value: String(profile.tweetsCount ?? profile.tweetCount ?? profile.statusesCount ?? 0), inline: true },
              { name: 'Created At', value: dateStr, inline: true },
              { name: 'Matched Keyword', value: `\`${matchedKeyword}\``, inline: true },
              { name: 'Account Age', value: `${ageHours.toFixed(1)} hours`, inline: true }
            )
            .setFooter({ text: 'Twitter Account Tracker' })
            .setTimestamp();

          // Add banner image if profile has one
          const bannerUrl = profile.banner || profile.profileBannerUrl || null;
          if (bannerUrl) {
            embed.setImage(bannerUrl);
          }

          // Create Action Buttons for quick navigation
          const twitterButton = new ButtonBuilder()
            .setLabel('Twitter Profile')
            .setURL(`https://x.com/${username}`)
            .setStyle(ButtonStyle.Link);

          const openseaButton = new ButtonBuilder()
            .setLabel('Search OpenSea')
            .setURL(`https://opensea.io/search?query=${encodeURIComponent(profile.name || username)}`)
            .setStyle(ButtonStyle.Link);

          const magicEdenButton = new ButtonBuilder()
            .setLabel('Search MagicEden')
            .setURL(`https://magiceden.io/search?q=${encodeURIComponent(profile.name || username)}`)
            .setStyle(ButtonStyle.Link);

          const actionRow = new ActionRowBuilder().addComponents(
            twitterButton,
            openseaButton,
            magicEdenButton
          );

          // Post alert to Discord with Action Buttons
          await channel.send({ embeds: [embed], components: [actionRow] });
          console.log(`Alert sent to guild ${gc.guildId} channel ${gc.channelId} for account @${username}`);

          // Persist notification record to DB
          await NotifiedAccount.create({
            guildId: gc.guildId,
            twitterId: twitterId
          });

        } catch (guildErr) {
          console.error(`Error notifying guild ${gc.guildId} channel ${gc.channelId}:`, guildErr.message);
        }
      }
    }
  }

  console.log('--- Polling Cycle Completed ---');
}

/**
 * Polls the home timeline (following list tweets) for configured keywords and alerts designated channels anonymously.
 */
async function pollTimeline() {
  console.log('--- Starting Tweet Monitoring Cycle ---');

  try {
    // Fetch all guilds that have configured monitoring
    const guildConfigs = await GuildConfig.find({
      monitorChannelId: { $ne: null },
      monitorKeywords: { $exists: true, $not: { $size: 0 } }
    });

    if (guildConfigs.length === 0) {
      console.log('No guilds configured with tweet monitoring channel. Skipping timeline poll.');
      console.log('--- Tweet Monitoring Cycle Completed ---');
      return;
    }

    let scraperClient;
    try {
      scraperClient = await getTwitterScraper();
    } catch (err) {
      console.error('Skipping timeline poll: Twitter client authentication failed.', err.message);
      return;
    }

    let tweets = [];

    // 1. Fetch home timeline (followed accounts)
    console.log('Fetching home timeline tweets...');
    try {
      const timelineTweets = await scraperClient.fetchHomeTimeline(30);
      console.log(`Fetched ${timelineTweets.length} tweets from following timeline.`);
      tweets = tweets.concat(timelineTweets);
    } catch (err) {
      console.error('Failed to fetch home timeline:', err.message);
    }

    // 2. Fetch global search tweets matching the combined monitor keywords
    const allMonitorKeywords = new Set();
    for (const gc of guildConfigs) {
      for (const kw of gc.monitorKeywords) {
        allMonitorKeywords.add(kw.trim().toLowerCase());
      }
    }

    const uniqueMonitorKeywords = Array.from(allMonitorKeywords);
    if (uniqueMonitorKeywords.length > 0) {
      // Construct OR query, quoting each phrase
      const query = uniqueMonitorKeywords.map(kw => `"${kw}"`).join(' OR ');
      console.log(`Searching tweets globally for query: ${query}...`);
      try {
        const { SearchMode } = require('agent-twitter-client');
        const searchRes = await scraperClient.searchTweets(query, 20, SearchMode.Latest);
        
        let searchCount = 0;
        if (searchRes && typeof searchRes[Symbol.asyncIterator] === 'function') {
          for await (const tweet of searchRes) {
            tweets.push(tweet);
            searchCount++;
            if (searchCount >= 20) break;
          }
        } else if (Array.isArray(searchRes)) {
          tweets = tweets.concat(searchRes);
          searchCount = searchRes.length;
        }
        console.log(`Fetched ${searchCount} tweets from global search.`);
      } catch (err) {
        console.error('Failed to fetch global search tweets:', err.message);
      }
    }

    for (const tweet of tweets) {
      const tweetId = tweet.id || tweet.rest_id || (tweet.legacy && tweet.legacy.id_str);
      const text = tweet.text || (tweet.legacy && tweet.legacy.full_text) || '';

      if (!tweetId || !text) {
        continue; // Invalid tweet format or empty text
      }

      // Skip tweets older than 10 minutes to prevent historic back-alerting
      let tweetTimeMs = null;
      if (tweet.timestamp) {
        tweetTimeMs = tweet.timestamp * 1000;
      } else if (tweet.timeParsed) {
        tweetTimeMs = new Date(tweet.timeParsed).getTime();
      } else if (tweet.legacy && tweet.legacy.created_at) {
        tweetTimeMs = new Date(tweet.legacy.created_at).getTime();
      }

      if (tweetTimeMs) {
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        if (tweetTimeMs < tenMinutesAgo) {
          continue; // Silently skip historical tweets
        }
      }

      const textLower = text.toLowerCase();

      for (const gc of guildConfigs) {
        try {
          // Check if this guild already notified this tweet
          const alreadyNotified = await NotifiedTweet.findOne({
            guildId: gc.guildId,
            tweetId: tweetId
          });

          if (alreadyNotified) {
            continue;
          }

          // Clean up HTML entities in the tweet text first
          let cleanedText = text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

          const textLower = cleanedText.toLowerCase();

          // Match against guild's monitor keywords with word boundaries
          let matched = false;
          let matchedKeyword = '';

          for (const kw of gc.monitorKeywords) {
            const escapedKeyword = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
            if (regex.test(cleanedText)) {
              matched = true;
              matchedKeyword = kw;
              break;
            }
          }

          // Also check for supply pattern (e.g. 111/2000, 777 supply, supply: 777, 888 mint, size: 5555) in the tweet
          let hasSupplyPattern = false;
          const supplyRegex = /\b\d+\s*[\/|of]\s*\d+\b|\b\d+\s*(?:supply|mint|pcs|pieces)\b|\b(?:supply|size|mint)\s*[:\-]?\s*\d+\b/i;
          // Strip out date patterns (like 7/9/26 or 07/09/2026) and year ranges (like 2006 / 2009) to prevent false positives matching as supply
          const textWithoutDates = cleanedText
            .replace(/\b\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}\b/g, '')
            .replace(/\b(19|20)\d{2}\s*[\/\-]\s*(19|20)\d{2}\b/g, '');
          const match = textWithoutDates.match(supplyRegex);
          if (match) {
            const normalizedMatch = match[0].toLowerCase().replace(/\s+/g, '');
            if (normalizedMatch !== '1/1' && normalizedMatch !== '1of1' && normalizedMatch !== '1on1') {
              hasSupplyPattern = true;
              if (!matched) {
                matched = true;
                matchedKeyword = `Supply Pattern (${match[0]})`;
              }
            }
          }

          // Special Robinhood/Robin/Robi Detector Check:
          if (!matched) {
            const authorUsernameLower = (tweet.username || (tweet.core?.user_results?.result?.legacy?.screen_name) || '').toLowerCase();
            const authorNameLower = (tweet.name || (tweet.core?.user_results?.result?.legacy?.name) || '').toLowerCase();
            
            if (authorUsernameLower.includes('robin') || authorUsernameLower.includes('robi') ||
                authorNameLower.includes('robin') || authorNameLower.includes('robi') ||
                textLower.includes('@robinhoodapp')) {
              matched = true;
              matchedKeyword = 'Robinhood/Robin/Robi Match';
            }
          }

          if (!matched) {
            continue; // No match for this guild
          }

          // === Blacklist Filter: Skip tweets containing spam/marketing keywords ===
          const blacklistPatterns = [
            /\bminted\b/i,
            /\bgiveaway\b/i,
            /\bgiveaways\b/i,
            /\bgive\s+away\b/i,
            /(?:\b\d*x)?gtd\b/i,
            /\bdrop\s+(?:your\s+)?(?:eth\s+)?(?:wallet|address)\b/i,
            /\bcomment\s+(?:your\s+)?(?:eth\s+)?(?:wallet|address)\b/i,
            /\bleave\s+(?:your\s+)?(?:eth\s+)?(?:wallet|address)\b/i,
            /\bwallet\s+address\b/i,
            /\btelegram\b/i,
            /\btg\b/i,
            /\bprofit\b/i,
            /\bgain\b/i,
            /\bsaw\s+it\s+late\b/i,
            /\brevealed\b/i,
            /\breveal\b/i,
            /\brevaled\b/i,
            /\bburned\b/i,
            /\bburn\b/i,
            /\bmints?\s+today\b/i,
            /\bmints?\s+now\b/i,
            /\blive\s+mints?\b/i,
            /\bmint\s+is\s+live\b/i
          ];
          
          let hasBlacklistWord = false;
          for (const pattern of blacklistPatterns) {
            if (pattern.test(cleanedText)) {
              hasBlacklistWord = true;
              break;
            }
          }
          
          if (hasBlacklistWord) {
            console.log(`Filtering out tweet ${tweetId} - contains blacklisted spam/marketing word.`);
            continue;
          }

          // === Secondary Filter: Ensure it contains NFT/crypto indicators ===
          // Every alert tweet must contain either:
          // 1) "supply" (or match a supply pattern like 111/2222)
          // OR
          // 2) "mint" AND (tba, tbd, free, date, price, or today)
          const hasSupply = /\bsupply\b/i.test(cleanedText) || hasSupplyPattern;
          
          const hasMint = /\bmint\b/i.test(cleanedText);
          const hasMintIndicators = hasMint && (
            /\btba\b/i.test(cleanedText) ||
            /\btbd\b/i.test(cleanedText) ||
            /\bfree\b/i.test(cleanedText) ||
            /\bdate\b/i.test(cleanedText) ||
            /\bprice\b/i.test(cleanedText) ||
            /\btoday\b/i.test(cleanedText)
          );

          const isRobinMatch = matchedKeyword === 'Robinhood/Robin/Robi Match';
          if (!isRobinMatch && !hasSupply && !hasMintIndicators) {
            console.log(`Filtering out tweet ${tweetId} - lacks required supply or mint/TBA indicators.`);
            continue; // Skip, does not look like an early collection launch
          }

          // Fetch target text channel
          const channel = await client.channels.fetch(gc.monitorChannelId);
          if (!channel || !channel.isTextBased()) {
            console.warn(`Monitor channel ${gc.monitorChannelId} not found or not text-based for guild ${gc.guildId}.`);
            continue;
          }

          // Extract all @username mentions from text
          const mentionRegex = /@(\w+)/g;
          const matches = [...cleanedText.matchAll(mentionRegex)];
          const mentions = matches.map(m => m[1]);

          // Highlight matched keyword in tweet body
          let displayText = cleanedText;
          try {
            const escapedKeyword = matchedKeyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`\\b(${escapedKeyword})\\b`, 'gi');
            displayText = displayText.replace(regex, (match) => `**__${match}__**`);
          } catch (err) {
            // Fallback
          }

          // Build premium anonymous embed (Clutter-free, no fields/footer)
          const embed = new EmbedBuilder()
            .setColor(0xF1C40F) // Gold color for alpha alerts
            .setTitle('🚨 Alpha Signal Detected')
            .setDescription(displayText)
            .setTimestamp();

          // Construct buttons array
          const allButtons = [];

          // 1. Add Source Tweet Button
          const authorUsername = tweet.username || (tweet.core?.user_results?.result?.legacy?.screen_name);
          if (authorUsername) {
            allButtons.push(
              new ButtonBuilder()
                .setLabel('Source Tweet')
                .setURL(`https://x.com/${authorUsername}/status/${tweetId}`)
                .setStyle(ButtonStyle.Link)
            );
          }

          // 2. Add dynamic mention buttons (all of them, up to 24 mentions to allow max 25 buttons in total)
          const uniqueMentions = [...new Set(mentions)].slice(0, 24);
          for (const mention of uniqueMentions) {
            allButtons.push(
              new ButtonBuilder()
                .setLabel(`@${mention}`)
                .setURL(`https://x.com/${mention}`)
                .setStyle(ButtonStyle.Link)
            );
          }

          // Chunk buttons into ActionRows (max 5 buttons per row, max 5 rows total = 25 buttons)
          const actionRows = [];
          for (let i = 0; i < allButtons.length; i += 5) {
            const chunk = allButtons.slice(i, i + 5);
            const row = new ActionRowBuilder().addComponents(chunk);
            actionRows.push(row);
          }

          const messageOptions = { embeds: [embed] };
          if (actionRows.length > 0) {
            messageOptions.components = actionRows;
          }

          // Send alert
          await channel.send(messageOptions);
          console.log(`Anonymous tweet alert sent to guild ${gc.guildId} channel ${gc.monitorChannelId} for tweet ${tweetId}`);

          // Persist notification record
          await NotifiedTweet.create({
            guildId: gc.guildId,
            tweetId: tweetId
          });

        } catch (guildErr) {
          console.error(`Error processing tweet alert for guild ${gc.guildId}:`, guildErr.message);
        }
      }
    }
  } catch (loopErr) {
    console.error('Error during tweet timeline polling loop:', loopErr.message);
  }

  console.log('--- Tweet Monitoring Cycle Completed ---');
}

// Handle Slash Commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId } = interaction;

  if (!guildId) {
    return interaction.reply({ content: 'Commands can only be used within servers (guilds).', ephemeral: true });
  }

  try {
    // 1. /setchannel command
    if (commandName === 'setchannel') {
      const channel = interaction.options.getChannel('channel');
      
      await GuildConfig.findOneAndUpdate(
        { guildId },
        { channelId: channel.id },
        { upsert: true, new: true }
      );

      return interaction.reply({ content: `🔔 Alerts channel successfully set to ${channel}.`, ephemeral: true });
    }

    // 2. /setkeyword command
    if (commandName === 'setkeyword') {
      const word = interaction.options.getString('word').trim().toLowerCase();

      if (!word) {
        return interaction.reply({ content: 'Please specify a valid keyword.', ephemeral: true });
      }

      const configDoc = await GuildConfig.findOne({ guildId });
      const keywords = configDoc ? configDoc.keywords : [];

      if (keywords.includes(word)) {
        return interaction.reply({ content: `⚠️ Already tracking the keyword \`${word}\`.`, ephemeral: true });
      }

      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $addToSet: { keywords: word } },
        { upsert: true, new: true }
      );

      return interaction.reply({ content: `✅ Started tracking keyword: \`${word}\`.`, ephemeral: true });
    }

    // 3. /removekeyword command
    if (commandName === 'removekeyword') {
      const word = interaction.options.getString('word').trim().toLowerCase();

      if (!word) {
        return interaction.reply({ content: 'Please specify a valid keyword.', ephemeral: true });
      }

      const configDoc = await GuildConfig.findOne({ guildId });
      const keywords = configDoc ? configDoc.keywords : [];

      if (!keywords.includes(word)) {
        return interaction.reply({ content: `⚠️ Keyword \`${word}\` is not currently being tracked.`, ephemeral: true });
      }

      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $pull: { keywords: word } },
        { new: true }
      );

      return interaction.reply({ content: `❌ Stopped tracking keyword: \`${word}\`.`, ephemeral: true });
    }

    // 4. /listkeywords command
    if (commandName === 'listkeywords') {
      const configDoc = await GuildConfig.findOne({ guildId });
      const keywords = configDoc ? configDoc.keywords : [];
      const mode = configDoc ? configDoc.mode : 'new-only';
      const channelId = configDoc ? configDoc.channelId : null;

      if (keywords.length === 0) {
        return interaction.reply({
          content: `📝 No keywords are currently tracked for this server.\nAlert Channel: ${channelId ? `<#${channelId}>` : 'Not set'}\nMode: \`${mode}\``
        });
      }

      const keywordList = keywords.map(kw => `• \`${kw}\``).join('\n');
      return interaction.reply({
        content: `📋 **Tracked Keywords:**\n${keywordList}\n\n📢 **Alert Channel:** ${channelId ? `<#${channelId}>` : 'Not set'}\n⚙️ **Mode:** \`${mode}\` (${mode === 'new-only' ? 'Under 48h age limit' : 'All matches'})`
      });
    }

    // 5. /setmode command
    if (commandName === 'setmode') {
      const mode = interaction.options.getString('mode');

      await GuildConfig.findOneAndUpdate(
        { guildId },
        { mode },
        { upsert: true, new: true }
      );

      const modeText = mode === 'new-only' ? 'New Accounts Only (under 48h)' : 'All Matches';
      return interaction.reply({ content: `⚙️ Alert mode updated to: **${modeText}**.`, ephemeral: true });
    }

    // 6. /setmonitorchannel command
    if (commandName === 'setmonitorchannel') {
      const channel = interaction.options.getChannel('channel');

      await GuildConfig.findOneAndUpdate(
        { guildId },
        { monitorChannelId: channel.id },
        { upsert: true, new: true }
      );

      return interaction.reply({ content: `🔔 Tweet monitoring alert channel successfully set to ${channel}.`, ephemeral: true });
    }

    // 7. /setmonitorkeywords command
    if (commandName === 'setmonitorkeywords') {
      const wordsStr = interaction.options.getString('words');
      const words = wordsStr.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

      if (words.length === 0) {
        return interaction.reply({ content: 'Please specify at least one valid keyword.', ephemeral: true });
      }

      await GuildConfig.findOneAndUpdate(
        { guildId },
        { monitorKeywords: words },
        { upsert: true, new: true }
      );

      return interaction.reply({ content: `✅ Tweet monitoring keywords successfully set to:\n${words.map(w => `• \`${w}\``).join('\n')}`, ephemeral: true });
    }

    // 8. /listmonitor command
    if (commandName === 'listmonitor') {
      const configDoc = await GuildConfig.findOne({ guildId });
      const monitorChannelId = configDoc ? configDoc.monitorChannelId : null;
      const monitorKeywords = configDoc ? configDoc.monitorKeywords : ['early find', 'early', 'alpha', 'found early'];

      const keywordsList = monitorKeywords.map(w => `• \`${w}\``).join('\n');
      return interaction.reply({
        content: `📋 **Tweet Monitor Settings:**\n📢 **Alert Channel:** ${monitorChannelId ? `<#${monitorChannelId}>` : 'Not set'}\n\n🔑 **Monitored Keywords:**\n${keywordsList}`
      });
    }

  } catch (error) {
    console.error('Error handling slash command interaction:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command.', ephemeral: true });
      }
    } catch (replyErr) {
      console.error('Failed to send error reply:', replyErr);
    }
  }
});

// Client Ready Setup
client.once('ready', async () => {
  console.log(`Logged in to Discord as ${client.user.tag}!`);

  // Establish initial Twitter connection on startup to verify credentials/load cookies
  console.log('Initializing Twitter client on startup...');
  try {
    await getTwitterScraper();
    console.log('Twitter client initial validation check passed.');
  } catch (err) {
    console.error('Twitter initial client validation check failed:', err.message);
  }

  // Setup Poll Scheduling
  console.log(`Scheduling Twitter polling with cron expression: "${config.pollIntervalCron}"`);
  cron.schedule(config.pollIntervalCron, async () => {
    try {
      await pollTwitter();
      await pollTimeline();
    } catch (err) {
      console.error('Unhandled error during Twitter poll execution:', err.message);
    }
  });

  // Run a poll cycle immediately on startup
  console.log('Executing immediate startup Twitter poll...');
  await pollTwitter();
  await pollTimeline();
});

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

// Connect to MongoDB and Log In to Discord
(async () => {
  await connectDB(config.mongoUri);
  await client.login(config.discordToken);
})();

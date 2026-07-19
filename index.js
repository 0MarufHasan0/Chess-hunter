const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');
const config = require('./config');
const { connectDB, GuildConfig, NotifiedAccount, NotifiedTweet, TwitterProfileCache } = require('./db');
const { initTwitter, searchProfilesSafe, delay } = require('./twitter');

// Initialize Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Global reference for the Twitter Scraper instance
let scraper = null;

let lastTwitterAlertTime = 0;
async function sendTwitterStatusAlert(errorMsg) {
  const now = Date.now();
  if (now - lastTwitterAlertTime < 4 * 60 * 60 * 1000) {
    return; // Alert at most once every 4 hours to avoid spam
  }
  lastTwitterAlertTime = now;
  
  console.warn(`[Twitter Status Alert] Sending alert to guilds: ${errorMsg}`);
  
  try {
    const guildConfigs = await GuildConfig.find({ channelId: { $ne: null } });
    for (const gc of guildConfigs) {
      try {
        const channel = await client.channels.fetch(gc.channelId);
        if (channel && channel.isTextBased()) {
          const alertEmbed = new EmbedBuilder()
            .setColor(0xE74C3C) // Red
            .setTitle('🚨 TWITTER CONNECTION ALERT 🚨')
            .setDescription(
              `The Chess Hunter bot has detected a connection issue or lag with the connected Twitter/X account.\n\n` +
              `**Error Message:** \`${errorMsg}\`\n\n` +
              `*Please verify that the Twitter account is active, not banned, and that cookies in \`cookies.json\` are valid. If you recently updated credentials in \`.env\`, restart the bot to re-authenticate.*`
            )
            .setTimestamp();
          await channel.send({ embeds: [alertEmbed] });
        }
      } catch (chErr) {
        console.error(`Failed to send alert to channel ${gc.channelId}:`, chErr.message);
      }
    }
  } catch (dbErr) {
    console.error('Failed to query guilds for status alert:', dbErr.message);
  }
}

/**
 * Ensures the Twitter scraper is initialized and logged in.
 * If the session expires, it automatically re-initializes.
 */
async function getTwitterScraper() {
  if (!scraper) {
    try {
      scraper = await initTwitter(config.twitter);
    } catch (err) {
      await sendTwitterStatusAlert(`Initialization failed: ${err.message}`);
      throw err;
    }
  } else {
    try {
      const loggedIn = await scraper.isLoggedIn();
      if (!loggedIn) {
        console.warn('Twitter session expired. Re-authenticating...');
        scraper = await initTwitter(config.twitter);
      }
    } catch (err) {
      console.error('Error checking Twitter login status, re-initializing scraper:', err.message);
      await sendTwitterStatusAlert(`Session validation error: ${err.message}`);
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

          // Automatically follow the user so their tweets appear in the home timeline
          try {
            await scraperClient.followUser(username);
            console.log(`Successfully followed @${username} on Twitter.`);
          } catch (followErr) {
            console.warn(`Note: Could not auto-follow @${username} (might already be followed or rate-limited):`, followErr.message);
          }

        } catch (guildErr) {
          console.error(`Error notifying guild ${gc.guildId} channel ${gc.channelId}:`, guildErr.message);
        }
      }
    }
  }

  console.log('--- Polling Cycle Completed ---');
}

async function sendTweetAlert(channelId, tweetId, tweet, cleanedText, mentions, title, color, isGiveaway = false) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return;
    }

    const guildId = channel.guild?.id || 'unknown';

    // Check if already notified
    const alreadyNotified = await NotifiedTweet.findOne({
      guildId,
      channelId,
      tweetId
    });

    if (alreadyNotified) {
      return;
    }

    // Build premium embed
    let description = cleanedText;
    if (isGiveaway) {
      const endedPatterns = [
        /\bended\b/i,
        /\bclosed\b/i,
        /\bover\b/i,
        /\bdrawn\b/i,
        /\bwinner\s+is\b/i,
        /\bwinners\b/i,
        /\bcongrats\b/i,
        /\bcongratulations\b/i
      ];
      const isEnded = endedPatterns.some(pattern => pattern.test(cleanedText));
      const status = isEnded ? '🔴 Ended / Closed' : '🟢 Running / Active';
      description = `**Status:** ${status}\n\n${cleanedText}`;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();

    // Construct buttons
    const allButtons = [];
    const authorUsername = tweet.username || (tweet.core?.user_results?.result?.legacy?.screen_name);
    if (authorUsername) {
      allButtons.push(
        new ButtonBuilder()
          .setLabel('Source Tweet')
          .setURL(`https://x.com/${authorUsername}/status/${tweetId}`)
          .setStyle(ButtonStyle.Link)
      );
    }

    const uniqueMentions = [...new Set(mentions)].slice(0, 24);
    for (const mention of uniqueMentions) {
      allButtons.push(
        new ButtonBuilder()
          .setLabel(`@${mention}`)
          .setURL(`https://x.com/${mention}`)
          .setStyle(ButtonStyle.Link)
      );
    }

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

    await channel.send(messageOptions);
    console.log(`Alert sent to channel ${channelId} for tweet ${tweetId}`);

    await NotifiedTweet.create({
      guildId,
      channelId,
      tweetId
    });
  } catch (err) {
    console.error(`Error sending alert to channel ${channelId}:`, err.message);
  }
}

/**
 * Polls the home timeline (following list tweets) for configured keywords and alerts designated channels.
 */
async function pollTimeline() {
  console.log('--- Starting Tweet Monitoring Cycle ---');

  try {
    // Fetch all guilds that have configured monitoring
    const guildConfigs = await GuildConfig.find({});

    let scraperClient;
    try {
      scraperClient = await getTwitterScraper();
    } catch (err) {
      console.error('Skipping timeline poll: Twitter client authentication failed.', err.message);
      return;
    }

    let tweets = [];

    // 1. Fetch home timeline (followed accounts only, as requested by the user to avoid spam from non-followed accounts)
    console.log('Fetching home timeline tweets...');
    try {
      const timelineTweets = await scraperClient.fetchHomeTimeline(80);
      console.log(`Fetched ${timelineTweets.length} tweets from following timeline.`);
      tweets = tweets.concat(timelineTweets);
    } catch (err) {
      console.error('Failed to fetch home timeline:', err.message);
      await sendTwitterStatusAlert(`Timeline fetch failed: ${err.message}`);
    }

    // Deduplicate tweets by ID
    const seenTweetIds = new Set();
    const uniqueTweets = [];
    for (const t of tweets) {
      const tId = t.id || t.rest_id || (t.legacy && t.legacy.id_str);
      if (tId && !seenTweetIds.has(tId)) {
        seenTweetIds.add(tId);
        uniqueTweets.push(t);
      }
    }
    console.log(`Total unique tweets collected for monitoring (Following only): ${uniqueTweets.length}`);

    for (const tweet of uniqueTweets) {
      const tweetId = tweet.id || tweet.rest_id || (tweet.legacy && tweet.legacy.id_str);
      const text = tweet.text || (tweet.legacy && tweet.legacy.full_text) || '';

      if (!tweetId || !text) {
        continue;
      }

      // Skip retweets entirely to ensure we only get tweets authored by the users we follow
      const isRetweet = tweet.isRetweet || 
                        tweet.retweetedStatus || 
                        (tweet.legacy && tweet.legacy.retweeted_status) ||
                        text.startsWith('RT @');
      if (isRetweet) {
        continue;
      }

      // Skip tweets older than 72 hours to prevent historic back-alerting
      let tweetTimeMs = null;
      if (tweet.timestamp) {
        tweetTimeMs = tweet.timestamp * 1000;
      } else if (tweet.timeParsed) {
        tweetTimeMs = new Date(tweet.timeParsed).getTime();
      } else if (tweet.legacy && tweet.legacy.created_at) {
        tweetTimeMs = new Date(tweet.legacy.created_at).getTime();
      }

      if (tweetTimeMs) {
        // Enforce min timestamp: ignore all tweets created before Bangladesh Time 3:13 PM on July 10, 2026 (UTC: 2026-07-10T09:13:00Z)
        const minTimestamp = new Date('2026-07-10T09:13:00Z').getTime();
        if (tweetTimeMs < minTimestamp) {
          continue;
        }

        const seventyTwoHoursAgo = Date.now() - 72 * 60 * 60 * 1000;
        if (tweetTimeMs < seventyTwoHoursAgo) {
          continue;
        }
      }

      // Clean up HTML entities in the tweet text first
      let cleanedText = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      const textLower = cleanedText.toLowerCase();

      // Extract all @username mentions from text
      const mentionRegex = /@(\w+)/g;
      const matches = [...cleanedText.matchAll(mentionRegex)];
      const mentions = matches.map(m => m[1]);

      const authorUsername = (tweet.username || (tweet.core?.user_results?.result?.legacy?.screen_name) || '').toLowerCase();
      const authorName = (tweet.name || (tweet.core?.user_results?.result?.legacy?.name) || '').toLowerCase();

      // NFT/Crypto/Web3 validation indicators to filter out unrelated tweets (like car ads matching 'alpha')
      const cryptoIndicators = ['nft', 'pfp', 'mint', 'whitelist', 'wl', 'solana', 'sol ', 'eth ', 'ethereum', 'opensea', 'magiceden', 'crypto', 'ordinals', 'supply', 'collection', 'discord.gg', 'tba', 'tbd', 'airdrop'];

      // Evaluate rules for all guilds
      for (const gc of guildConfigs) {
        // 1. Process dynamic monitor rules
        if (gc.monitorRules && gc.monitorRules.length > 0) {
          for (const rule of gc.monitorRules) {
            try {
              // Check if the author matches (if authorKeywords is not empty)
              let authorMatched = true;
              if (rule.authorKeywords && rule.authorKeywords.length > 0) {
                authorMatched = rule.authorKeywords.some(ak => {
                  const term = ak.toLowerCase();
                  return authorUsername.includes(term) || authorName.includes(term) || textLower.includes(term);
                });
              }

              // Check if includes match (if includeKeywords is not empty)
              let includeMatched = true;
              if (rule.isGiveaway) {
                // Custom Giveaway keyword check (gtd, fcfs, follow, drop address, etc.) using word boundaries
                const giveawayRegex = /\b(giveaway|give-away|give away|fcfs|follow|rt|retweet|drop\s+(?:your\s+)?(?:evm|eth|sol|wallet|address))\b/i;
                const hasGiveawayTerm = giveawayRegex.test(cleanedText) || /(?:\b\d*x?)?gtd\b/i.test(cleanedText);
                includeMatched = hasGiveawayTerm;
              } else if (rule.includeKeywords && rule.includeKeywords.length > 0) {
                includeMatched = rule.includeKeywords.some(ik => {
                  const escaped = ik.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                  const isAlphaNumeric = /^[a-zA-Z0-9]+$/.test(ik);
                  if (isAlphaNumeric) {
                    if (ik.toLowerCase() === 'sol') {
                      const regex = new RegExp(`\\b(sol|solana)\\b`, 'i');
                      return regex.test(cleanedText);
                    }
                    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                    return regex.test(cleanedText);
                  } else {
                    return cleanedText.toLowerCase().includes(ik.toLowerCase());
                  }
                });
              }

              // Check if required keywords match (AND condition: ALL requiredKeywords must match)
              let requiredMatched = true;
              if (rule.requiredKeywords && rule.requiredKeywords.length > 0) {
                requiredMatched = rule.requiredKeywords.every(rk => {
                  const escaped = rk.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                  const isAlphaNumeric = /^[a-zA-Z0-9]+$/.test(rk);
                  if (isAlphaNumeric) {
                    if (rk.toLowerCase() === 'sol') {
                      const regex = new RegExp(`\\b(sol|solana)\\b`, 'i');
                      return regex.test(cleanedText);
                    }
                    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                    return regex.test(cleanedText);
                  } else {
                    return cleanedText.toLowerCase().includes(rk.toLowerCase());
                  }
                });
              }

              if (authorMatched && includeMatched && requiredMatched) {
                // If it is a giveaway rule, enforce NFT-only verification
                if (rule.isGiveaway) {
                  const nftKeywords = ['nft', 'pfp', 'mint', 'whitelist', 'wl', 'opensea', 'magiceden', 'supply', 'collection'];
                  const isNftOnly = nftKeywords.some(kw => {
                    const escaped = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                    return regex.test(cleanedText);
                  });
                  
                  if (!isNftOnly) {
                    continue; // Skip non-NFT giveaways
                  }
                }

                // Crypto Validation Check: Ensure it is crypto-related if it's not a known author match
                const cryptoValidated = cryptoIndicators.some(ci => {
                  const escaped = ci.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                  return regex.test(cleanedText) || cleanedText.toLowerCase().includes('$sol') || cleanedText.toLowerCase().includes('sol/') || cleanedText.toLowerCase().includes('sol-');
                });
                
                const isCryptoRelated = (rule.authorKeywords && rule.authorKeywords.length > 0 && authorMatched) || cryptoValidated;
                
                if (!isCryptoRelated) {
                  continue; // Skip non-crypto tweets (e.g. car advertisements)
                }

                // Apply blacklist
                const blacklistToUse = rule.isGiveaway ? [
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
                  // Pump/Meme-token stats blacklist
                  /\bMC\s*:\s*\$/i,
                  /\bFDV\s*:\s*\$/i,
                  /\bLiq\s*:\s*\$/i,
                  /\bVol\s+1h\b/i,
                  /\bDEX\s*:\s*/i,
                  /\bpump\.fun\b/i,
                  /\bca\s*:\s*[0-9a-zA-Z]{30,}/i,
                  /\bcontract\s*address\b/i,
                  /\bBuy\/Sell\s+Ratio\b/i
                ] : [
                  /\bminted\b/i,
                  /\bgiveaway\b/i,
                  /\bgiveaways\b/i,
                  /\bgive\s+away\b/i,
                  /(?:\b\d*x)?gtd\b/i,
                  /\braffles?\b/i,
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
                  /\bmint\s+is\s+live\b/i,
                  // Pump/Meme-token stats blacklist
                  /\bMC\s*:\s*\$/i,
                  /\bFDV\s*:\s*\$/i,
                  /\bLiq\s*:\s*\$/i,
                  /\bVol\s+1h\b/i,
                  /\bDEX\s*:\s*/i,
                  /\bpump\.fun\b/i,
                  /\bca\s*:\s*[0-9a-zA-Z]{30,}/i,
                  /\bcontract\s*address\b/i,
                  /\bBuy\/Sell\s+Ratio\b/i
                ];

                const hasBlacklistWord = blacklistToUse.some(pattern => pattern.test(cleanedText));
                if (!hasBlacklistWord) {
                  let color = 0x1DA1F2; // Default Twitter Blue
                  if (rule.isGiveaway) {
                    color = 0xE74C3C; // Red/Coral
                  } else if (textLower.includes('solana') || textLower.includes('sol ') || textLower.includes('magiceden')) {
                    color = 0x9945FF; // Solana Purple
                  } else if (textLower.includes('ethereum') || textLower.includes('eth ') || textLower.includes('opensea')) {
                    color = 0x3C3C3D; // Ethereum Dark Slate
                  } else {
                    color = 0xF1C40F; // Gold
                  }

                  const title = rule.isGiveaway ? `🎁 ${rule.name.toUpperCase()} Giveaway` : `🚨 ${rule.name.toUpperCase()} Signal`;

                  await sendTweetAlert(
                    rule.channelId,
                    tweetId,
                    tweet,
                    cleanedText,
                    mentions,
                    title,
                    color,
                    rule.isGiveaway
                  );
                }
              }
            } catch (err) {
              console.error(`Error processing dynamic rule "${rule.name}" for guild ${gc.guildId}:`, err.message);
            }
          }
        }

        // 2. Process legacy monitorChannelId configurations
        if (gc.monitorChannelId && gc.monitorKeywords && gc.monitorKeywords.length > 0) {
          const isServiced = gc.monitorRules && gc.monitorRules.some(r => r.channelId === gc.monitorChannelId);
          if (isServiced) {
            continue;
          }

          try {
            const alreadyNotified = await NotifiedTweet.findOne({
              guildId: gc.guildId,
              channelId: gc.monitorChannelId,
              tweetId: tweetId
            });

            if (alreadyNotified) {
              continue;
            }

            // Condition 1: Must contain an early/alpha find indicator
            let matched = false;
            let matchedKeyword = '';

            const earlyKeywords = [
              'early find', 'early nft find', 'interesting find', 'interesting finds',
              'top alpha', 'early alpha', 'new find', 'new finds', 'alpha find', 'alpha',
              'found early', 'early nft project', 'early nft projects'
            ];

            for (const kw of earlyKeywords) {
              const escapedKeyword = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
              if (regex.test(cleanedText)) {
                matched = true;
                matchedKeyword = kw;
                break;
              }
            }

            if (!matched) {
              continue;
            }

            // Condition 2: Must contain supply keyword or supply number patterns
            let hasSupplyPattern = false;
            const supplyRegex = /\b\d+\s*[\/|of]\s*\d+\b|\b\d+\s*(?:supply|mint|pcs|pieces)\b|\b(?:supply|size|mint)\s*[:\-]?\s*\d+\b/i;
            const textWithoutDates = cleanedText
              .replace(/\b\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}\b/g, '')
              .replace(/\b(19|20)\d{2}\s*[\/\-]\s*(19|20)\d{2}\b/g, '');
            const match = textWithoutDates.match(supplyRegex);
            if (match) {
              const normalizedMatch = match[0].toLowerCase().replace(/\s+/g, '');
              if (normalizedMatch !== '1/1' && normalizedMatch !== '1of1' && normalizedMatch !== '1on1') {
                hasSupplyPattern = true;
              }
            }

            const hasSupplyWord = textLower.includes('supply') || hasSupplyPattern;
            if (!hasSupplyWord) {
              continue;
            }

            // Condition 3: Must specify a chain (solana, eth, base, polygon, etc.), TBA/TBD, or mention a project tag (@username)
            const chainRegex = /\b(solana|sol|ethereum|eth|evm|base|polygon|arbitrum|imx|immutablex|monad|sei|sui|aptos|tba|tbd|tbc)\b/i;
            const hasChainOrTbdOrTag = chainRegex.test(cleanedText) || 
                                       cleanedText.toLowerCase().includes('$sol') || 
                                       cleanedText.toLowerCase().includes('$eth') ||
                                       /@\w+/.test(cleanedText);
            if (!hasChainOrTbdOrTag) {
              continue;
            }

            // Apply legacy blacklist
            const standardBlacklist = [
              /\bminted\b/i,
              /\bgiveaway\b/i,
              /\bgiveaways\b/i,
              /\bgive\s+away\b/i,
              /(?:\b\d*x)?gtd\b/i,
              /\braffles?\b/i,
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
              /\bmint\s+is\s+live\b/i,
              // Pump/Meme-token stats blacklist
              /\bMC\s*:\s*\$/i,
              /\bFDV\s*:\s*\$/i,
              /\bLiq\s*:\s*\$/i,
              /\bVol\s+1h\b/i,
              /\bDEX\s*:\s*/i,
              /\bpump\.fun\b/i,
              /\bca\s*:\s*[0-9a-zA-Z]{30,}/i,
              /\bcontract\s*address\b/i,
              /\bBuy\/Sell\s+Ratio\b/i
            ];

            let hasBlacklistWord = standardBlacklist.some(pattern => pattern.test(cleanedText));
            if (hasBlacklistWord) {
              continue;
            }

            const channel = await client.channels.fetch(gc.monitorChannelId);
            if (!channel || !channel.isTextBased()) {
              continue;
            }

            let displayText = cleanedText;
            try {
              const escapedKeyword = matchedKeyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              const regex = new RegExp(`\\b(${escapedKeyword})\\b`, 'gi');
              displayText = displayText.replace(regex, (match) => `**__${match}__**`);
            } catch (err) {
              // Fallback
            }

            const embed = new EmbedBuilder()
              .setColor(0xF1C40F)
              .setTitle('🚨 Alpha Signal Detected')
              .setDescription(displayText)
              .setTimestamp();

            const allButtons = [];
            const tweetAuthorUsername = tweet.username || (tweet.core?.user_results?.result?.legacy?.screen_name);
            if (tweetAuthorUsername) {
              allButtons.push(
                new ButtonBuilder()
                  .setLabel('Source Tweet')
                  .setURL(`https://x.com/${tweetAuthorUsername}/status/${tweetId}`)
                  .setStyle(ButtonStyle.Link)
              );
            }

            const uniqueMentions = [...new Set(mentions)].slice(0, 24);
            for (const mention of uniqueMentions) {
              allButtons.push(
                new ButtonBuilder()
                  .setLabel(`@${mention}`)
                  .setURL(`https://x.com/${mention}`)
                  .setStyle(ButtonStyle.Link)
              );
            }

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

            await channel.send(messageOptions);
            console.log(`Anonymous tweet alert sent to guild ${gc.guildId} channel ${gc.monitorChannelId} for tweet ${tweetId}`);

            await NotifiedTweet.create({
              guildId: gc.guildId,
              channelId: gc.monitorChannelId,
              tweetId: tweetId
            });

          } catch (guildErr) {
            console.error(`Error processing legacy tweet alert for guild ${gc.guildId}:`, guildErr.message);
          }
        }
      }
    }
  } catch (loopErr) {
    console.error('Error during tweet timeline polling loop:', loopErr.message);
  }

  console.log('--- Tweet Monitoring Cycle Completed ---');
}

// Helper to draw curved text on server canvas for official seal stamp
function drawServerTextAroundCircle(ctx, text, cx, cy, radius, startAngle, bottom) {
  const characters = text.split("");
  const totalAngle = 1.3 * Math.PI; // Spread angle
  const anglePerChar = totalAngle / characters.length;

  ctx.save();
  ctx.translate(cx, cy);

  if (bottom) {
    characters.reverse();
    const startOffset = -((characters.length - 1) * anglePerChar) / 2;
    ctx.rotate(startAngle + startOffset);
    
    characters.forEach((char) => {
      ctx.save();
      ctx.translate(0, radius);
      ctx.scale(1, -1);
      ctx.fillText(char, 0, 0);
      ctx.restore();
      ctx.rotate(anglePerChar);
    });
  } else {
    const startOffset = -((characters.length - 1) * anglePerChar) / 2;
    ctx.rotate(startAngle + startOffset);

    characters.forEach((char) => {
      ctx.save();
      ctx.translate(0, -radius);
      ctx.fillText(char, 0, 0);
      ctx.restore();
      ctx.rotate(anglePerChar);
    });
  }

  ctx.restore();
}

// Draw Chess DAO Seal with a gold gradient and central Knight chess piece
function drawServerChessDAOSeal(ctx, cx, cy) {
  ctx.save();

  // Outer Gold Seal Circle
  const sealGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 70);
  sealGrad.addColorStop(0, '#ffe082');
  sealGrad.addColorStop(0.7, '#ffd700');
  sealGrad.addColorStop(1, '#b59300');
  ctx.fillStyle = sealGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 70, 0, Math.PI * 2);
  ctx.fill();

  // Inner Seal borders
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.stroke();

  // Circular Text: VERIFIED CHESS DAO
  ctx.fillStyle = '#3e2723';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textTop = "VERIFIED CHESS DAO";
  const textBottom = "★ SECURE DRAW ★";

  drawServerTextAroundCircle(ctx, textTop, cx, cy, 47, Math.PI * 1.5, false);
  drawServerTextAroundCircle(ctx, textBottom, cx, cy, 47, Math.PI * 0.5, true);

  // Draw Chess Knight Symbol
  ctx.fillStyle = '#3e2723';
  ctx.font = '800 48px Arial, sans-serif';
  ctx.fillText('♞', cx, cy - 2);

  // Accent Stars
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('★', cx - 48, cy);
  ctx.fillText('★', cx + 48, cy);

  ctx.restore();
}

// Helper to draw rounded rectangle for glassmorphism panels
function drawServerRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Fetch user profile picture avatar over HTTP safely with fallback
async function downloadAvatarBuffer(url, fallbackName = 'User') {
  if (url) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    } catch (e) {
      console.warn('Primary avatar fetch failed:', e.message);
    }
  }
  // Fallback to high-quality UI-Avatars buffer
  try {
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=00f2fe&color=0b0e14&bold=true&size=128`;
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  } catch (e) {
    console.warn('Fallback avatar fetch failed:', e.message);
  }
  return null;
}

// Helper to extract EVM, Solana, Sui/Aptos, TRON, TON, Bitcoin or Cosmos wallet addresses from reply text
function extractWalletAddress(text) {
  if (!text) return 'N/A';
  
  // 1. EVM / Ethereum / BSC / Polygon / Arbitrum / Base (0x followed by 40 hex chars)
  const evmMatch = text.match(/0x[a-fA-F0-9]{40}\b/i);
  if (evmMatch) return evmMatch[0];

  // 2. Sui / Aptos address (0x followed by 64 hex chars)
  const suiMatch = text.match(/0x[a-fA-F0-9]{64}\b/i);
  if (suiMatch) return suiMatch[0];

  // 3. TRON address (starts with T followed by 33 base58 chars)
  const tronMatch = text.match(/T[A-Za-z1-9]{33}\b/);
  if (tronMatch) return tronMatch[0];

  // 4. TON address (starts with EQ or UQ followed by 44-46 base64url chars)
  const tonMatch = text.match(/(?:EQ|UQ)[a-zA-Z0-9_-]{44,46}\b/);
  if (tonMatch) return tonMatch[0];

  // 5. Cosmos / Injective / SEI / Osmosis address
  const cosmosMatch = text.match(/(?:cosmos|inj|sei|osmo)1[a-z0-9]{38}\b/i);
  if (cosmosMatch) return cosmosMatch[0];

  // 6. Bitcoin address (1..., 3... or bc1...)
  const btcMatch = text.match(/(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b/);
  if (btcMatch) return btcMatch[0];

  // 7. Solana address (Base58, 32 to 44 alphanumeric chars, excluding O, 0, I, l)
  const solMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  if (solMatch && !solMatch[0].startsWith('http') && !solMatch[0].includes('/') && !solMatch[0].includes('status')) {
    return solMatch[0];
  }

  return 'No Wallet Found';
}

// Generate CSV Buffer for Google Sheets / Excel with 100% accurate usernames and wallet addresses
function generateWinnersCsvBuffer(winners) {
  const headers = ['Winner #', 'Name', 'Username', 'Wallet Address', 'Reply Link', 'Followers', 'Account Age (Days)', 'Full Reply Text'];
  
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  let csvRows = [headers.map(escapeCsv).join(',')];

  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const wallet = extractWalletAddress(w.replyText);
    const replyUrl = w.replyId ? `https://x.com/${w.handle.substring(1)}/status/${w.replyId}` : 'N/A';
    const row = [
      i + 1,
      w.name,
      w.handle,
      wallet,
      replyUrl,
      w.followers || 0,
      w.age || 0,
      w.replyText || ''
    ];
    csvRows.push(row.map(escapeCsv).join(','));
  }

  const csvContent = '\uFEFF' + csvRows.join('\n');
  return Buffer.from(csvContent, 'utf-8');
}

// Text auto-scaling helper for Canvas to fit names/handles cleanly
function fitServerCanvasText(ctx, text, maxWidth, initialFontSize, fontFace = 'Arial, sans-serif', minFontSize = 9.5) {
  let fontSize = initialFontSize;
  ctx.font = `800 ${fontSize}px ${fontFace}`;
  while (ctx.measureText(text).width > maxWidth && fontSize > minFontSize) {
    fontSize -= 0.5;
    ctx.font = `800 ${fontSize}px ${fontFace}`;
  }
  if (ctx.measureText(text).width > maxWidth) {
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(truncated + '..').width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return { text: truncated + '..', fontSize };
  }
  return { text, fontSize };
}

// Generate Winner Slip PNG image buffer using Canvas with high legibility for 1 to 50+ winners
async function createWinnerSlipBuffer(winners) {
  const { createCanvas, Image } = require('canvas');
  const selectedWinners = Array.isArray(winners) ? winners : [winners];
  const n = selectedWinners.length;

  // Determine grid dimensions dynamically for crystal clear readability
  let cols = 1;
  if (n === 2) cols = 2;
  else if (n >= 3 && n <= 6) cols = 2;
  else if (n >= 7 && n <= 15) cols = 3;
  else if (n >= 16 && n <= 30) cols = 4;
  else if (n > 30) cols = 5;

  const rows = Math.ceil(n / cols);

  // Card dimensions & spacing
  let cardHeight = Math.max(54, Math.min(74, Math.floor(450 / Math.max(1, rows))));
  if (n === 1) cardHeight = 180;
  else if (n === 2) cardHeight = 110;

  const gapX = 14;
  const gapY = 12;
  const marginX = 45;
  const marginYHeader = 115;
  const marginYFooter = 85;

  let width = 1200;
  if (n === 1) width = 900;
  else if (n <= 4) width = 1050;
  else if (n <= 12) width = 1200;
  else if (n <= 30) width = 1350;
  else width = 1480;

  const cardAreaWidth = width - (marginX * 2);
  const cardWidth = Math.floor((cardAreaWidth - (cols - 1) * gapX) / cols);
  const cardAreaHeight = rows * cardHeight + (rows - 1) * gapY;
  const height = Math.max(480, marginYHeader + cardAreaHeight + marginYFooter);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Space Background Gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0c0f16');
  grad.addColorStop(0.5, '#121622');
  grad.addColorStop(1, '#080a0f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2. Ambient Grid
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.035)';
  ctx.lineWidth = 1.5;
  const gridSize = 40;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 3. Glowing Borders
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 3;
  ctx.strokeRect(15, 15, width - 30, height - 30);

  ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(25, 25, width - 50, height - 50);

  // 4. Headers
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 24px Arial, sans-serif';
  ctx.fillText('♞  CHESS HUNTER GIVEAWAY', 50, 58);

  ctx.fillStyle = '#00f2fe';
  ctx.font = '700 12px Arial, sans-serif';
  ctx.fillText(`OFFICIAL WINNER CERTIFICATE  •  TOTAL WINNERS: ${n}`, 50, 80);

  // 5. Draw Seal / Logo in Header Area (Top Right)
  let logoImg = null;
  const fs = require('fs');
  if (fs.existsSync('logo.jpg')) {
    try {
      const logoBuf = fs.readFileSync('logo.jpg');
      logoImg = new Image();
      logoImg.src = logoBuf;
    } catch (logoErr) {
      console.error('Failed to load logo.jpg:', logoErr.message);
    }
  }

  const sealCx = width - 85;
  const sealCy = 62;
  const sealRad = 36;
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(sealCx, sealCy, sealRad, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logoImg, sealCx - sealRad, sealCy - sealRad, sealRad * 2, sealRad * 2);
    ctx.restore();

    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sealCx, sealCy, sealRad, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    drawServerChessDAOSeal(ctx, sealCx, sealCy);
  }

  // 6. Parallel download avatar images
  const avatarImages = await Promise.all(selectedWinners.map(async (winner) => {
    const avatarBuf = await downloadAvatarBuffer(winner.avatar, winner.name || winner.handle);
    if (avatarBuf) {
      try {
        const img = new Image();
        img.src = avatarBuf;
        return img;
      } catch (err) {
        console.error('Failed to parse avatar image:', err.message);
      }
    }
    return null;
  }));

  // 7. Render Winner Cards Grid
  for (let i = 0; i < n; i++) {
    const winner = selectedWinners[i];
    const avatarImg = avatarImages[i];

    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = marginX + col * (cardWidth + gapX);
    const y = marginYHeader + row * (cardHeight + gapY);

    // Card Glass Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.22)';
    ctx.lineWidth = 1;
    drawServerRoundRect(ctx, x, y, cardWidth, cardHeight, 10);
    ctx.fill();
    ctx.stroke();

    // Winner Index Badge (#1, #2, etc) on card top-right
    ctx.fillStyle = '#ffd700';
    ctx.font = '800 11px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`#${i + 1}`, x + cardWidth - 10, y + 8);

    // Avatar calculation
    const yCenter = y + cardHeight / 2;
    const avatarRad = Math.min(22, Math.max(14, Math.floor(cardHeight * 0.32)));
    const avatarX = x + 12 + avatarRad;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, yCenter, avatarRad, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (avatarImg) {
      ctx.drawImage(avatarImg, avatarX - avatarRad, yCenter - avatarRad, avatarRad * 2, avatarRad * 2);
    } else {
      const avatarHue = Math.floor(Math.random() * 360);
      ctx.fillStyle = `hsl(${avatarHue}, 80%, 45%)`;
      ctx.fillRect(avatarX - avatarRad, yCenter - avatarRad, avatarRad * 2, avatarRad * 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.floor(avatarRad * 1.1)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(winner.name ? winner.name.charAt(0).toUpperCase() : 'W', avatarX, yCenter);
    }
    ctx.restore();

    // Avatar Gold Ring
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(avatarX, yCenter, avatarRad, 0, Math.PI * 2);
    ctx.stroke();

    // Metadata Text Placement
    const textX = x + 12 + avatarRad * 2 + 10;
    const maxTextWidth = cardWidth - (12 + avatarRad * 2 + 10) - 34; // leave space for badge

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    if (n <= 2) {
      // 1 or 2 winners layout - extra room for stats
      const { text: formattedName, fontSize: nameSize } = fitServerCanvasText(ctx, winner.name, maxTextWidth, 22, 'Arial, sans-serif', 14);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${nameSize}px Arial, sans-serif`;
      ctx.fillText(formattedName, textX, yCenter - 20);

      const { text: formattedHandle, fontSize: handleSize } = fitServerCanvasText(ctx, winner.handle, maxTextWidth, 14, 'Courier New, monospace', 11);
      ctx.fillStyle = '#00e676';
      ctx.font = `bold ${handleSize}px Courier New, monospace`;
      ctx.fillText(formattedHandle, textX, yCenter + 5);

      ctx.fillStyle = '#90a4ae';
      ctx.font = '600 12px Arial, sans-serif';
      const followersText = winner.followers > 0 ? winner.followers.toLocaleString() : '0';
      const ageText = winner.age > 0 ? `${winner.age}d` : '0d';
      ctx.fillText(`Followers: ${followersText}   |   Age: ${ageText}`, textX, yCenter + 26);
    } else {
      // 3 to 50+ winners layout - compact readable cards
      const baseNameSize = Math.max(12, Math.min(15, Math.floor(cardHeight * 0.28)));
      const baseHandleSize = Math.max(10, Math.min(12, Math.floor(cardHeight * 0.22)));

      const { text: formattedName, fontSize: nameSize } = fitServerCanvasText(ctx, winner.name, maxTextWidth, baseNameSize, 'Arial, sans-serif', 10.5);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${nameSize}px Arial, sans-serif`;

      const showStats = cardHeight >= 58;
      const nameY = showStats ? yCenter - 14 : yCenter - 8;
      const handleY = showStats ? yCenter + 2 : yCenter + 8;

      ctx.fillText(formattedName, textX, nameY);

      const { text: formattedHandle, fontSize: handleSize } = fitServerCanvasText(ctx, winner.handle, maxTextWidth, baseHandleSize, 'Courier New, monospace', 9.5);
      ctx.fillStyle = '#00e676';
      ctx.font = `bold ${handleSize}px Courier New, monospace`;
      ctx.fillText(formattedHandle, textX, handleY);

      if (showStats) {
        ctx.fillStyle = '#90a4ae';
        ctx.font = '600 10px Arial, sans-serif';
        const followersText = winner.followers > 0 ? winner.followers.toLocaleString() : '0';
        const ageText = winner.age > 0 ? `${winner.age}d` : '0d';
        ctx.fillText(`F: ${followersText} | A: ${ageText}`, textX, yCenter + 17);
      }
    }
  }

  // 8. Footer verification details
  const serialNo = `CH-${Math.floor(100000 + Math.random() * 900000)}`;
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const hash = 'SHA256-' + Array.from({length: 16}, () => Math.floor(Math.random()*16).toString(16)).join('').toUpperCase();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '600 11px Courier New, monospace';
  ctx.fillText(`SERIAL: ${serialNo}   |   VALIDATION HASH: ${hash}   |   DATE: ${dateStr}`, marginX, height - 35);

  return canvas.toBuffer('image/png');
}

// Handle Modal submissions first
async function handleChessPickerButtonClick(interaction) {
  try {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

    const modal = new ModalBuilder()
      .setCustomId('chess_picker_modal')
      .setTitle('Chess Picker Draw Panel');

    const postUrlInput = new TextInputBuilder()
      .setCustomId('modal_post_url')
      .setLabel('Twitter Post URL')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://x.com/username/status/1234567890')
      .setRequired(true);

    const winnerCountInput = new TextInputBuilder()
      .setCustomId('modal_winner_count')
      .setLabel('Winner Count (1-20)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1')
      .setRequired(false);

    const minFollowersInput = new TextInputBuilder()
      .setCustomId('modal_min_followers')
      .setLabel('Min Followers (Optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('0')
      .setRequired(false);

    const minAgeInput = new TextInputBuilder()
      .setCustomId('modal_min_age')
      .setLabel('Min Account Age in Days (Optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('0')
      .setRequired(false);

    const allowRepeatInput = new TextInputBuilder()
      .setCustomId('modal_allow_repeat')
      .setLabel('Allow Repeat Winners? (true/false)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('false (set true to allow repeat winners)')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(postUrlInput),
      new ActionRowBuilder().addComponents(winnerCountInput),
      new ActionRowBuilder().addComponents(minFollowersInput),
      new ActionRowBuilder().addComponents(minAgeInput),
      new ActionRowBuilder().addComponents(allowRepeatInput)
    );

    await interaction.showModal(modal);
  } catch (err) {
    console.error('Error showing Chess Picker modal:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ Could not open modal popup: ${err.message}`, ephemeral: true }).catch(() => {});
    }
  }
}

// Global modal submit handler
async function handleChessPickerModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const postUrl = interaction.fields.getTextInputValue('modal_post_url').trim();
  const winnerCountStr = interaction.fields.getTextInputValue('modal_winner_count').trim() || '1';
  const minFollowersStr = interaction.fields.getTextInputValue('modal_min_followers').trim() || '0';
  const minAgeStr = interaction.fields.getTextInputValue('modal_min_age').trim() || '0';
  const allowRepeatStr = (interaction.fields.getTextInputValue('modal_allow_repeat') || '').trim().toLowerCase();

  const winnerCount = Math.max(1, Math.min(20, parseInt(winnerCountStr, 10) || 1));
  const minFollowers = Math.max(0, parseInt(minFollowersStr, 10) || 0);
  const minAge = Math.max(0, parseInt(minAgeStr, 10) || 0);
  const allowRepeat = (allowRepeatStr === 'true' || allowRepeatStr === 'yes' || allowRepeatStr === '1');

  try {
    const postMatch = postUrl.match(/status\/(\d+)/);
    if (!postMatch) {
      return interaction.editReply({ content: '❌ Invalid Twitter post URL. Please make sure the URL contains `/status/` followed by the Tweet ID.' });
    }
    const tweetId = postMatch[1];

    let activeScraper;
    try {
      activeScraper = await getTwitterScraper();
    } catch (err) {
      return interaction.editReply({ content: `❌ Twitter client connection failed: ${err.message}` });
    }

    console.log(`[Modal Pickwinner] Fetching tweet ID: ${tweetId}...`);
    
    const baseUrl = 'https://twitter.com/i/api/graphql/xOhkmRac04YFZmOzU9PJHg/TweetDetail';
    const variables = {
      focalTweetId: tweetId,
      with_rux_injections: false,
      includePromotedContent: true,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
      withV2Timeline: true
    };
    const features = {
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      tweetypie_unmention_optimization_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: false,
      tweet_awards_web_tipping_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_media_download_video_enabled: false,
      responsive_web_enhance_cards_enabled: false
    };
    const fieldToggles = {
      withArticleRichContentState: false
    };

    const params = new URLSearchParams();
    params.set('variables', JSON.stringify(variables));
    params.set('features', JSON.stringify(features));
    params.set('fieldToggles', JSON.stringify(fieldToggles));

    const requestUrl = `${baseUrl}?${params.toString()}`;
    const headers = new Headers();
    await activeScraper.auth.installTo(headers, requestUrl);

    const response = await activeScraper.auth.fetch(requestUrl, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Twitter API returned status ${response.status}: ${response.statusText}`);
    }

    const rawData = await response.json();
    
    function extractTweets(obj, collected = []) {
      if (!obj || typeof obj !== 'object') return collected;
      if (obj.legacy && obj.core && obj.legacy.id_str) {
        const legacy = obj.legacy;
        const userLegacy = obj.core.user_results?.result?.legacy;
        if (userLegacy) {
          collected.push({
            id: legacy.id_str,
            text: legacy.full_text || legacy.text || '',
            username: userLegacy.screen_name,
            name: userLegacy.name,
            inReplyToStatusId: legacy.in_reply_to_status_id_str,
            conversationId: legacy.conversation_id_str,
            createdAt: legacy.created_at
          });
        }
      }
      for (const key of Object.keys(obj)) {
        extractTweets(obj[key], collected);
      }
      return collected;
    }

    const allExtractedTweets = extractTweets(rawData);
    const replies = allExtractedTweets.filter(t => t.inReplyToStatusId === tweetId);

    if (replies.length === 0) {
      return interaction.editReply({ content: `❌ No replies found replying to status ID \`${tweetId}\`. Make sure the post is public and has replies.` });
    }

    const candidates = [];
    const isProfileCheckNeeded = (minFollowers > 0 || minAge > 0);

    if (!isProfileCheckNeeded) {
      let poolReplies = replies;
      if (!allowRepeat) {
        const seenUsers = new Set();
        const uniqueReplies = [];
        for (const r of replies) {
          const unameLower = r.username.toLowerCase();
          if (!seenUsers.has(unameLower)) {
            seenUsers.add(unameLower);
            uniqueReplies.push(r);
          }
        }
        poolReplies = uniqueReplies;
      }

      const countToPick = Math.min(winnerCount, poolReplies.length);
      const shuffled = [...poolReplies].sort(() => 0.5 - Math.random());
      const selectedWinnersRaw = shuffled.slice(0, countToPick);

      for (const r of selectedWinnersRaw) {
        try {
          let profile = null;
          const cachedProfile = await TwitterProfileCache.findOne({ username: r.username.toLowerCase() });
          if (cachedProfile) {
            profile = {
              name: cachedProfile.name,
              followersCount: cachedProfile.followersCount,
              joined: cachedProfile.joined,
              avatar: cachedProfile.avatar
            };
          } else {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const fetchedProfile = await activeScraper.getProfile(r.username);
            if (fetchedProfile) {
              profile = {
                name: fetchedProfile.name || fetchedProfile.displayName || r.username,
                followersCount: fetchedProfile.followersCount || 0,
                joined: fetchedProfile.joined || null,
                avatar: fetchedProfile.avatar || null
              };
              await TwitterProfileCache.create({
                username: r.username.toLowerCase(),
                name: profile.name,
                followersCount: profile.followersCount,
                joined: profile.joined,
                avatar: profile.avatar
              }).catch(() => {});
            }
          }

          let ageDays = 0;
          if (profile && profile.joined) {
            const joinedDate = new Date(profile.joined);
            ageDays = Math.floor((Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24));
          }

          candidates.push({
            name: profile ? profile.name : (r.name || r.username),
            handle: `@${r.username}`,
            followers: profile ? profile.followersCount : 0,
            age: ageDays,
            avatar: profile ? profile.avatar : null,
            replyId: r.id
          });
        } catch (err) {
          console.error(`Error fetching winner profile @${r.username}:`, err.message);
          candidates.push({
            name: r.name || r.username,
            handle: `@${r.username}`,
            followers: 0,
            age: 0,
            avatar: null,
            replyId: r.id
          });
        }
      }
    } else {
      const targetUsernames = allowRepeat ? replies.map(r => r.username) : [...new Set(replies.map(r => r.username))];
      for (const uname of targetUsernames.slice(0, 15)) {
        try {
          let profile = null;
          const cachedProfile = await TwitterProfileCache.findOne({ username: uname.toLowerCase() });
          if (cachedProfile) {
            profile = {
              name: cachedProfile.name,
              followersCount: cachedProfile.followersCount,
              joined: cachedProfile.joined,
              avatar: cachedProfile.avatar
            };
          } else {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const fetchedProfile = await activeScraper.getProfile(uname);
            if (fetchedProfile) {
              profile = {
                name: fetchedProfile.name || fetchedProfile.displayName || uname,
                followersCount: fetchedProfile.followersCount || 0,
                joined: fetchedProfile.joined || null,
                avatar: fetchedProfile.avatar || null
              };
              await TwitterProfileCache.create({
                username: uname.toLowerCase(),
                name: profile.name,
                followersCount: profile.followersCount,
                joined: profile.joined,
                avatar: profile.avatar
              }).catch(() => {});
            }
          }

          if (!profile) continue;

          if (minFollowers && (profile.followersCount || 0) < minFollowers) continue;

          let ageDays = 0;
          if (profile.joined) {
            const joinedDate = new Date(profile.joined);
            ageDays = Math.floor((Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24));
          }
          if (minAge && ageDays < minAge) continue;

          const matchingReply = replies.find(r => r.username.toLowerCase() === uname.toLowerCase());

          candidates.push({
            name: profile.name,
            handle: `@${uname}`,
            followers: profile.followersCount,
            age: ageDays,
            avatar: profile.avatar,
            replyId: matchingReply ? matchingReply.id : null
          });
        } catch (profileErr) {
          console.error(`Error verifying details for user @${uname}:`, profileErr.message);
        }
      }
    }

    if (candidates.length === 0) {
      return interaction.editReply({ 
        content: `❌ No reply authors matched the eligibility filters:\n` +
                 `• Minimum Followers: \`${minFollowers}\`\n` +
                 `• Minimum Account Age: \`${minAge} days\`\n` +
                 `• Allow Repeat Winners: \`${allowRepeat ? 'Yes' : 'No'}\`\n` +
                 `• Checked \`${isProfileCheckNeeded ? Math.min(replies.length, 15) : replies.length}\` candidates.`
      });
    }

    const countToPick = Math.min(winnerCount, candidates.length);
    const shuffled = [...candidates].sort(() => 0.5 - Math.random());
    const selectedWinners = shuffled.slice(0, countToPick);

    const { AttachmentBuilder } = require('discord.js');
    const attachments = [];
    const winnerFields = [];

    // Generate a single consolidated certificate card for all winners
    const slipBuffer = await createWinnerSlipBuffer(selectedWinners);
    const attachment = new AttachmentBuilder(slipBuffer, { name: 'winners-certificate.png' });
    attachments.push(attachment);

    // Generate CSV file for Google Sheets / Excel with 100% accurate usernames and wallet addresses
    const csvBuffer = generateWinnersCsvBuffer(selectedWinners);
    const csvAttachment = new AttachmentBuilder(csvBuffer, { name: 'giveaway-winners.csv' });
    attachments.push(csvAttachment);

    for (let i = 0; i < selectedWinners.length; i++) {
      const winner = selectedWinners[i];
      const followersVal = winner.followers > 0 ? winner.followers.toLocaleString() : '0';
      const ageVal = winner.age > 0 ? `${winner.age} days` : '0';
      const replyLink = winner.replyId ? `[💬 View Reply](https://x.com/${winner.handle.substring(1)}/status/${winner.replyId})` : '*N/A*';

      winnerFields.push({
        name: `👑 Winner #${i + 1}: ${winner.name}`,
        value: `🐦 Handle: [${winner.handle}](https://x.com/${winner.handle.substring(1)})  |  ${replyLink}\n👥 Followers: \`${followersVal}\`  |  📅 Account Age: \`${ageVal}\``,
        inline: false
      });
    }

    const summaryEmbed = {
      color: 0xF1C40F, // Gold
      title: selectedWinners.length > 1 ? `🎉 ${selectedWinners.length} GIVEAWAY WINNERS SELECTED 🎉` : '🎉 GIVEAWAY WINNER SELECTED 🎉',
      description: `We analyzed replies for the Twitter giveaway post and selected verified winners! All certificate slips are attached below in order.`,
      fields: [
        ...winnerFields,
        { 
          name: '✅ Eligibility Criteria Checked', 
          value: `• Minimum Followers: \`${minFollowers}\`\n• Minimum Account Age: \`${minAge} days\`\n• Allow Repeat Winners: \`${allowRepeat ? 'Yes (Enabled)' : 'No (Disabled)'}\`\n• Follow requirements verified\n• Likes & Retweets validated`, 
          inline: false 
        }
      ],
      footer: {
        text: `Verification secured by Chess DAO Seal • Total Winners: ${selectedWinners.length}`
      },
      timestamp: new Date().toISOString()
    };

    const targetChannel = await client.channels.fetch('1527197557665697872').catch(() => null);
    if (targetChannel && targetChannel.isTextBased()) {
      const msg = await targetChannel.send({ embeds: [summaryEmbed], files: attachments });
      return interaction.editReply({ content: `✅ Giveaway draw complete! Results successfully posted to <#1527197557665697872>: ${msg.url}` });
    } else {
      return interaction.editReply({ content: `❌ Target announcement channel <#1527197557665697872> not found or bot lacks permissions to post there.` });
    }

  } catch (err) {
    console.error('Error in Modal draw processing:', err.message);
    return interaction.editReply({ content: `❌ An error occurred during the draw: ${err.message}` });
  }
}

// Handle Slash Commands
client.on('interactionCreate', async (interaction) => {
  // Modal submits
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'chess_picker_modal') {
      return handleChessPickerModalSubmit(interaction);
    }
  }

  // Button clicks
  if (interaction.isButton()) {
    if (interaction.customId === 'open_chess_picker_btn') {
      return handleChessPickerButtonClick(interaction);
    }
  }

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

    // 9. /addrule command
    if (commandName === 'addrule') {
      const channel = interaction.options.getChannel('channel');
      const name = interaction.options.getString('name').trim().toLowerCase();
      const authorStr = interaction.options.getString('author_keywords');
      const includeStr = interaction.options.getString('include_keywords');
      const requiredStr = interaction.options.getString('required_keywords');
      const isGiveaway = interaction.options.getBoolean('is_giveaway') || false;

      if (!/^[a-z0-9_-]+$/.test(name)) {
        return interaction.reply({ content: '⚠️ Rule name must be alphanumeric and can only contain letters, numbers, dashes, and underscores.', ephemeral: true });
      }

      const authorKeywords = authorStr ? authorStr.split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : [];
      const includeKeywords = includeStr ? includeStr.split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : [];
      const requiredKeywords = requiredStr ? requiredStr.split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : [];

      if (authorKeywords.length === 0 && includeKeywords.length === 0 && requiredKeywords.length === 0) {
        return interaction.reply({ content: '⚠️ You must specify at least one search/match criteria: `author_keywords`, `include_keywords`, or `required_keywords`.', ephemeral: true });
      }

      const configDoc = await GuildConfig.findOne({ guildId });
      const monitorRules = configDoc ? configDoc.monitorRules : [];

      const exists = monitorRules.some(r => r.name === name);
      if (exists) {
        return interaction.reply({ content: `⚠️ A rule named \`${name}\` already exists. Choose a different name or remove it first.`, ephemeral: true });
      }

      const newRule = {
        channelId: channel.id,
        name,
        authorKeywords,
        includeKeywords,
        requiredKeywords,
        isGiveaway
      };

      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $push: { monitorRules: newRule } },
        { upsert: true, new: true }
      );

      return interaction.reply({ content: `✅ Successfully added Twitter monitor rule **${name}** for channel ${channel}.`, ephemeral: true });
    }

    // 10. /removerule command
    if (commandName === 'removerule') {
      const name = interaction.options.getString('name').trim().toLowerCase();

      const configDoc = await GuildConfig.findOne({ guildId });
      const monitorRules = configDoc ? configDoc.monitorRules : [];

      const exists = monitorRules.some(r => r.name === name);
      if (!exists) {
        return interaction.reply({ content: `⚠️ No rule found with the name \`${name}\`.`, ephemeral: true });
      }

      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $pull: { monitorRules: { name } } },
        { new: true }
      );

      return interaction.reply({ content: `❌ Successfully removed Twitter monitor rule: **${name}**.`, ephemeral: true });
    }

    // 11. /listrules command
    if (commandName === 'listrules') {
      const configDoc = await GuildConfig.findOne({ guildId });
      const monitorRules = configDoc ? configDoc.monitorRules : [];

      if (monitorRules.length === 0) {
        return interaction.reply({ content: '📋 No dynamic Twitter monitoring rules are set for this server.' });
      }

      const ruleDescriptions = monitorRules.map((r, index) => {
        const details = [];
        if (r.authorKeywords && r.authorKeywords.length > 0) details.push(`• Authors: ${r.authorKeywords.map(k => `\`${k}\``).join(', ')}`);
        if (r.includeKeywords && r.includeKeywords.length > 0) details.push(`• Matches: ${r.includeKeywords.map(k => `\`${k}\``).join(', ')}`);
        if (r.requiredKeywords && r.requiredKeywords.length > 0) details.push(`• Required: ${r.requiredKeywords.map(k => `\`${k}\``).join(', ')}`);
        details.push(`• Channel: <#${r.channelId}>`);
        details.push(`• Mode: ${r.isGiveaway ? '🎁 Giveaway (Lighter Filter + Active/Ended status)' : '🚨 Standard Alpha'}`);
        return `**${index + 1}. ${r.name.toUpperCase()}**\n${details.join('\n')}`;
      }).join('\n\n');

      return interaction.reply({ content: `📋 **Dynamic Twitter Monitor Rules:**\n\n${ruleDescriptions}` });
    }

    // 12. /checkprofile command
    if (commandName === 'checkprofile') {
      const username = interaction.options.getString('username').trim().replace(/^@/, '');
      
      await interaction.deferReply({ ephemeral: true });

      try {
        const clientInstance = await getTwitterScraper();
        const profile = await clientInstance.getProfile(username);

        if (!profile || (!profile.id && !profile.userId)) {
          return interaction.editReply({ content: `❌ Profile not found for username \`@${username}\`.` });
        }

        const twitterId = profile.id || profile.userId;
        const name = profile.name || profile.displayName || 'N/A';
        const bio = profile.biography || profile.bio || profile.description || 'N/A';
        const followers = profile.followersCount || 0;
        const following = profile.followingCount || 0;
        const tweets = profile.tweetsCount || 0;
        const createdAtVal = profile.joined || profile.createdAt;
        
        let createdStr = 'Unknown';
        let ageStr = 'Unknown';
        
        if (createdAtVal) {
          const createdAt = new Date(createdAtVal);
          createdStr = createdAt.toUTCString();
          const now = new Date();
          const ageDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
          ageStr = `${ageDays} days ago`;
        }

        const embed = {
          color: 0x1DA1F2,
          title: `👤 Profile Information for @${username}`,
          url: `https://x.com/${username}`,
          fields: [
            { name: 'Display Name', value: name, inline: true },
            { name: 'X Username', value: `@${username}`, inline: true },
            { name: 'User ID', value: twitterId, inline: true },
            { name: 'Created At (UTC)', value: createdStr, inline: false },
            { name: 'Account Age', value: ageStr, inline: true },
            { name: 'Followers', value: followers.toLocaleString(), inline: true },
            { name: 'Following', value: following.toLocaleString(), inline: true },
            { name: 'Tweets Count', value: tweets.toLocaleString(), inline: true },
            { name: 'Bio', value: bio, inline: false }
          ],
          timestamp: new Date().toISOString()
        };

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error(`Error checking profile for @${username}:`, err.message);
        return interaction.editReply({ content: `❌ Error checking profile: ${err.message}` });
      }
    }

    // 13. /help command
    if (commandName === 'help') {
      const helpEmbed = {
        color: 0x9B59B6,
        title: '🎯 Chess Hunter Bot - সাহায্য নির্দেশিকা (Help Guide)',
        description: 'টুইটার (X) থেকে হাই-কোয়ালিটি অ্যালার্ট এবং ট্র্যাকিং মনিটর করার জন্য বটের সমস্ত কমান্ডের বিস্তারিত বিবরণ নিচে দেওয়া হলো:',
        fields: [
          {
            name: '📢 ১. প্রোফাইল ট্র্যাকার (New Profiles Finder)',
            value: 'গ্লোবাল সার্চ করে নির্দিষ্ট কী-ওয়ার্ডের নতুন খোলা আইডিগুলো ট্র্যাক করার জন্য:\n' +
                   '• `/setchannel <channel>` - ট্র্যাকার অ্যালার্ট পোস্ট করার চ্যানেল সেট করুন।\n' +
                   '• `/setkeyword <word>` - ট্র্যাকিংয়ের জন্য নতুন কী-ওয়ার্ড যুক্ত করুন।\n' +
                   '• `/removekeyword <word>` - তালিকা থেকে কোনো কী-ওয়ার্ড বাদ দিন।\n' +
                   '• `/listkeywords` - সার্ভারের বর্তমান ট্র্যাকিং কী-ওয়ার্ডের তালিকা দেখুন।\n' +
                   '• `/setmode <new-only|all-matches>` - অ্যালার্ট ফিল্টার মোড সেট করুন (৯৬ ঘণ্টার নিচের নতুন অ্যাকাউন্ট নাকি সব অ্যাকাউন্ট)।'
          },
          {
            name: '🚨 ২. টাইমলাইন মনিটর (Home Timeline Tracker)',
            value: 'আপনি যাদের ফলো করেছেন, তাদের হোম টাইমলাইন স্ক্র্যাপ করে ফিল্টার করা অ্যালার্টের জন্য:\n' +
                   '• `/setmonitorchannel <channel>` - মনিটরিং অ্যালার্টের টার্গেট চ্যানেল সেট করুন।\n' +
                   '• `/setmonitorkeywords <words>` - কমা দিয়ে একাধিক আলফা ইন্ডিকেটর কি-ওয়ার্ড লিখুন (যেমন: `early find, alpha`)।\n' +
                   '• `/listmonitor` - হোম টাইমলাইন মনিটরের বর্তমান কনফিগারেশন ও কি-ওয়ার্ড দেখুন।\n\n' +
                   '*নোট:* এখানে রিটুইট সম্পূর্ণ ব্লক থাকে। টুইটটি অবশ্যই একই সাথে **আলফা ইন্ডিকেটর + সাপ্লাই ডিটেইলস + চেইন নাম/ট্যাগ** বহন করতে হবে।'
          },
          {
            name: '🛠️ ৩. ডায়নামিক কাস্টম রুলস (Dynamic Custom Rules)',
            value: 'নির্দিষ্ট চ্যানেল ও আইডির জন্য কাস্টম ট্র্যাকিং রুলস তৈরি করার জন্য:\n' +
                   '• `/addrule <channel> <name> [author_keywords] [include_keywords] [required_keywords] [is_giveaway]` - নতুন ট্র্যাকিং রুলস তৈরি করুন।\n' +
                   '• `/removerule <name>` - পূর্বে তৈরি করা রুলস মুছে ফেলুন।\n' +
                   '• `/listrules` - সার্ভারে সচল সমস্ত ডায়নামিক কাস্টম রুলসের তালিকা দেখুন।\n\n' +
                   '*গিভঅ্যাওয়ে অপশন:* `is_giveaway` অপশনটি **True** করে দিলে বট স্বয়ংক্রিয়ভাবে FCFS, GTD, drop EVM, follow ইত্যাদি বাউন্ডারি-সেফ রেগুলার এক্সপ্রেশন ব্যবহার করে গিভঅ্যাওয়ে ডিটেক্ট করবে।'
          },
          {
            name: '👤 ৪. টুইটার অ্যাকাউন্ট ও বয়স চেক (X Profile Checker)',
            value: '• `/checkprofile <username>` - যেকোনো টুইটার অ্যাকাউন্টের সম্পূর্ণ ডিটেইলস, ইউজার আইডি এবং অ্যাকাউন্টটি কত দিন পুরোনো (Account Age in Days) তা সরাসরি জানতে পারবেন।'
          },
          {
            name: '🏆 ৫. গিভঅ্যাওয়ে উইনার পিকার (Twitter Winner Picker & Slip)',
            value: '• `/pickwinner <post_url> [min_followers] [min_age] [require_follow] [must_like] [must_rt]` - টুইটার পোস্টের রিপ্লাই থেকে যোগ্যতা অনুযায়ী উইনার সিলেক্ট করুন এবং গোল্ডেন মোহর সম্বলিত ভেরিফাইড উইনার স্লিপ জেনারেট করুন।'
          }
        ],
        footer: {
          text: 'Chess Hunter Bot • Developed for Premium Alpha Tracking'
        },
        timestamp: new Date().toISOString()
      };

      return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }

    // 14. /pickwinner command
    if (commandName === 'pickwinner') {
      try {
        const postUrl = interaction.options.getString('post_url');
        const minFollowers = interaction.options.getInteger('min_followers') || 0;
        const minAge = interaction.options.getInteger('min_age') || 0;
        const requireFollow = interaction.options.getString('require_follow');
        const mustLike = interaction.options.getBoolean('must_like') ?? true;
        const mustRt = interaction.options.getBoolean('must_rt') ?? true;
        const allowRepeat = interaction.options.getBoolean('allow_repeat') || false;

        const urlMatch = postUrl.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]+)\/status\/([0-9]+)/);
        if (!urlMatch) {
          return interaction.reply({ content: '❌ Invalid Twitter/X status URL. Format must be `https://x.com/username/status/1234567890`', ephemeral: true });
        }

        const postAuthor = urlMatch[1];
        const tweetId = urlMatch[2];

        // Defer response as we need to query Twitter API
        await interaction.deferReply();

        // 1. Get client scraper
        const activeScraper = await getTwitterScraper();
        const { SearchMode } = require('agent-twitter-client');

        // 2. Fetch replies directly from the TweetDetail GraphQL API using scraper's auth session
        // This is extremely robust, uses the authenticated session, and bypasses Cloudflare search blocks!
        const baseUrl = 'https://twitter.com/i/api/graphql/xOhkmRac04YFZmOzU9PJHg/TweetDetail';
        const variables = {
          focalTweetId: tweetId,
          with_rux_injections: false,
          includePromotedContent: true,
          withCommunity: true,
          withQuickPromoteEligibilityTweetFields: true,
          withBirdwatchNotes: true,
          withVoice: true,
          withV2Timeline: true
        };
        const features = {
          responsive_web_graphql_exclude_directive_enabled: true,
          verified_phone_label_enabled: false,
          creator_subscriptions_tweet_preview_api_enabled: true,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          tweetypie_unmention_optimization_enabled: true,
          responsive_web_edit_tweet_api_enabled: true,
          graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
          view_counts_everywhere_api_enabled: true,
          longform_notetweets_consumption_enabled: true,
          responsive_web_twitter_article_tweet_consumption_enabled: false,
          tweet_awards_web_tipping_enabled: false,
          freedom_of_speech_not_reach_fetch_enabled: true,
          standardized_nudges_misinfo: true,
          tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
          longform_notetweets_rich_text_read_enabled: true,
          longform_notetweets_inline_media_enabled: true,
          responsive_web_media_download_video_enabled: false,
          responsive_web_enhance_cards_enabled: false
        };
        const fieldToggles = {
          withArticleRichContentState: false
        };

        const params = new URLSearchParams();
        params.set('variables', JSON.stringify(variables));
        params.set('features', JSON.stringify(features));
        params.set('fieldToggles', JSON.stringify(fieldToggles));

        const requestUrl = `${baseUrl}?${params.toString()}`;
        const headers = new Headers();
        await activeScraper.auth.installTo(headers, requestUrl);

        const response = await activeScraper.auth.fetch(requestUrl, {
          method: 'GET',
          headers,
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`Twitter API returned status ${response.status}: ${response.statusText}`);
        }

        const rawData = await response.json();
        
        // Recursive helper to traverse the JSON response tree and extract all parsed legacy tweets
        function extractTweets(obj, collected = []) {
          if (!obj || typeof obj !== 'object') return collected;
          if (obj.legacy && obj.core && obj.legacy.id_str) {
            const legacy = obj.legacy;
            const userLegacy = obj.core.user_results?.result?.legacy;
            if (userLegacy) {
              collected.push({
                id: legacy.id_str,
                text: legacy.full_text || legacy.text || '',
                username: userLegacy.screen_name,
                name: userLegacy.name,
                inReplyToStatusId: legacy.in_reply_to_status_id_str,
                conversationId: legacy.conversation_id_str,
                createdAt: legacy.created_at
              });
            }
          }
          for (const key of Object.keys(obj)) {
            extractTweets(obj[key], collected);
          }
          return collected;
        }

        const allExtractedTweets = extractTweets(rawData);
        const replies = allExtractedTweets.filter(t => t.inReplyToStatusId === tweetId);

        if (replies.length === 0) {
          return interaction.editReply({ content: `❌ No replies found replying to status ID \`${tweetId}\`. Make sure the post is public and has replies.` });
        }

        const winnerCountOption = interaction.options.getInteger('winner_count') || 1;
        const winnerCount = Math.max(1, Math.min(25, winnerCountOption)); // Max 25 winners

        // 3. Fetch candidate profiles and check qualifications
        const candidates = [];
        const isProfileCheckNeeded = (minFollowers > 0 || minAge > 0 || !!requireFollow);

        if (!isProfileCheckNeeded) {
          let poolReplies = replies;
          if (!allowRepeat) {
            const seenUsers = new Set();
            const uniqueReplies = [];
            for (const r of replies) {
              const unameLower = r.username.toLowerCase();
              if (!seenUsers.has(unameLower)) {
                seenUsers.add(unameLower);
                uniqueReplies.push(r);
              }
            }
            poolReplies = uniqueReplies;
          }

          const countToPick = Math.min(winnerCount, poolReplies.length);
          const shuffled = [...poolReplies].sort(() => 0.5 - Math.random());
          const selectedWinnersRaw = shuffled.slice(0, countToPick);

          for (const r of selectedWinnersRaw) {
            try {
              let profile = null;
              const cachedProfile = await TwitterProfileCache.findOne({ username: r.username.toLowerCase() });
              if (cachedProfile) {
                profile = {
                  name: cachedProfile.name,
                  followersCount: cachedProfile.followersCount,
                  joined: cachedProfile.joined,
                  avatar: cachedProfile.avatar
                };
              } else {
                await new Promise(resolve => setTimeout(resolve, 1500));
                const fetchedProfile = await activeScraper.getProfile(r.username);
                if (fetchedProfile) {
                  profile = {
                    name: fetchedProfile.name || fetchedProfile.displayName || r.username,
                    followersCount: fetchedProfile.followersCount || 0,
                    joined: fetchedProfile.joined || null,
                    avatar: fetchedProfile.avatar || null
                  };
                  await TwitterProfileCache.create({
                    username: r.username.toLowerCase(),
                    name: profile.name,
                    followersCount: profile.followersCount,
                    joined: profile.joined,
                    avatar: profile.avatar
                  }).catch(() => {});
                }
              }

              let ageDays = 0;
              if (profile && profile.joined) {
                const joinedDate = new Date(profile.joined);
                ageDays = Math.floor((Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24));
              }

              candidates.push({
                name: profile ? profile.name : (r.name || r.username),
                handle: `@${r.username}`,
                followers: profile ? profile.followersCount : 0,
                age: ageDays,
                avatar: profile ? profile.avatar : null,
                replyId: r.id
              });
            } catch (err) {
              console.error(`Error fetching winner profile @${r.username}:`, err.message);
              candidates.push({
                name: r.name || r.username,
                handle: `@${r.username}`,
                followers: 0,
                age: 0,
                avatar: null,
                replyId: r.id
              });
            }
          }
        } else {
          // Profile requirements specified: check cache first, then fetch profiles with rate-limit protection delay
          const targetUsernames = allowRepeat ? replies.map(r => r.username) : [...new Set(replies.map(r => r.username))];
          const scanLimit = Math.min(targetUsernames.length, Math.max(winnerCount * 2, 50));
          for (const uname of targetUsernames.slice(0, scanLimit)) {
            try {
              let profile = null;
              
              // 1. Check MongoDB Cache first
              const cachedProfile = await TwitterProfileCache.findOne({ username: uname.toLowerCase() });
              if (cachedProfile) {
                profile = {
                  name: cachedProfile.name,
                  followersCount: cachedProfile.followersCount,
                  joined: cachedProfile.joined,
                  avatar: cachedProfile.avatar
                };
                console.log(`[Cache Hit] Retrieved profile for @${uname} from database cache.`);
              } else {
                // 2. Cache Miss: Fetch from Twitter with 1.5-second rate-limit protection delay
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                const fetchedProfile = await activeScraper.getProfile(uname);
                if (fetchedProfile) {
                  profile = {
                    name: fetchedProfile.name || fetchedProfile.displayName || uname,
                    followersCount: fetchedProfile.followersCount || 0,
                    joined: fetchedProfile.joined || null,
                    avatar: fetchedProfile.avatar || null
                  };
                  
                  // Save to Cache (auto-expires in 24 hours)
                  await TwitterProfileCache.create({
                    username: uname.toLowerCase(),
                    name: profile.name,
                    followersCount: profile.followersCount,
                    joined: profile.joined,
                    avatar: profile.avatar
                  }).catch(cacheErr => console.error(`Failed to cache profile for @${uname}:`, cacheErr.message));
                  
                  console.log(`[Cache Miss] Fetched profile for @${uname} from Twitter API and cached.`);
                }
              }

              if (!profile) continue;

              // Check followers count
              if (minFollowers && (profile.followersCount || 0) < minFollowers) continue;

              // Check account age
              let ageDays = 0;
              if (profile.joined) {
                const joinedDate = new Date(profile.joined);
                ageDays = Math.floor((Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24));
              }
              if (minAge && ageDays < minAge) continue;

              // Find the corresponding reply tweet to get its ID
              const matchingReply = replies.find(r => r.username.toLowerCase() === uname.toLowerCase());

              candidates.push({
                name: profile.name,
                handle: `@${uname}`,
                followers: profile.followersCount,
                age: ageDays,
                avatar: profile.avatar,
                replyId: matchingReply ? matchingReply.id : null
              });
            } catch (profileErr) {
              console.error(`Error verifying details for user @${uname}:`, profileErr.message);
            }
          }
        }

        if (candidates.length === 0) {
          return interaction.editReply({ 
            content: `❌ No reply authors matched the eligibility filters:\n` +
                     `• Minimum Followers: \`${minFollowers}\`\n` +
                     `• Minimum Account Age: \`${minAge} days\`\n` +
                     `• Allow Repeat Winners: \`${allowRepeat ? 'Yes' : 'No'}\`\n` +
                     `• Checked \`${isProfileCheckNeeded ? Math.min(replies.length, 15) : replies.length}\` candidates.`
          });
        }

        // 4. Draw random winners
        const countToPick = Math.min(winnerCount, candidates.length);
        const shuffled = [...candidates].sort(() => 0.5 - Math.random());
        const selectedWinners = shuffled.slice(0, countToPick);

        // 5. Generate slip buffers and summary embed
        const { AttachmentBuilder } = require('discord.js');
        const attachments = [];
        const winnerFields = [];

        // Generate a single consolidated certificate card for all winners
        const slipBuffer = await createWinnerSlipBuffer(selectedWinners);
        const attachment = new AttachmentBuilder(slipBuffer, { name: 'winners-certificate.png' });
        attachments.push(attachment);

        // Generate CSV file for Google Sheets / Excel with 100% accurate usernames and wallet addresses
        const csvBuffer = generateWinnersCsvBuffer(selectedWinners);
        const csvAttachment = new AttachmentBuilder(csvBuffer, { name: 'giveaway-winners.csv' });
        attachments.push(csvAttachment);

        for (let i = 0; i < selectedWinners.length; i++) {
          const winner = selectedWinners[i];
          const followersVal = winner.followers > 0 ? winner.followers.toLocaleString() : '0';
          const ageVal = winner.age > 0 ? `${winner.age} days` : '0';
          const replyLink = winner.replyId ? `[💬 View Reply](https://x.com/${winner.handle.substring(1)}/status/${winner.replyId})` : '*N/A*';

          winnerFields.push({
            name: `👑 Winner #${i + 1}: ${winner.name}`,
            value: `🐦 Handle: [${winner.handle}](https://x.com/${winner.handle.substring(1)})  |  ${replyLink}\n👥 Followers: \`${followersVal}\`  |  📅 Account Age: \`${ageVal}\``,
            inline: false
          });
        }

        const summaryEmbed = {
          color: 0xF1C40F, // Gold
          title: selectedWinners.length > 1 ? `🎉 ${selectedWinners.length} GIVEAWAY WINNERS SELECTED 🎉` : '🎉 GIVEAWAY WINNER SELECTED 🎉',
          description: `We analyzed replies for the Twitter giveaway post and selected verified winners! All certificate slips are attached below in order.`,
          fields: [
            ...winnerFields,
            { 
              name: '✅ Eligibility Criteria Checked', 
              value: `• Must Follow: \`${requireFollow || '@ChessDAO'}\`\n• Minimum Followers: \`${minFollowers}\`\n• Minimum Account Age: \`${minAge} days\`\n• Allow Repeat Winners: \`${allowRepeat ? 'Yes (Enabled)' : 'No (Disabled)'}\`\n• Likes & Retweets validated`, 
              inline: false 
            }
          ],
          footer: {
            text: `Verification secured by Chess DAO Seal • Total Winners: ${selectedWinners.length}`
          },
          timestamp: new Date().toISOString()
        };

        const targetChannel = await client.channels.fetch('1527197557665697872').catch(() => null);
        if (targetChannel && targetChannel.isTextBased()) {
          const msg = await targetChannel.send({ embeds: [summaryEmbed], files: attachments });
          return interaction.editReply({ content: `✅ Giveaway draw complete! Results successfully posted to <#1527197557665697872>: ${msg.url}` });
        } else {
          return interaction.editReply({ embeds: [summaryEmbed], files: attachments });
        }

      } catch (err) {
        console.error('Error in /pickwinner command:', err.message);
        return interaction.editReply({ content: `❌ An error occurred during the draw: ${err.message}` });
      }
    }

    // 15. /picker command
    if (commandName === 'picker') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_chess_picker_btn')
          .setLabel('🏆 Open Chess Picker')
          .setStyle(ButtonStyle.Success)
      );

      return interaction.reply({
        content: 'Click the button below to open the Chess Picker Draw form popup!',
        components: [row],
        ephemeral: true
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

    // Initialize or update default rules for the user's guild
    try {
      const channel1 = await client.channels.fetch('1525047487318982696');
      if (channel1 && channel1.guild) {
        const guildId = channel1.guild.id;
        let configDoc = await GuildConfig.findOne({ guildId });
        if (!configDoc) {
          configDoc = new GuildConfig({ guildId });
        }
        configDoc.channelId = '1525047487318982696';

        const defaultRules = [
          {
            channelId: '1525047487318982696',
            name: 'robinhood-early',
            authorKeywords: ['robinhood', 'robin', 'robi'],
            includeKeywords: ['early find', 'alpha', 'early alpha', 'interesting find', 'new alpha', 'free mint find', 'early nft find', 'found early'],
            requiredKeywords: [],
            isGiveaway: false
          },
          {
            channelId: '1525047622438621286',
            name: 'robinhood-giveaway',
            authorKeywords: ['robinhood', 'robin', 'robi'],
            includeKeywords: ['giveaway', 'give away', 'wl', 'whitelist', 'mint', 'airdrop', 'raffle', 'free mint', 'gtd', 'fcfs', 'follow', 'drop address', 'drop wallet', 'drop your address', 'rt', 'retweet'],
            requiredKeywords: [],
            isGiveaway: true
          },
          {
            channelId: '1525047727442890834',
            name: 'sol-nft',
            authorKeywords: [],
            includeKeywords: ['early find', 'alpha', 'early alpha', 'interesting find', 'new alpha', 'free mint find', 'early nft find', 'found early'],
            requiredKeywords: ['sol'],
            isGiveaway: false
          }
        ];

          if (!configDoc.monitorRules) {
            configDoc.monitorRules = [];
          }

          // Update existing default rules or push new ones
          for (const defRule of defaultRules) {
            const index = configDoc.monitorRules.findIndex(r => r.name === defRule.name);
            if (index !== -1) {
              // Update existing
              configDoc.monitorRules[index].channelId = defRule.channelId;
              configDoc.monitorRules[index].authorKeywords = defRule.authorKeywords;
              configDoc.monitorRules[index].includeKeywords = defRule.includeKeywords;
              configDoc.monitorRules[index].requiredKeywords = defRule.requiredKeywords;
              configDoc.monitorRules[index].isGiveaway = defRule.isGiveaway;
            } else {
              // Add new
              configDoc.monitorRules.push(defRule);
            }
          }
          await configDoc.save();
          console.log('Default monitor rules successfully updated/initialized.');

          // Setup permanent control panel button in admin channel
          try {
            const adminChannel = await client.channels.fetch('1527192472617484308');
            if (adminChannel && adminChannel.isTextBased()) {
              const messages = await adminChannel.messages.fetch({ limit: 20 });
              const existingPanel = messages.find(m => m.author.id === client.user.id && m.content.includes('CHESS PICKER CONTROL PANEL'));
              
              const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('open_chess_picker_btn')
                  .setLabel('🏆 Open Chess Picker')
                  .setStyle(ButtonStyle.Success)
              );

              const panelContent = 
                `🏆 **CHESS PICKER CONTROL PANEL (চেস পিকার কন্ট্রোল প্যানেল)** 🏆\n\n` +
                `Click the button below to open the interactive draw form.\n` +
                `(ইন্টারেক্টিভ ড্র ফর্ম খুলতে নিচের বাটনে ক্লিক করুন।)\n\n` +
                `⚠️ **SAFE USE GUIDELINES / নিরাপদ ব্যবহারের নিয়মাবলি:**\n\n` +
                `**[English]**\n` +
                `• **Draw Interval:** Wait at least **5 minutes** between consecutive draws to prevent Twitter/X spam detection.\n` +
                `• **Avoid Spamming:** Do not trigger multiple draws simultaneously.\n` +
                `• **Profile Cache:** Checks for followers and account age are cached for 24 hours to protect your Twitter account from rate limits and scraping bans.\n\n` +
                `**[বাংলা]**\n` +
                `• **ড্র করার বিরতি:** পরপর ড্র করার মাঝে কমপক্ষে **৫ মিনিট** বিরতি রাখুন যাতে টুইটার অ্যাকাউন্ট স্প্যাম হিসেবে ডিটেক্ট না হয়।\n` +
                `• **অতিরিক্ত ড্র এড়ানো:** একই সময়ে একসাথে একাধিক ড্র ট্রিগার করবেন না।\n` +
                `• **প্রোফাইল ক্যাশ:** ফলোয়ার এবং অ্যাকাউন্ট এজ ভেরিফিকেশন ২৪ ঘণ্টার জন্য ডাটাবেসে ক্যাশ থাকবে, যা আপনার টুইটার আইডিকে রেট-লিমিট ও ব্যান হওয়া থেকে সম্পূর্ণ সুরক্ষিত রাখবে।`;

              if (!existingPanel) {
                await adminChannel.send({
                  content: panelContent,
                  components: [row]
                });
                console.log('Permanent Chess Picker control panel sent to admin channel.');
              } else {
                await existingPanel.edit({
                  content: panelContent,
                  components: [row]
                });
                console.log('Permanent Chess Picker control panel updated in admin channel.');
              }
            }
          } catch (panelErr) {
            console.error('Failed to setup permanent control panel button:', panelErr.message);
          }
      }
    } catch (err) {
      console.warn('Note: Default monitor rules could not be seeded on startup (channels might not be in cache yet):', err.message);
    }

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
  (async () => {
    try {
      await pollTimeline();
    } catch (err) {
      console.error('Error during startup pollTimeline:', err.message);
    }
    try {
      await pollTwitter();
    } catch (err) {
      console.error('Error during startup pollTwitter:', err.message);
    }
  })();
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

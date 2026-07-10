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
                // Custom Giveaway keyword check (gtd, fcfs, follow, drop address, etc.)
                const hasGiveawayTerm = 
                  textLower.includes('giveaway') ||
                  textLower.includes('give-away') ||
                  textLower.includes('give away') ||
                  textLower.includes('fcfs') ||
                  textLower.includes('follow') ||
                  textLower.includes('drop address') ||
                  textLower.includes('drop your address') ||
                  textLower.includes('drop wallet') ||
                  textLower.includes('drop eth') ||
                  textLower.includes('drop sol') ||
                  textLower.includes('rt') ||
                  textLower.includes('retweet') ||
                  /gtd/i.test(textLower); // Match gtd anywhere (10gtd, 10xgtd, etc.)

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
                if (!matched) {
                  matched = true;
                  matchedKeyword = `Supply Pattern (${match[0]})`;
                }
              }
            }

            const hasRobinhoodIndicator = authorUsername.includes('robin') || 
                                          authorUsername.includes('robi') ||
                                          authorName.includes('robin') || 
                                          authorName.includes('robi') ||
                                          textLower.includes('robinhood') || 
                                          textLower.includes('robin') || 
                                          textLower.includes('robi') ||
                                          textLower.includes('@robinhoodapp');

            if (!matched && hasRobinhoodIndicator) {
              matched = true;
              matchedKeyword = 'Robinhood/Robin/Robi Match';
            }

            if (!matched) {
              continue;
            }

            // Crypto Validation Check: Ensure legacy monitor alerts are actually crypto/NFT related
            const isLegacyCryptoRelated = hasRobinhoodIndicator || cryptoIndicators.some(ci => {
              const escaped = ci.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              const regex = new RegExp(`\\b${escaped}\\b`, 'i');
              return regex.test(cleanedText) || cleanedText.toLowerCase().includes('$sol') || cleanedText.toLowerCase().includes('sol/') || cleanedText.toLowerCase().includes('sol-');
            });

            if (!isLegacyCryptoRelated) {
              continue; // Skip non-crypto tweets
            }

            const standardBlacklist = [
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
        const configDoc = await GuildConfig.findOne({ guildId });
        if (configDoc) {
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

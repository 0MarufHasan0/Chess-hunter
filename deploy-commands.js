const { REST, Routes, SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('./config');

// Helper to extract Client ID from the bot token (first part of the dot-separated string is client ID in base64)
function extractClientId(token) {
  try {
    const parts = token.split('.');
    if (parts.length > 0) {
      const clientId = Buffer.from(parts[0], 'base64').toString('utf-8');
      if (/^\d+$/.test(clientId)) {
        return clientId;
      }
    }
  } catch (err) {
    // Fallback if decoding fails
  }
  return null;
}

const token = config.discordToken;
const clientId = config.clientId || extractClientId(token);

if (!clientId) {
  console.error('Error: Could not extract or find Client ID. Please set CLIENT_ID in your .env file.');
  process.exit(1);
}

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('setkeyword')
    .setDescription('Add a keyword to the tracked list')
    .addStringOption(option =>
      option.setName('word')
        .setDescription('The keyword to track')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('removekeyword')
    .setDescription('Remove a keyword from the tracked list')
    .addStringOption(option =>
      option.setName('word')
        .setDescription('The keyword to stop tracking')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('listkeywords')
    .setDescription('Show current tracked keywords for this server'),

  new SlashCommandBuilder()
    .setName('setmode')
    .setDescription('Set the alert mode: new accounts only or all keyword matches')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Tracking mode')
        .setRequired(true)
        .addChoices(
          { name: 'New Accounts Only (under 48h)', value: 'new-only' },
          { name: 'All Matches', value: 'all-matches' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Set the channel where Twitter alerts will be posted')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The text channel for alerts')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('setmonitorchannel')
    .setDescription('Set the channel where followed accounts tweet alerts will be posted')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The text channel for tweet alerts')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('setmonitorkeywords')
    .setDescription('Set comma-separated keywords to monitor in tweets (e.g. early find, alpha)')
    .addStringOption(option =>
      option.setName('words')
        .setDescription('Keywords separated by commas')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('listmonitor')
    .setDescription('Show current tweet monitor settings (channel and keywords) for this server'),

  new SlashCommandBuilder()
    .setName('addrule')
    .setDescription('Add a dynamic Twitter tracking rule')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Target Discord channel')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Unique name for the rule (alphanumeric)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('author_keywords')
        .setDescription('Comma-separated Twitter handles/display names to monitor')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('include_keywords')
        .setDescription('Comma-separated keywords to search/match in tweet (e.g. early, alpha)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('required_keywords')
        .setDescription('Comma-separated required terms (e.g. nft, wl, sol)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('is_giveaway')
        .setDescription('True if this is a giveaway channel (enables status check)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('removerule')
    .setDescription('Remove a dynamic Twitter tracking rule')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('The name of the rule to remove')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('listrules')
    .setDescription('List all dynamic Twitter tracking rules for this server'),

  new SlashCommandBuilder()
    .setName('checkprofile')
    .setDescription('Fetch X profile info including account age')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('The X username (handle) to check')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('pickwinner')
    .setDescription('Select a winner from Twitter/X replies & generate a verified Chess DAO slip')
    .addStringOption(option =>
      option.setName('post_url')
        .setDescription('The URL of the Twitter/X post')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('min_followers')
        .setDescription('Minimum followers required to win')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('min_age')
        .setDescription('Minimum account age in days required to win')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('require_follow')
        .setDescription('Comma-separated Twitter handles to check if followed (e.g. @ChessDAO)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('must_like')
        .setDescription('Require user to have liked the post')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('must_rt')
        .setDescription('Require user to have retweeted the post')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('winner_count')
        .setDescription('Number of winners to pick (default: 1, max: 5)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show the comprehensive help guide for the Chess Hunter bot')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands globally.`);

    // Register commands globally
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands globally.');

    // Clear guild-specific commands to prevent duplicate entries in Discord UI
    const targetGuildId = '1035210317380198440';
    try {
      await rest.put(
        Routes.applicationGuildCommands(clientId, targetGuildId),
        { body: [] }
      );
      console.log(`Successfully cleared guild commands for guild ${targetGuildId} to prevent duplicates.`);
    } catch (gErr) {
      console.warn(`Guild commands clear warning for ${targetGuildId}:`, gErr.message);
    }
  } catch (error) {
    console.error('Error deploying slash commands:', error);
  }
})();

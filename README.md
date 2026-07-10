# Discord NFT/Twitter Account Tracker Bot

A production-ready Node.js Discord bot that monitors Twitter/X profiles for user-configured keywords (matching bios, display names, and usernames) and automatically alerts a Discord channel with rich embeds. It supports deduplication (notifying each matching profile once per guild) and filtering by account age (identifying new accounts created in the last 48 hours).

The bot does **NOT** use the official Twitter API. Instead, it utilizes the web-scraping-based `agent-twitter-client` library. It caches cookies locally to `cookies.json` to prevent repeated password-based logins, ensuring account stability and preventing login-related rate limits or verification challenges.

---

## Features

- **Twitter Profile Scraping:** Uses `agent-twitter-client` to search Twitter profiles by keyword.
- **Session Caching:** Authenticates via username/password/email on the first run, retrieves cookies, caches them to a local `cookies.json` file, and uses them for all subsequent logins.
- **Keyword Tracking Per Server:** Each Discord server (guild) can independently configure its keyword tracking lists and settings.
- **Configurable Modes:** Support for `new-only` (alerts on accounts created under 48 hours ago) or `all-matches` (alerts on any profile match).
- **Deduplication:** Keeps track of notified Twitter profiles per Discord server in MongoDB to guarantee that no account is announced twice.
- **Rich Alerts:** Beautifully formatted embeds displaying username, display name, biography, avatar, followers count, following count, total tweets count, account creation date, matching keyword, and account age.
- **Slash Commands:** Fully supports modern Discord `/` slash commands (restricted to users with `Manage Server` permissions where appropriate).

---

## Slash Commands

- `/setchannel <channel>` - Specify the Discord text channel where Twitter notifications should be sent (e.g. `#twitter-alerts`).
- `/setkeyword <word>` - Add a keyword to the server's tracked keyword list.
- `/removekeyword <word>` - Stop tracking a specific keyword.
- `/listkeywords` - View all keywords tracked by this server, as well as the active channel and tracking mode.
- `/setmode <new-only|all-matches>` - Switch between alerting only on new accounts (under 48 hours) or alerting on any keyword match regardless of age.

---

## Prerequisites

- **Node.js:** v18 or later.
- **MongoDB:** A running MongoDB instance (local or Atlas cluster).
- **Twitter Account:** A burner or dedicated Twitter account (credentials required: username, password, email).
- **Discord Bot App:** A Discord application registered on the Developer Portal with an active bot token.

---

## Project Structure

```
├── .env.example         # Template environment configuration file
├── config.js            # Environment validation and exports
├── db.js                # Mongoose models and database connection
├── deploy-commands.js   # Script to register Discord slash commands
├── index.js             # Main Discord bot and polling cron scheduler
├── package.json         # Node.js project manifest & dependencies
├── twitter.js           # Scraper authentication, cookie caching, and search logic
└── README.md            # Documentation
```

---

## Installation & Setup

### 1. Install Dependencies
Clone the repository, navigate into the directory, and install dependencies:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill out the variables inside `.env`:
- `DISCORD_TOKEN`: Your Discord bot token from the Developer Portal.
- `CLIENT_ID`: Your Discord Bot Client ID (Application ID). *(Optional, the deploy script will try to decode it from the token if omitted)*.
- `MONGO_URI`: Your MongoDB connection URI.
- `TW_USER`, `TW_PASS`, `TW_EMAIL`: Your Twitter/X credentials.
- `POLL_INTERVAL_CRON`: Cron expression specifying how often to search for keywords. Defaults to `*/7 * * * *` (every 7 minutes).
- `NEW_ACCOUNT_HOURS`: Age threshold in hours to flag an account as "new". Defaults to `48`.

### 3. Set Up Bot Permissions
Ensure your Discord Bot has been invited to your target server with the following permissions:
- `Send Messages`
- `Embed Links`
- `Use Slash Commands`

*(Ensure you check the "applications.commands" scope in the OAuth2 URL Generator on the Discord Developer Portal to enable slash commands!)*

### 4. Deploy Slash Commands
Register the application slash commands globally with Discord:
```bash
npm run deploy-commands
```

---

## Running the Bot

### Locally (Development)
To run the bot locally in the foreground:
```bash
npm start
```
On the first startup:
1. The bot connects to MongoDB.
2. It attempts to load `cookies.json`. Since it doesn't exist yet, it logs into Twitter using the credentials configured in `.env`.
3. It retrieves the session cookies, caches them to `cookies.json`, and starts the scheduler.
4. An immediate poll cycle runs. Any configuration command executed inside servers will take effect on subsequent poll cycles.

---

## Production Deployment (24/7)

The bot operates purely as a background worker and does not run an HTTP server. It is ideal for deployment on a Virtual Private Server (VPS) or a platform like Render.

### Deployment on a VPS with PM2

To run the bot continuously on a Linux/Windows VPS, use `pm2` (Process Manager 2):

1. **Install PM2 globally:**
   ```bash
   npm install -g pm2
   ```

2. **Start the application:**
   ```bash
   pm2 start index.js --name "twitter-tracker-bot"
   ```

3. **Check logs:**
   ```bash
   pm2 logs twitter-tracker-bot
   ```

4. **Ensure startup persistence:**
   ```bash
   pm2 startup
   pm2 save
   ```

### Deployment on Render

1. Create a new **Background Worker** service on Render.
2. Connect your Git repository.
3. Choose the **Node** runtime.
4. Set the build command:
   ```bash
   npm install
   ```
5. Set the start command:
   ```bash
   npm start
   ```
6. Add all the environment variables from your `.env` file under the "Environment" tab of the Render dashboard.

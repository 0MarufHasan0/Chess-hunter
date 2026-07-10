const fs = require('fs');
const path = require('path');
const { Scraper } = require('agent-twitter-client');

const COOKIES_FILE_PATH = path.join(__dirname, 'cookies.json');

/**
 * Delay execution for a given number of milliseconds.
 * @param {number} ms 
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Initializes and authenticates the Twitter scraper.
 * Uses cached cookies if available; otherwise, logs in with credentials and caches the session.
 * @param {object} config Configuration object containing twitter credentials.
 * @returns {Promise<Scraper>} Authenticated Scraper instance.
 */
async function initTwitter(config) {
  // Initialize Scraper with custom fetch option to inject browser User-Agent
  const scraper = new Scraper({
    fetch: (input, init) => {
      const headers = init?.headers || {};
      const uaValue = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      
      if (headers && typeof headers.set === 'function') {
        headers.set('User-Agent', uaValue);
      } else if (Array.isArray(headers)) {
        headers.push(['User-Agent', uaValue]);
      } else {
        headers['User-Agent'] = uaValue;
      }

      if (init) {
        init.headers = headers;
      }
      
      return fetch(input, init);
    }
  });

  let cookiesLoaded = false;
  if (fs.existsSync(COOKIES_FILE_PATH)) {
    try {
      console.log('Found cached Twitter cookies. Loading...');
      const cookiesData = fs.readFileSync(COOKIES_FILE_PATH, 'utf-8');
      const cookies = JSON.parse(cookiesData);
      
      // Convert cookie objects to .twitter.com string format for tough-cookie compatibility
      const cookieStrings = [];
      if (Array.isArray(cookies)) {
        for (const cookie of cookies) {
          const key = cookie.key || cookie.name;
          if (!key) continue;
          const path = cookie.path || '/';
          cookieStrings.push(`${key}=${cookie.value}; Domain=.twitter.com; Path=${path}`);
        }
      }
      
      await scraper.setCookies(cookieStrings);
      
      // Verify if cookies are still valid
      const loggedIn = await scraper.isLoggedIn();
      if (loggedIn) {
        console.log('Successfully logged in using cached cookies.');
        cookiesLoaded = true;
      } else {
        console.warn('Cached cookies are expired or invalid. Re-authenticating with credentials...');
      }
    } catch (err) {
      console.error('Error loading cached cookies:', err.message);
    }
  }

  if (!cookiesLoaded) {
    console.log(`Logging in to Twitter as username: ${config.username}...`);
    try {
      // Standard login sequence: username, password, email
      await scraper.login(config.username, config.password, config.email);
      
      const loggedIn = await scraper.isLoggedIn();
      if (!loggedIn) {
        throw new Error('Twitter login failed: isLoggedIn returned false after login call.');
      }

      console.log('Successfully logged in with credentials. Caching cookies...');
      
      // Fetch and cache the new session cookies
      const cookies = await scraper.getCookies();
      fs.writeFileSync(COOKIES_FILE_PATH, JSON.stringify(cookies, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to authenticate with Twitter:', err.message);
      throw err;
    }
  }

  return scraper;
}

/**
 * Search Twitter profiles for a specific keyword.
 * Wraps search in try/catch to prevent errors from stopping the entire poll cycle.
 * @param {Scraper} scraper The scraper client instance.
 * @param {string} keyword The keyword to search for.
 * @param {number} limit Maximum number of profiles to fetch (default: 20).
 * @returns {Promise<Array>} Array of matched profile objects.
 */
async function searchProfilesSafe(scraper, keyword, limit = 20) {
  try {
    console.log(`Searching Twitter profiles for keyword: "${keyword}"...`);
    const results = await scraper.searchProfiles(keyword, limit);
    
    const profiles = [];
    if (results && typeof results[Symbol.asyncIterator] === 'function') {
      for await (const profile of results) {
        profiles.push(profile);
        if (profiles.length >= limit) {
          break;
        }
      }
    } else if (results && Array.isArray(results)) {
      profiles.push(...results);
    } else {
      console.warn(`Search for keyword "${keyword}" returned unknown result format:`, results);
    }

    console.log(`Keyword "${keyword}" returned ${profiles.length} profiles.`);
    return profiles;
  } catch (err) {
    console.error(`Error searching profiles for keyword "${keyword}":`, err.message);
    return [];
  }
}

module.exports = {
  initTwitter,
  searchProfilesSafe,
  delay
};

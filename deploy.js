const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const config = {
  host: '89.144.8.148',
  port: 22,
  username: 'root',
  password: 'n6r5Xp15ONfP3RSyP8wk'
};

const remoteDir = '/root/chess-picker-bot';

const filesToUpload = [
  'package.json',
  'index.js',
  'twitter.js',
  'db.js',
  'config.js',
  'deploy-commands.js',
  '.env',
  'cookies.json',
  'logo.jpg'
];

conn.on('ready', () => {
  // Create remote folder (cleaning up any previous corrupted paths first)
  conn.exec(`rm -rf ${remoteDir} && mkdir -p ${remoteDir}`, (err, stream) => {
    if (err) {
      console.error('Error creating directory:', err);
      conn.end();
      return;
    }
    
    stream.on('close', (code, signal) => {
      console.log('Created remote directory successfully. Uploading files...');
      
      // Start SFTP upload
      conn.sftp((err, sftp) => {
        if (err) {
          console.error('SFTP initialization error:', err);
          conn.end();
          return;
        }
        
        let uploaded = 0;
        filesToUpload.forEach(file => {
          const localPath = path.join(__dirname, file);
          const remotePath = path.posix.join(remoteDir, file);
          
          if (!fs.existsSync(localPath)) {
            console.log(`Skipping file (not found locally): ${file}`);
            uploaded++;
            if (uploaded === filesToUpload.length) startInstall();
            return;
          }
          
          sftp.fastPut(localPath, remotePath, (err) => {
            if (err) {
              console.error(`Error uploading ${file}:`, err);
            } else {
              console.log(`Uploaded: ${file}`);
            }
            uploaded++;
            if (uploaded === filesToUpload.length) {
              console.log('All files uploaded successfully.');
              startInstall();
            }
          });
        });
      });
    });
    
    stream.stdout.on('data', (data) => process.stdout.write(data));
    stream.stderr.on('data', (data) => process.stderr.write(data));
  });
}).connect(config);

function startInstall() {
  console.log('Starting remote installation, dependency setup, and process manager...');
  
  // Remote execution script
  const remoteCmd = `
    # Determine package manager and install Node.js if missing
    if ! command -v node &> /dev/null; then
      echo "Node.js not found. Installing Node.js..."
      if command -v apt-get &> /dev/null; then
        apt-get update
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
      elif command -v yum &> /dev/null; then
        curl -sL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
      else
        echo "Could not auto-install Node.js. Please install node manually."
        exit 1
      fi
    else
      echo "Node.js is already installed: $(node -v)"
    fi
    
    # Install PM2 globally if missing
    if ! command -v pm2 &> /dev/null; then
      echo "PM2 not found. Installing PM2 globally..."
      npm install -g pm2
    else
      echo "PM2 is already installed: $(pm2 -v)"
    fi
    
    # Go to app directory
    cd ${remoteDir}
    
    echo "Running npm install on the VPS..."
    npm install --omit=dev
    
    echo "Registering process with PM2..."
    pm2 stop twitter-tracker || true
    pm2 delete twitter-tracker || true
    pm2 stop chess-picker-bot || true
    pm2 delete chess-picker-bot || true
    pm2 start index.js --name "chess-picker-bot"
    pm2 save
    
    echo "=== PM2 Status ==="
    pm2 status
  `;
  
  conn.exec(remoteCmd, (err, stream) => {
    if (err) {
      console.error('Error running setup command:', err);
      conn.end();
      return;
    }
    
    stream.on('close', (code, signal) => {
      console.log('\n========================================');
      console.log('DEPLOYMENT COMPLETE!');
      console.log('The bot is now running on your VPS via PM2.');
      console.log('========================================');
      conn.end();
      process.exit(0);
    });
    
    stream.stdout.on('data', (data) => process.stdout.write(data));
    stream.stderr.on('data', (data) => process.stderr.write(data));
  });
}

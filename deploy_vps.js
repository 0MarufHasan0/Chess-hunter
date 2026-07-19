const { Client } = require('ssh2');
const path = require('path');

const conn = new Client();
const config = {
  host: '89.144.8.148',
  port: 22,
  username: 'root',
  password: 'n6r5Xp15ONfP3RSyP8wk'
};

const filesToUpload = [
  'index.js',
  'deploy-commands.js',
  'picker/app.js',
  'picker/index.html',
  'picker/style.css'
];

conn.on('ready', () => {
  console.log('SSH connection established to VPS.');

  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP Error:', err);
      conn.end();
      return;
    }

    sftp.mkdir('/root/chess-picker-bot/picker', () => {
      const remoteBase = '/root/chess-picker-bot';
      console.log(`Syncing files to ${remoteBase}...`);

      let done = 0;
      filesToUpload.forEach(relPath => {
        const localPath = path.join(__dirname, relPath);
        const remotePath = `${remoteBase}/${relPath}`;

        sftp.fastPut(localPath, remotePath, err2 => {
          if (err2) {
            console.error(`Failed ${relPath}:`, err2.message);
          } else {
            console.log(`✔ Uploaded ${relPath}`);
          }
          done++;
          if (done === filesToUpload.length) {
            console.log('Deploying slash commands & restarting ONLY chess-picker-bot (ID 6)...');
            conn.exec(`cd ${remoteBase} && node deploy-commands.js && pm2 restart chess-picker-bot`, (err3, stream) => {
              stream.on('close', () => {
                console.log('✅ VPS Deployment completed successfully!');
                conn.end();
                process.exit(0);
              });
              stream.stdout.on('data', d => process.stdout.write(d));
              stream.stderr.on('data', d => process.stderr.write(d));
            });
          }
        });
      });
    });
  });
}).connect(config);

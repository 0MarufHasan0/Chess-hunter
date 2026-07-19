const { Client } = require('ssh2');

const conn = new Client();

const config = {
  host: '89.144.8.148',
  port: 22,
  username: 'root',
  password: 'n6r5Xp15ONfP3RSyP8wk'
};

conn.on('ready', () => {
  console.log('SSH connection established to VPS. Fetching PM2 logs...');
  
  conn.exec('pm2 logs twitter-tracker --lines 50 --raw', (err, stream) => {
    if (err) {
      console.error('Error executing logs command:', err);
      conn.end();
      return;
    }
    
    stream.on('close', (code, signal) => {
      console.log('\nPM2 log fetch completed.');
      conn.end();
      process.exit(0);
    });
    
    stream.stdout.on('data', (data) => process.stdout.write(data));
    stream.stderr.on('data', (data) => process.stderr.write(data));
  });
}).connect(config);

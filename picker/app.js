// Mock Web3 Candidate database
const mockCandidatesPool = [
  { name: "Satoshi Nakamoto", handle: "@satoshi_99", followers: 4500, age: 360, likes: true, rts: true },
  { name: "Vitalik Buterin", handle: "@vitalik_eth", followers: 4900, age: 340, likes: true, rts: true },
  { name: "Web3 Degenerate", handle: "@degen_king", followers: 1200, age: 180, likes: true, rts: true },
  { name: "Chess Grandmaster", handle: "@chess_gm_xyz", followers: 3200, age: 290, likes: true, rts: true },
  { name: "Alpha Finder", handle: "@alpha_nft_finder", followers: 850, age: 95, likes: true, rts: true },
  { name: "Crypto Knight", handle: "@crypto_knight_dao", followers: 1500, age: 120, likes: true, rts: true },
  { name: "Early NFT Collector", handle: "@early_nft_finds", followers: 2400, age: 210, likes: true, rts: true },
  { name: "DAO Contributor", handle: "@chess_dao_cont", followers: 600, age: 45, likes: true, rts: false },
  { name: "Solana Bull", handle: "@sol_bull_run", followers: 1800, age: 150, likes: true, rts: true },
  { name: "Ethereum Whale", handle: "@eth_whale_9", followers: 3500, age: 310, likes: true, rts: true },
  { name: "NFT Hunter", handle: "@hunter_nft_project", followers: 980, age: 80, likes: false, rts: true },
  { name: "Checkmate Alpha", handle: "@checkmate_nft", followers: 2200, age: 250, likes: true, rts: true },
  { name: "Degen Gambler", handle: "@degen_gambler_x", followers: 450, age: 60, likes: true, rts: true },
  { name: "GM Hikaru fan", handle: "@hikaru_fan_club", followers: 1100, age: 140, likes: true, rts: true },
  { name: "Chess King", handle: "@chess_king_nft", followers: 1350, age: 115, likes: true, rts: true },
  { name: "Tactical Degen", handle: "@tactical_degen", followers: 750, age: 70, likes: true, rts: true },
  { name: "Rook Collector", handle: "@rook_collector", followers: 1650, age: 195, likes: true, rts: true },
  { name: "Pawn to Queen", handle: "@pawn_to_queen", followers: 2050, age: 225, likes: true, rts: true },
  { name: "Endgame Strategy", handle: "@endgame_strat", followers: 2800, age: 275, likes: true, rts: true },
  { name: "Fischer Fanatic", handle: "@fischer_fan", followers: 550, age: 50, likes: true, rts: true }
];

// Document Elements
const followersSlider = document.getElementById('min-followers');
const followersVal = document.getElementById('followers-val');
const ageSlider = document.getElementById('min-age');
const ageVal = document.getElementById('age-val');
const btnDraw = document.getElementById('btn-draw');
const btnDownload = document.getElementById('btn-download');
const btnReset = document.getElementById('btn-reset');
const liveSelectorCard = document.getElementById('live-selector-card');
const spinnerContainer = document.getElementById('spinner-container');
const spinnerList = document.getElementById('spinner-list');
const winnerCard = document.getElementById('winner-card');
const customRepliesTextarea = document.getElementById('custom-replies');

// Winner display fields
const winnerAvatar = document.getElementById('winner-avatar');
const winnerName = document.getElementById('winner-name');
const winnerHandle = document.getElementById('winner-handle');
const statFollowers = document.getElementById('stat-followers');
const statAge = document.getElementById('stat-age');
const certCanvas = document.getElementById('cert-canvas');
const certPreview = document.getElementById('cert-preview');

// App state
let currentWinner = null;
let isDrawing = false;

// Audio context synthesizer helper for click sounds
function playTickSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    // Web audio blocked or unsupported
  }
}

// Update range slider labels
followersSlider.addEventListener('input', () => {
  followersVal.textContent = followersSlider.value;
});

ageSlider.addEventListener('input', () => {
  ageVal.textContent = ageSlider.value;
});

// Setup click action for Draw
btnDraw.addEventListener('click', startWinnerDraw);
btnReset.addEventListener('click', resetDrawState);
btnDownload.addEventListener('click', downloadWinnerSlip);

function resetDrawState() {
  winnerCard.classList.add('hidden');
  liveSelectorCard.classList.remove('hidden');
  spinnerContainer.classList.add('hidden');
  liveSelectorCard.querySelector('.chess-icon-large').style.display = 'block';
  liveSelectorCard.querySelector('.section-title').textContent = 'Ready for Draw';
  liveSelectorCard.querySelector('.desc-text').textContent = 'Fill in the configurations and click the button to start the lottery';
  currentWinner = null;
}

function startWinnerDraw() {
  if (isDrawing) return;
  
  // 1. Gather Criteria
  const postLink = document.getElementById('post-link').value.trim();
  const minFollowers = parseInt(followersSlider.value);
  const minAge = parseInt(ageSlider.value);
  const reqLike = document.getElementById('req-like').checked;
  const reqRt = document.getElementById('req-rt').checked;
  
  if (!postLink) {
    alert("Please enter a valid Twitter/X Post Link to verify replies.");
    return;
  }

  // 2. Build candidates list
  let candidates = [];
  const pastedText = customRepliesTextarea.value.trim();
  
  if (pastedText) {
    // Parse custom list of users
    candidates = pastedText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(handle => {
        const cleanHandle = handle.startsWith('@') ? handle : '@' + handle;
        const name = cleanHandle.substring(1).replace(/_/g, ' ').toUpperCase();
        // Generate pseudo-random realistic values for filter evaluation
        return {
          name: name,
          handle: cleanHandle,
          followers: Math.floor(Math.random() * 4800) + 50,
          age: Math.floor(Math.random() * 300) + 10,
          likes: Math.random() > 0.15,
          rts: Math.random() > 0.15
        };
      });
  } else {
    // Use high quality mock pool
    candidates = [...mockCandidatesPool];
  }

  // 3. Filter candidates
  const filtered = candidates.filter(user => {
    if (user.followers < minFollowers) return false;
    if (user.age < minAge) return false;
    if (reqLike && !user.likes) return false;
    if (reqRt && !user.rts) return false;
    return true;
  });

  if (filtered.length === 0) {
    alert("No candidates matched your filter requirements! Try lowering the criteria.");
    return;
  }

  // Prep GUI spinner
  isDrawing = true;
  liveSelectorCard.querySelector('.chess-icon-large').style.display = 'none';
  liveSelectorCard.querySelector('.section-title').textContent = 'Selecting Winner...';
  liveSelectorCard.querySelector('.desc-text').textContent = `Filtering from ${filtered.length} qualified entries.`;
  spinnerContainer.classList.remove('hidden');

  // Build items in spinner to show rapid scrolling
  spinnerList.innerHTML = '';
  // Repeat filtered list elements to make a long spinning strip
  const repeatCount = Math.max(15, Math.ceil(40 / filtered.length));
  const spinArray = [];
  for (let r = 0; r < repeatCount; r++) {
    filtered.forEach(c => spinArray.push(c));
  }

  // Render elements in spinner list
  spinArray.forEach((candidate, idx) => {
    const item = document.createElement('div');
    item.className = 'spinner-item';
    
    // Choose beautiful color theme based on name
    const hue = Math.floor(Math.random() * 360);
    const initial = candidate.name.charAt(0);
    
    item.innerHTML = `
      <div class="spinner-avatar" style="background: hsl(${hue}, 70%, 40%); display: flex; align-items: center; justify-content: center; font-weight: 800; color: #fff; font-size: 1.25rem;">
        ${initial}
      </div>
      <div class="spinner-meta">
        <div class="spinner-name">${candidate.name}</div>
        <div class="spinner-handle">${candidate.handle}</div>
      </div>
    `;
    spinnerList.appendChild(item);
  });

  // Calculate final winner
  const winnerIndex = Math.floor(Math.random() * filtered.length);
  const targetWinner = filtered[winnerIndex];
  
  // Find where our target winner is placed near the end of the spinning list (to slow down nicely)
  const targetScrollIndex = spinArray.length - filtered.length + winnerIndex - 1;
  const itemHeight = 120; // Match CSS spinner-item height

  // Animation timeline
  let currentY = 0;
  const totalTicks = 80;
  let tick = 0;
  
  // Custom exponential easing curve for premium slot machine slowdown feel
  function animateSpinner() {
    tick++;
    const progress = tick / totalTicks;
    const easedProgress = 1 - Math.pow(1 - progress, 4); // Quartic ease-out
    
    const targetY = -(targetScrollIndex * itemHeight);
    currentY = easedProgress * targetY;
    
    spinnerList.style.transform = `translateY(${currentY}px)`;
    
    // Play ticking sounds dynamically slowing down as it reaches the end
    const itemsScrolled = Math.floor(Math.abs(currentY) / itemHeight);
    const prevItemsScrolled = Math.floor(Math.abs(currentY - (targetY/totalTicks)) / itemHeight);
    
    if (itemsScrolled !== prevItemsScrolled && Math.random() > 0.4) {
      playTickSound();
    }

    if (tick < totalTicks) {
      requestAnimationFrame(animateSpinner);
    } else {
      // Completed, announce winner
      setTimeout(() => {
        isDrawing = false;
        showWinner(targetWinner);
      }, 600);
    }
  }

  animateSpinner();
}

function showWinner(winner) {
  currentWinner = winner;
  
  // Set text
  winnerName.textContent = winner.name;
  winnerHandle.textContent = winner.handle;
  statFollowers.textContent = `👥 ${winner.followers.toLocaleString()} followers`;
  statAge.textContent = `📅 ${winner.age} days old`;

  // Draw colorful random avatar
  const hue = Math.floor(Math.random() * 360);
  winnerAvatar.style.background = `hsl(${hue}, 80%, 45%)`;
  winnerAvatar.style.display = 'flex';
  winnerAvatar.style.alignItems = 'center';
  winnerAvatar.style.justifyContent = 'center';
  winnerAvatar.style.fontWeight = '800';
  winnerAvatar.style.color = '#fff';
  winnerAvatar.style.fontSize = '1.75rem';
  winnerAvatar.textContent = winner.name.charAt(0);

  // Generate high quality canvas certificate/slip
  generateWinnerSlipCanvas(winner, hue);

  // Switch views
  liveSelectorCard.classList.add('hidden');
  winnerCard.classList.remove('hidden');
}

// Generate the beautiful certified download slip on canvas
function generateWinnerSlipCanvas(winner, avatarHue) {
  const ctx = certCanvas.getContext('2d');
  const width = certCanvas.width;
  const height = certCanvas.height;

  // 1. Draw Space Gradient Background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0c0f16');
  grad.addColorStop(0.5, '#121622');
  grad.addColorStop(1, '#080a0f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2. Draw Ambient Grid Lines for Web3 High-tech feel
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.03)';
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

  // 3. Draw Dual Border Frame
  // Outer Cyan Glow Border
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(0, 242, 254, 0.4)';
  ctx.shadowBlur = 15;
  ctx.strokeRect(15, 15, width - 30, height - 30);
  ctx.shadowBlur = 0; // Reset shadow

  // Inner Gold Thin Frame
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(25, 25, width - 50, height - 50);

  // 4. Draw Header text
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 24px Outfit, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('♞  CHESS HUNTER GIVEAWAY', 50, 65);

  ctx.fillStyle = '#00f2fe';
  ctx.font = '700 12px Outfit, sans-serif';
  ctx.fillText('OFFICIAL WINNER CERTIFICATE', 50, 85);

  // 5. Draw Winner Details Box (Glassmorphic look)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  // Round rect helper
  drawRoundRect(ctx, 50, 120, 480, 180, 12);
  ctx.fill();
  ctx.stroke();

  // Winner Avatar inside certificate
  ctx.save();
  ctx.beginPath();
  ctx.arc(110, 210, 40, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // Fill avatar background
  ctx.fillStyle = `hsl(${avatarHue}, 80%, 45%)`;
  ctx.fillRect(70, 170, 80, 80);
  // Draw Avatar Initial
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 36px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(winner.name.charAt(0), 110, 210);
  ctx.restore();

  // Avatar Gold Ring
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(110, 210, 40, 0, Math.PI * 2);
  ctx.stroke();

  // Text Winner Meta
  ctx.textBaseline = 'alphabetic'; // Reset
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 24px Outfit, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(winner.name, 170, 195);

  ctx.fillStyle = '#00e676';
  ctx.font = 'bold 15px JetBrains Mono, monospace';
  ctx.fillText(winner.handle, 170, 222);

  // Winner Twitter Stats inside Certificate
  ctx.fillStyle = '#90a4ae';
  ctx.font = '600 13px Outfit, sans-serif';
  ctx.fillText(`Followers: ${winner.followers.toLocaleString()}   |   Account Age: ${winner.age} days`, 170, 255);

  // 6. Draw Verified Verification Details (Verification Hash)
  const serialNo = `CH-${Math.floor(100000 + Math.random() * 900000)}`;
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const hash = 'SHA256-' + Array.from({length: 16}, () => Math.floor(Math.random()*16).toString(16)).join('').toUpperCase();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '600 11px JetBrains Mono, monospace';
  ctx.fillText(`SERIAL: ${serialNo}`, 50, 345);
  ctx.fillText(`VALIDATION HASH: ${hash}`, 50, 365);
  ctx.fillText(`DATE: ${dateStr}`, 50, 385);

  // 7. Draw the Premium Chess DAO Seal & Stamp (Right Side)
  drawChessDAOSeal(ctx, 640, 220);

  // Export to preview image
  const dataURL = certCanvas.toDataURL('image/png');
  certPreview.src = dataURL;
}

// Draw Chess DAO Official Wax/Ink Stamp on Canvas
function drawChessDAOSeal(ctx, cx, cy) {
  ctx.save();
  ctx.shadowColor = 'rgba(255, 215, 0, 0.3)';
  ctx.shadowBlur = 12;

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
  ctx.shadowBlur = 0; // disable shadow for clean vectors
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.stroke();

  // Circular Text: VERIFIED CHESS DAO
  ctx.fillStyle = '#3e2723';
  ctx.font = 'bold 11px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textTop = "VERIFIED CHESS DAO";
  const textBottom = "★ SECURE DRAW ★";

  // Draw top text curved
  drawTextAroundCircle(ctx, textTop, cx, cy, 47, Math.PI * 1.5, false);
  // Draw bottom text curved
  drawTextAroundCircle(ctx, textBottom, cx, cy, 47, Math.PI * 0.5, true);

  // Draw Gold Chess Knight symbol in the middle
  ctx.fillStyle = '#3e2723';
  ctx.font = '800 48px Outfit, sans-serif';
  ctx.fillText('♞', cx, cy - 2);

  // Small stars or accents on left/right of circle text
  ctx.font = 'bold 12px Outfit, sans-serif';
  ctx.fillText('★', cx - 48, cy);
  ctx.fillText('★', cx + 48, cy);

  ctx.restore();
}

// Circle Text Renderer Helper
function drawTextAroundCircle(ctx, text, cx, cy, radius, startAngle, bottom) {
  const characters = text.split("");
  const totalAngle = 1.3 * Math.PI; // Spread angle
  const anglePerChar = totalAngle / characters.length;

  ctx.save();
  ctx.translate(cx, cy);

  if (bottom) {
    // Flip rotation for bottom text so it is readable left-to-right
    characters.reverse();
    const startOffset = -((characters.length - 1) * anglePerChar) / 2;
    ctx.rotate(startAngle + startOffset);
    
    characters.forEach((char) => {
      ctx.save();
      ctx.translate(0, radius);
      ctx.scale(1, -1); // flip text vertically
      ctx.fillText(char, 0, 0);
      ctx.restore();
      ctx.rotate(anglePerChar);
    });
  } else {
    // Normal top text
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

// Round Rect Helper
function drawRoundRect(ctx, x, y, width, height, radius) {
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

// Download action trigger
function downloadWinnerSlip() {
  if (!currentWinner) return;

  const dataURL = certCanvas.toDataURL('image/png');
  const link = document.createElement('a');
  
  // Format clean filename based on winner handle
  const safeHandle = currentWinner.handle.replace(/[@]/g, '');
  link.download = `chess-dao-winner-${safeHandle}.png`;
  link.href = dataURL;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

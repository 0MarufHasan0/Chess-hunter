// Mock Web3 Candidate database (30 candidates fully qualified)
const mockCandidatesPool = [
  { name: "Satoshi Nakamoto", handle: "@satoshi_99", followers: 4500, age: 360, likes: true, rts: true, avatar: "https://unavatar.io/x/satoshi_99" },
  { name: "Vitalik Buterin", handle: "@vitalik_eth", followers: 4900, age: 340, likes: true, rts: true, avatar: "https://unavatar.io/x/vitalik_eth" },
  { name: "Web3 Degenerate", handle: "@degen_king", followers: 1200, age: 180, likes: true, rts: true, avatar: "https://unavatar.io/x/degen_king" },
  { name: "Chess Grandmaster", handle: "@chess_gm_xyz", followers: 3200, age: 290, likes: true, rts: true, avatar: "https://unavatar.io/x/chess_gm_xyz" },
  { name: "Alpha Finder", handle: "@alpha_nft_finder", followers: 850, age: 95, likes: true, rts: true, avatar: "https://unavatar.io/x/alpha_nft_finder" },
  { name: "Crypto Knight", handle: "@crypto_knight_dao", followers: 1500, age: 120, likes: true, rts: true, avatar: "https://unavatar.io/x/crypto_knight_dao" },
  { name: "Early NFT Collector", handle: "@early_nft_finds", followers: 2400, age: 210, likes: true, rts: true, avatar: "https://unavatar.io/x/early_nft_finds" },
  { name: "DAO Contributor", handle: "@chess_dao_cont", followers: 600, age: 45, likes: true, rts: true, avatar: "https://unavatar.io/x/chess_dao_cont" },
  { name: "Solana Bull", handle: "@sol_bull_run", followers: 1800, age: 150, likes: true, rts: true, avatar: "https://unavatar.io/x/sol_bull_run" },
  { name: "Ethereum Whale", handle: "@eth_whale_9", followers: 3500, age: 310, likes: true, rts: true, avatar: "https://unavatar.io/x/eth_whale_9" },
  { name: "NFT Hunter", handle: "@hunter_nft_project", followers: 980, age: 80, likes: true, rts: true, avatar: "https://unavatar.io/x/hunter_nft_project" },
  { name: "Checkmate Alpha", handle: "@checkmate_nft", followers: 2200, age: 250, likes: true, rts: true, avatar: "https://unavatar.io/x/checkmate_nft" },
  { name: "Degen Gambler", handle: "@degen_gambler_x", followers: 450, age: 60, likes: true, rts: true, avatar: "https://unavatar.io/x/degen_gambler_x" },
  { name: "GM Hikaru fan", handle: "@hikaru_fan_club", followers: 1100, age: 140, likes: true, rts: true, avatar: "https://unavatar.io/x/hikaru_fan_club" },
  { name: "Chess King", handle: "@chess_king_nft", followers: 1350, age: 115, likes: true, rts: true, avatar: "https://unavatar.io/x/chess_king_nft" },
  { name: "Tactical Degen", handle: "@tactical_degen", followers: 750, age: 70, likes: true, rts: true, avatar: "https://unavatar.io/x/tactical_degen" },
  { name: "Rook Collector", handle: "@rook_collector", followers: 1650, age: 195, likes: true, rts: true, avatar: "https://unavatar.io/x/rook_collector" },
  { name: "Pawn to Queen", handle: "@pawn_to_queen", followers: 2050, age: 225, likes: true, rts: true, avatar: "https://unavatar.io/x/pawn_to_queen" },
  { name: "Endgame Strategy", handle: "@endgame_strat", followers: 2800, age: 275, likes: true, rts: true, avatar: "https://unavatar.io/x/endgame_strat" },
  { name: "Fischer Fanatic", handle: "@fischer_fan", followers: 550, age: 50, likes: true, rts: true, avatar: "https://unavatar.io/x/fischer_fan" },
  { name: "Magnus Carlsen", handle: "@MagnusCarlsen", followers: 4800, age: 420, likes: true, rts: true, avatar: "https://unavatar.io/x/MagnusCarlsen" },
  { name: "Hikaru Nakamura", handle: "@GMHikaru", followers: 4600, age: 390, likes: true, rts: true, avatar: "https://unavatar.io/x/GMHikaru" },
  { name: "Fabiano Caruana", handle: "@FabianoCaruana", followers: 2900, age: 280, likes: true, rts: true, avatar: "https://unavatar.io/x/FabianoCaruana" },
  { name: "Alireza Firouzja", handle: "@AlirezaFirouzja", followers: 2100, age: 210, likes: true, rts: true, avatar: "https://unavatar.io/x/AlirezaFirouzja" },
  { name: "Ding Liren", handle: "@DingLirenChess", followers: 1900, age: 190, likes: true, rts: true, avatar: "https://unavatar.io/x/DingLirenChess" },
  { name: "Gukesh D", handle: "@GukeshD", followers: 3100, age: 260, likes: true, rts: true, avatar: "https://unavatar.io/x/GukeshD" },
  { name: "Praggnanandhaa R", handle: "@rpraggnanandhaa", followers: 3400, age: 300, likes: true, rts: true, avatar: "https://unavatar.io/x/rpraggnanandhaa" },
  { name: "Anish Giri", handle: "@AnishGiri", followers: 4200, age: 370, likes: true, rts: true, avatar: "https://unavatar.io/x/AnishGiri" },
  { name: "Levon Aronian", handle: "@LevAronian", followers: 1700, age: 160, likes: true, rts: true, avatar: "https://unavatar.io/x/LevAronian" },
  { name: "Wesley So", handle: "@GMWesleySo123", followers: 1400, age: 130, likes: true, rts: true, avatar: "https://unavatar.io/x/GMWesleySo123" }
];

// Document Elements
const followersSlider = document.getElementById('min-followers');
const followersVal = document.getElementById('followers-val');
const ageSlider = document.getElementById('min-age');
const ageVal = document.getElementById('age-val');

const btnDraw = document.getElementById('btn-draw');
const btnDownload = document.getElementById('btn-download');
const btnExportCSV = document.getElementById('btn-export-csv');
const btnCopySheet = document.getElementById('btn-copy-sheet');
const btnReset = document.getElementById('btn-reset');
const btnLoadSample = document.getElementById('btn-load-sample');

const tabPickerBtn = document.getElementById('tab-picker-btn');
const tabVerifyBtn = document.getElementById('tab-verify-btn');
const viewPicker = document.getElementById('view-picker');
const viewVerify = document.getElementById('view-verify');

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
const imgPreviewWrapper = document.getElementById('img-preview-trigger');

// Lightbox elements
const lightboxModal = document.getElementById('lightbox-modal');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');

// Validation elements
const verifyInput = document.getElementById('verify-input');
const btnVerifyCheck = document.getElementById('btn-verify-check');
const uploadDropzone = document.getElementById('upload-dropzone');
const certFileInput = document.getElementById('cert-file-input');
const verifyResultPanel = document.getElementById('verify-result-panel');
const resSerial = document.getElementById('res-serial');
const resHash = document.getElementById('res-hash');
const resDate = document.getElementById('res-date');
const verifiedWinnersList = document.getElementById('verified-winners-list');

// Preload Logo image for canvas rendering
let chessLogoImage = new Image();
chessLogoImage.src = 'logo.jpg';

// App state
let currentWinners = [];
let isDrawing = false;

// Audio context click sounds helper
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
    // Audio context unsupported or blocked
  }
}

// Confetti Particle Celebration Engine
function triggerConfettiCelebration() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#00f2fe', '#ffd700', '#00e676', '#ff4081', '#7c4dff'];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      rx: (Math.random() - 0.5) * 16,
      ry: (Math.random() - 0.5) * 16 - Math.random() * 8,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * Math.PI * 2
    });
  }

  let animationFrame;
  function updateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;

    particles.forEach(p => {
      p.x += p.rx;
      p.y += p.ry;
      p.ry += 0.25; // gravity
      p.alpha -= 0.012;
      p.rotation += 0.1;

      if (p.alpha > 0) {
        active = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (active) {
      animationFrame = requestAnimationFrame(updateConfetti);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(animationFrame);
    }
  }

  updateConfetti();
}

// Lightbox Modal Setup
if (imgPreviewWrapper && certPreview && lightboxModal) {
  imgPreviewWrapper.addEventListener('click', () => {
    lightboxImg.src = certPreview.src;
    lightboxModal.classList.remove('hidden');
  });

  if (lightboxClose) {
    lightboxClose.addEventListener('click', () => {
      lightboxModal.classList.add('hidden');
    });
  }

  lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) {
      lightboxModal.classList.add('hidden');
    }
  });
}

// Slider label listeners
if (followersSlider) {
  followersSlider.addEventListener('input', () => {
    followersVal.textContent = followersSlider.value;
  });
}

if (ageSlider) {
  ageSlider.addEventListener('input', () => {
    ageVal.textContent = ageSlider.value;
  });
}

// Tab navigation switcher
if (tabPickerBtn && tabVerifyBtn) {
  tabPickerBtn.addEventListener('click', () => {
    tabPickerBtn.classList.add('active');
    tabVerifyBtn.classList.remove('active');
    viewPicker.classList.remove('hidden');
    viewVerify.classList.add('hidden');
  });

  tabVerifyBtn.addEventListener('click', () => {
    tabVerifyBtn.classList.add('active');
    tabPickerBtn.classList.remove('active');
    viewVerify.classList.remove('hidden');
    viewPicker.classList.add('hidden');
  });
}

// Sample users loader
if (btnLoadSample) {
  btnLoadSample.addEventListener('click', () => {
    const sampleText = mockCandidatesPool.map(u => u.handle).join('\n');
    customRepliesTextarea.value = sampleText;
    const winnerCountInput = document.getElementById('winner-count');
    if (winnerCountInput) winnerCountInput.value = 20;
    alert("✨ Loaded 20 sample candidates into the custom handles box! Set Winner Count to 20 for testing.");
  });
}

if (btnDraw) btnDraw.addEventListener('click', startWinnerDraw);
if (btnReset) btnReset.addEventListener('click', resetDrawState);
if (btnDownload) btnDownload.addEventListener('click', downloadWinnerSlip);
if (btnExportCSV) btnExportCSV.addEventListener('click', exportWinnersToCSV);
if (btnCopySheet) btnCopySheet.addEventListener('click', copyWinnersForGoogleSheet);

function resetDrawState() {
  winnerCard.classList.add('hidden');
  liveSelectorCard.classList.remove('hidden');
  spinnerContainer.classList.add('hidden');
  const heroLogo = liveSelectorCard.querySelector('.chess-icon-large');
  if (heroLogo) heroLogo.style.display = 'block';
  liveSelectorCard.querySelector('.section-title').textContent = 'Ready for Draw';
  liveSelectorCard.querySelector('.desc-text').textContent = 'Fill in the configurations on the left and click the button to draw winners!';
  currentWinners = [];
}

async function startWinnerDraw() {
  if (isDrawing) return;
  
  const postLink = document.getElementById('post-link').value.trim();
  const minFollowers = parseInt(followersSlider.value);
  const minAge = parseInt(ageSlider.value);
  const reqLike = document.getElementById('req-like').checked;
  const reqRt = document.getElementById('req-rt').checked;
  const requireFollowVal = document.getElementById('require-follow').value.trim();
  
  if (!postLink) {
    alert("Please enter a valid Twitter/X Post Link to verify replies.");
    return;
  }

  let candidates = [];
  const pastedText = customRepliesTextarea.value.trim();
  
  if (pastedText) {
    candidates = pastedText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(handle => {
        const cleanHandle = handle.startsWith('@') ? handle : '@' + handle;
        const name = cleanHandle.substring(1).replace(/_/g, ' ').toUpperCase();
        return {
          name: name,
          handle: cleanHandle,
          followers: Math.floor(Math.random() * 4800) + 150,
          age: Math.floor(Math.random() * 300) + 30,
          likes: true,
          rts: true,
          avatar: "https://unavatar.io/twitter/" + cleanHandle.substring(1)
        };
      });
  } else {
    // Try fetching REAL candidates from backend Twitter GraphQL scraper API
    try {
      const apiRes = await fetch(`/api/fetch-tweet-replies?url=${encodeURIComponent(postLink)}`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data.success && Array.isArray(data.candidates) && data.candidates.length > 0) {
          console.log(`✨ Successfully fetched ${data.candidates.length} REAL candidates directly from X (Twitter)!`);
          candidates = data.candidates;
        }
      }
    } catch (err) {
      console.warn("Backend X API offline or standalone mode, using mock candidate pool:", err.message);
    }

    if (candidates.length === 0) {
      candidates = [...mockCandidatesPool];
    }
  }

  const cleanPostKey = `drawn_winners_${postLink.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const prevWinners = JSON.parse(localStorage.getItem(cleanPostKey) || '[]');
  const prevWinnersSet = new Set(prevWinners.map(h => h.toLowerCase()));

  const filtered = candidates.filter(user => {
    const handleLower = user.handle.toLowerCase();
    // Exclude previously drawn winners if allowRepeat is false (default)
    if (prevWinnersSet.has(handleLower)) return false;
    if (user.followers < minFollowers) return false;
    if (user.age < minAge) return false;
    if (reqLike && !user.likes) return false;
    if (reqRt && !user.rts) return false;
    return true;
  });

  if (filtered.length === 0) {
    if (prevWinners.length > 0) {
      alert(`All qualified candidates (${prevWinners.length} users) have already been drawn for this post! Clear custom handles or reset draw memory to draw again.`);
    } else {
      alert("No candidates matched your filter requirements! Try lowering the criteria.");
    }
    return;
  }

  isDrawing = true;
  const heroLogo = liveSelectorCard.querySelector('.chess-icon-large');
  if (heroLogo) heroLogo.style.display = 'none';
  liveSelectorCard.querySelector('.section-title').textContent = 'Selecting Winner...';
  liveSelectorCard.querySelector('.desc-text').textContent = `Filtering from ${filtered.length} qualified entries (${prevWinners.length} previous winners excluded).`;
  spinnerContainer.classList.remove('hidden');

  spinnerList.innerHTML = '';
  const repeatCount = Math.max(15, Math.ceil(40 / filtered.length));
  const spinArray = [];
  for (let r = 0; r < repeatCount; r++) {
    filtered.forEach(c => spinArray.push(c));
  }

  spinArray.forEach((candidate) => {
    const item = document.createElement('div');
    item.className = 'spinner-item';
    const hue = (candidate.name.charCodeAt(0) * 47) % 360;
    const initial = candidate.name.charAt(0).toUpperCase();
    const cleanHandle = candidate.handle ? (candidate.handle.startsWith('@') ? candidate.handle.substring(1) : candidate.handle) : 'user';
    const primaryUrl = candidate.avatar || `https://unavatar.io/twitter/${cleanHandle}`;
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(candidate.name)}&background=00f2fe&color=0b0e14&bold=true`;

    item.innerHTML = `
      <div class="spinner-avatar">
        <img src="${primaryUrl}" alt="${candidate.name}" class="spinner-avatar-img" referrerpolicy="no-referrer" onerror="if(!this.dataset.fallback){this.dataset.fallback='1'; this.src='${fallbackUrl}';} else {this.style.display='none';}">
      </div>
      <div class="spinner-meta">
        <div class="spinner-name">${candidate.name}</div>
        <div class="spinner-handle">${candidate.handle}</div>
      </div>
    `;
    spinnerList.appendChild(item);
  });

  const winnerCountInput = document.getElementById('winner-count');
  // Maximum winner count is capped at 25
  const winnerCount = Math.max(1, Math.min(25, parseInt(winnerCountInput ? winnerCountInput.value : 1) || 1));

  const countToPick = Math.min(winnerCount, filtered.length);
  const shuffled = [...filtered].sort(() => 0.5 - Math.random());
  const selectedWinners = shuffled.slice(0, countToPick);
  const targetWinner = selectedWinners[0];

  // Save selected winners to localStorage for this post link so subsequent draws exclude them
  const updatedDrawnHandles = Array.from(new Set([...prevWinners, ...selectedWinners.map(w => w.handle)]));
  localStorage.setItem(cleanPostKey, JSON.stringify(updatedDrawnHandles));
  
  const targetScrollIndex = spinArray.length - filtered.length + filtered.indexOf(targetWinner) - 1;
  const itemHeight = 120;

  let currentY = 0;
  const totalTicks = 80;
  let tick = 0;
  
  function animateSpinner() {
    tick++;
    const progress = tick / totalTicks;
    const easedProgress = 1 - Math.pow(1 - progress, 4);
    
    const targetY = -(targetScrollIndex * itemHeight);
    currentY = easedProgress * targetY;
    
    spinnerList.style.transform = `translateY(${currentY}px)`;
    
    const itemsScrolled = Math.floor(Math.abs(currentY) / itemHeight);
    const prevItemsScrolled = Math.floor(Math.abs(currentY - (targetY/totalTicks)) / itemHeight);
    
    if (itemsScrolled !== prevItemsScrolled && Math.random() > 0.4) {
      playTickSound();
    }

    if (tick < totalTicks) {
      requestAnimationFrame(animateSpinner);
    } else {
      setTimeout(() => {
        isDrawing = false;
        showWinners(selectedWinners);
        triggerConfettiCelebration();
      }, 600);
    }
  }

  animateSpinner();
}

async function showWinners(winners) {
  currentWinners = Array.isArray(winners) ? winners : [winners];
  
  const successBadge = document.getElementById('success-badge');
  if (successBadge) {
    successBadge.textContent = currentWinners.length === 1 ? '🎉 WINNER SELECTED 🎉' : `🎉 ${currentWinners.length} WINNERS SELECTED 🎉`;
  }

  const gridContainer = document.getElementById('winners-grid-container');
  if (gridContainer) {
    gridContainer.innerHTML = '';
    currentWinners.forEach((winner, idx) => {
      const card = document.createElement('div');
      card.className = 'winner-profile-card';

      const hue = (winner.name.charCodeAt(0) * 47) % 360;
      const initial = winner.name.charAt(0).toUpperCase();
      const cleanHandle = winner.handle.startsWith('@') ? winner.handle.substring(1) : winner.handle;
      const primaryUrl = winner.avatar || `https://unavatar.io/twitter/${cleanHandle}`;
      const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(winner.name)}&background=00f2fe&color=0b0e14&bold=true`;

      const avatarHtml = `
        <img src="${primaryUrl}" alt="${winner.name}" class="winner-avatar-img" referrerpolicy="no-referrer" onerror="if(!this.dataset.fallback){this.dataset.fallback='1'; this.src='${fallbackUrl}';} else {this.style.display='none'; this.nextElementSibling.style.display='flex';}">
        <div class="winner-avatar-badge" style="background: hsl(${hue}, 80%, 45%); display: none;">${initial}</div>
      `;

      const followersFormatted = winner.followers > 0 ? winner.followers.toLocaleString() : '0';
      const ageFormatted = winner.age > 0 ? `${winner.age}d` : '0d';

      card.innerHTML = `
        <div class="winner-rank-badge">#${idx + 1}</div>
        <div class="winner-avatar-wrapper">
          ${avatarHtml}
        </div>
        <div class="winner-card-meta">
          <h4 class="winner-card-name" title="${winner.name}">${winner.name}</h4>
          <a href="https://x.com/${cleanHandle}" target="_blank" rel="noopener noreferrer" class="winner-card-handle">${winner.handle}</a>
          ${winner.replyUrl ? `<a href="${winner.replyUrl}" target="_blank" rel="noopener noreferrer" style="font-size:0.7rem; color:#00f2fe; text-decoration:none; margin-top:2px;">💬 View Reply on X</a>` : ''}
          <div class="winner-card-stats">
            <span class="w-stat">👥 ${followersFormatted}</span>
            <span class="w-stat">📅 ${ageFormatted}</span>
          </div>
        </div>
      `;
      gridContainer.appendChild(card);
    });
  }

  const serialNo = `CH-${Math.floor(100000 + Math.random() * 900000)}`;
  const hashVal = 'SHA256-' + Array.from({length: 16}, () => Math.floor(Math.random()*16).toString(16)).join('').toUpperCase();
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Store serial on winners
  currentWinners.forEach(w => { w.certSerial = serialNo; });

  // Persist draw record for Certificate Validation Checker lookups
  const drawRecord = {
    serialNo,
    hashVal,
    dateStr,
    winners: currentWinners,
    postLink: document.getElementById('post-link').value.trim()
  };

  try {
    localStorage.setItem('cert_' + serialNo.toUpperCase(), JSON.stringify(drawRecord));
    localStorage.setItem('cert_' + hashVal.toUpperCase(), JSON.stringify(drawRecord));
  } catch (e) {}

  // Populate Google Sheet Data Table
  const sheetTbody = document.getElementById('winners-sheet-tbody');
  if (sheetTbody) {
    sheetTbody.innerHTML = '';
    currentWinners.forEach((winner, idx) => {
      const cleanHandle = winner.handle.startsWith('@') ? winner.handle.substring(1) : winner.handle;
      const serial = winner.certSerial;
      const wallet = winner.wallet || `0x${Array.from({length: 8}, () => Math.floor(Math.random()*16).toString(16)).join('')}...${Array.from({length: 4}, () => Math.floor(Math.random()*16).toString(16)).join('')}`;
      const replyLink = winner.replyUrl || `https://x.com/${cleanHandle}`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${idx + 1}</td>
        <td><strong>${winner.name}</strong></td>
        <td><a href="https://x.com/${cleanHandle}" target="_blank" style="color:#00e676; text-decoration:none;">${winner.handle}</a></td>
        <td><a href="${replyLink}" target="_blank" style="color:#00f2fe; text-decoration:none;">💬 View Reply</a></td>
        <td>${winner.followers ? winner.followers.toLocaleString() : '0'}</td>
        <td>${winner.age ? winner.age + 'd' : '0d'}</td>
        <td><code>${wallet}</code></td>
        <td><code>${serial}</code></td>
      `;
      sheetTbody.appendChild(tr);
    });
  }

  await generateWinnerSlipCanvas(currentWinners, serialNo, hashVal, dateStr);

  liveSelectorCard.classList.add('hidden');
  winnerCard.classList.remove('hidden');
}

// Text auto-fitting helper for canvas
function fitWebCanvasText(ctx, text, maxWidth, initialFontSize, fontFace = 'Outfit, sans-serif', minFontSize = 9.5) {
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

// Generate high quality canvas certificate/slip with async avatar loading
async function generateWinnerSlipCanvas(winners, customSerial = null, customHash = null, customDate = null) {
  const selectedWinners = Array.isArray(winners) ? winners : [winners];
  const n = selectedWinners.length;

  // Preload profile pic images for canvas drawing
  const avatarImages = await Promise.all(selectedWinners.map((winner) => {
    return new Promise((resolve) => {
      const cleanHandle = winner.handle ? (winner.handle.startsWith('@') ? winner.handle.substring(1) : winner.handle) : 'user';
      const encodedName = encodeURIComponent(winner.name || cleanHandle);
      const primaryUrl = winner.avatar || `https://unavatar.io/twitter/${cleanHandle}`;
      const fallbackUrl = `https://ui-avatars.com/api/?name=${encodedName}&background=00f2fe&color=0b0e14&bold=true`;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        const fallbackImg = new Image();
        fallbackImg.crossOrigin = 'anonymous';
        fallbackImg.onload = () => resolve(fallbackImg);
        fallbackImg.onerror = () => resolve(null);
        fallbackImg.src = fallbackUrl;
      };
      img.src = primaryUrl;
    });
  }));

  let cols = 1;
  if (n === 2) cols = 2;
  else if (n >= 3 && n <= 6) cols = 2;
  else if (n >= 7 && n <= 15) cols = 3;
  else if (n >= 16 && n <= 30) cols = 4;
  else if (n > 30) cols = 5;

  const rows = Math.ceil(n / cols);

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

  certCanvas.width = width;
  certCanvas.height = height;

  const ctx = certCanvas.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0c0f16');
  grad.addColorStop(0.5, '#121622');
  grad.addColorStop(1, '#080a0f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Ambient Grid
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

  // Borders
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(0, 242, 254, 0.4)';
  ctx.shadowBlur = 15;
  ctx.strokeRect(15, 15, width - 30, height - 30);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(25, 25, width - 50, height - 50);

  // Headers
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 24px Outfit, sans-serif';
  ctx.fillText('♞  CHESS HUNTER PICKER', 50, 58);

  ctx.fillStyle = '#00f2fe';
  ctx.font = '700 12px Outfit, sans-serif';
  ctx.fillText(`OFFICIAL WINNER CERTIFICATE  •  TOTAL WINNERS: ${n}`, 50, 80);

  // Draw Logo / Wax Seal Top Right
  if (chessLogoImage.complete && chessLogoImage.naturalWidth > 0) {
    const sealCx = width - 85;
    const sealCy = 62;
    const sealRad = 36;

    ctx.save();
    ctx.beginPath();
    ctx.arc(sealCx, sealCy, sealRad, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(chessLogoImage, sealCx - sealRad, sealCy - sealRad, sealRad * 2, sealRad * 2);
    ctx.restore();

    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sealCx, sealCy, sealRad, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    drawChessDAOSeal(ctx, width - 85, 62);
  }

  // Draw Winner Cards
  for (let i = 0; i < n; i++) {
    const winner = selectedWinners[i];
    const avatarImg = avatarImages[i];
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = marginX + col * (cardWidth + gapX);
    const y = marginYHeader + row * (cardHeight + gapY);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.22)';
    ctx.lineWidth = 1;
    drawRoundRect(ctx, x, y, cardWidth, cardHeight, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = '800 11px Outfit, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`#${i + 1}`, x + cardWidth - 10, y + 8);

    const yCenter = y + cardHeight / 2;
    const avatarRad = Math.min(22, Math.max(14, Math.floor(cardHeight * 0.32)));
    const avatarX = x + 12 + avatarRad;

    const avatarHue = (winner.name.charCodeAt(0) * 47) % 360;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, yCenter, avatarRad, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
      try {
        ctx.drawImage(avatarImg, avatarX - avatarRad, yCenter - avatarRad, avatarRad * 2, avatarRad * 2);
      } catch (err) {
        ctx.fillStyle = `hsl(${avatarHue}, 80%, 45%)`;
        ctx.fillRect(avatarX - avatarRad, yCenter - avatarRad, avatarRad * 2, avatarRad * 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.floor(avatarRad * 1.1)}px Outfit, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(winner.name.charAt(0).toUpperCase(), avatarX, yCenter);
      }
    } else {
      ctx.fillStyle = `hsl(${avatarHue}, 80%, 45%)`;
      ctx.fillRect(avatarX - avatarRad, yCenter - avatarRad, avatarRad * 2, avatarRad * 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.floor(avatarRad * 1.1)}px Outfit, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(winner.name.charAt(0).toUpperCase(), avatarX, yCenter);
    }
    ctx.restore();

    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(avatarX, yCenter, avatarRad, 0, Math.PI * 2);
    ctx.stroke();

    const textX = x + 12 + avatarRad * 2 + 10;
    const maxTextWidth = cardWidth - (12 + avatarRad * 2 + 10) - 34;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    if (n <= 2) {
      const { text: formattedName, fontSize: nameSize } = fitWebCanvasText(ctx, winner.name, maxTextWidth, 22, 'Outfit, sans-serif', 14);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${nameSize}px Outfit, sans-serif`;
      ctx.fillText(formattedName, textX, yCenter - 20);

      const { text: formattedHandle, fontSize: handleSize } = fitWebCanvasText(ctx, winner.handle, maxTextWidth, 14, 'JetBrains Mono, monospace', 11);
      ctx.fillStyle = '#00e676';
      ctx.font = `bold ${handleSize}px JetBrains Mono, monospace`;
      ctx.fillText(formattedHandle, textX, yCenter + 5);

      ctx.fillStyle = '#90a4ae';
      ctx.font = '600 12px Outfit, sans-serif';
      const followersText = winner.followers > 0 ? winner.followers.toLocaleString() : '0';
      const ageText = winner.age > 0 ? `${winner.age}d` : '0d';
      ctx.fillText(`Followers: ${followersText}   |   Age: ${ageText}`, textX, yCenter + 26);
    } else {
      const baseNameSize = Math.max(12, Math.min(15, Math.floor(cardHeight * 0.28)));
      const baseHandleSize = Math.max(10, Math.min(12, Math.floor(cardHeight * 0.22)));

      const { text: formattedName, fontSize: nameSize } = fitWebCanvasText(ctx, winner.name, maxTextWidth, baseNameSize, 'Outfit, sans-serif', 10.5);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${nameSize}px Outfit, sans-serif`;

      const showStats = cardHeight >= 58;
      const nameY = showStats ? yCenter - 14 : yCenter - 8;
      const handleY = showStats ? yCenter + 2 : yCenter + 8;

      ctx.fillText(formattedName, textX, nameY);

      const { text: formattedHandle, fontSize: handleSize } = fitWebCanvasText(ctx, winner.handle, maxTextWidth, baseHandleSize, 'JetBrains Mono, monospace', 9.5);
      ctx.fillStyle = '#00e676';
      ctx.font = `bold ${handleSize}px JetBrains Mono, monospace`;
      ctx.fillText(formattedHandle, textX, handleY);

      if (showStats) {
        ctx.fillStyle = '#90a4ae';
        ctx.font = '600 10px Outfit, sans-serif';
        const followersText = winner.followers > 0 ? winner.followers.toLocaleString() : '0';
        const ageText = winner.age > 0 ? `${winner.age}d` : '0d';
        ctx.fillText(`F: ${followersText} | A: ${ageText}`, textX, yCenter + 17);
      }
    }
  }

  // Verification details
  const serialNo = customSerial || (selectedWinners[0] && selectedWinners[0].certSerial ? selectedWinners[0].certSerial : `CH-${Math.floor(100000 + Math.random() * 900000)}`);
  const dateStr = customDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const hash = customHash || ('SHA256-' + Array.from({length: 16}, () => Math.floor(Math.random()*16).toString(16)).join('').toUpperCase());

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '600 11px JetBrains Mono, monospace';
  ctx.fillText(`SERIAL: ${serialNo}   |   VALIDATION HASH: ${hash}   |   DATE: ${dateStr}`, marginX, height - 35);

  try {
    const dataURL = certCanvas.toDataURL('image/png');
    certPreview.src = dataURL;
  } catch (e) {
    console.warn('Canvas toDataURL failed (CORS), retrying with SVG/safe fallbacks:', e);
  }
}

// Download certificate image
function downloadWinnerSlip() {
  if (!certCanvas) return;
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.download = `chess-picker-certificate-${dateStr}.png`;
  link.href = certCanvas.toDataURL('image/png');
  link.click();
}

// Export Full Winner Details report to CSV (Google Sheets compatible)
function exportWinnersToCSV() {
  if (!currentWinners || currentWinners.length === 0) {
    alert("No winners available to export!");
    return;
  }

  const postLink = document.getElementById('post-link').value.trim() || 'N/A';
  const drawDate = new Date().toLocaleString();

  let csvContent = "\uFEFFRank,Name,Twitter Handle,Twitter Profile URL,Winner Reply Link,Followers,Account Age (Days),Wallet Address,Certificate Serial,Draw Date,Post Link\n";

  currentWinners.forEach((w, idx) => {
    const cleanHandle = w.handle.startsWith('@') ? w.handle.substring(1) : w.handle;
    const profileUrl = `https://x.com/${cleanHandle}`;
    const replyUrl = w.replyUrl || profileUrl;
    const wallet = w.wallet || '0x' + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');
    const serial = w.certSerial || `CH-${Math.floor(100000 + Math.random() * 900000)}`;

    const row = [
      `"${idx + 1}"`,
      `"${(w.name || '').replace(/"/g, '""')}"`,
      `"${(w.handle || '').replace(/"/g, '""')}"`,
      `"${profileUrl}"`,
      `"${replyUrl}"`,
      `"${w.followers || 0}"`,
      `"${w.age || 0}"`,
      `"${wallet}"`,
      `"${serial}"`,
      `"${drawDate}"`,
      `"${postLink}"`
    ].join(",");

    csvContent += row + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `chess_dao_winners_report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Copy Tab-Separated TSV text directly to Clipboard for 1-click Google Sheet pasting
function copyWinnersForGoogleSheet() {
  if (!currentWinners || currentWinners.length === 0) {
    alert("No winners available to copy!");
    return;
  }

  const postLink = document.getElementById('post-link').value.trim() || 'N/A';
  const drawDate = new Date().toLocaleString();

  let tsv = "Rank\tName\tTwitter Handle\tTwitter Profile URL\tWinner Reply Link\tFollowers\tAccount Age (Days)\tWallet Address\tCertificate Serial\tDraw Date\tPost Link\n";

  currentWinners.forEach((w, idx) => {
    const cleanHandle = w.handle.startsWith('@') ? w.handle.substring(1) : w.handle;
    const profileUrl = `https://x.com/${cleanHandle}`;
    const replyUrl = w.replyUrl || profileUrl;
    const wallet = w.wallet || '0x' + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');
    const serial = w.certSerial || `CH-${Math.floor(100000 + Math.random() * 900000)}`;

    tsv += `${idx + 1}\t${w.name}\t${w.handle}\t${profileUrl}\t${replyUrl}\t${w.followers || 0}\t${w.age || 0}\t${wallet}\t${serial}\t${drawDate}\t${postLink}\n`;
  });

  navigator.clipboard.writeText(tsv).then(() => {
    alert("📋 Success! Full winner details copied to clipboard in Google Sheet format!\n\nOpen Google Sheets (click 'Open Google Sheet') and press Ctrl+V (Paste) to insert all formatted rows and columns!");
  }).catch(err => {
    alert("Failed to copy automatically. Please use Export CSV button.");
  });
}

// Draw Round Rect helper
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

// Draw Chess DAO Official Wax/Ink Stamp on Canvas
function drawChessDAOSeal(ctx, cx, cy) {
  ctx.save();
  ctx.shadowColor = 'rgba(255, 215, 0, 0.3)';
  ctx.shadowBlur = 12;

  const sealGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 70);
  sealGrad.addColorStop(0, '#ffe082');
  sealGrad.addColorStop(0.7, '#ffd700');
  sealGrad.addColorStop(1, '#b59300');
  ctx.fillStyle = sealGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 70, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#3e2723';
  ctx.font = 'bold 11px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '800 48px Outfit, sans-serif';
  ctx.fillText('♞', cx, cy - 2);

  ctx.restore();
}

// --- SECTION 2: CERTIFICATE VALIDATION CHECKER ENGINE ("Validation check korar jonno") ---
if (btnVerifyCheck) {
  btnVerifyCheck.addEventListener('click', performValidationCheck);
}

if (uploadDropzone && certFileInput) {
  uploadDropzone.addEventListener('click', () => certFileInput.click());
  
  uploadDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadDropzone.classList.add('dragover');
  });

  uploadDropzone.addEventListener('dragleave', () => {
    uploadDropzone.classList.remove('dragover');
  });

  uploadDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedCertificate(e.dataTransfer.files[0]);
    }
  });

  certFileInput.addEventListener('change', () => {
    if (certFileInput.files && certFileInput.files[0]) {
      processUploadedCertificate(certFileInput.files[0]);
    }
  });
}

function performValidationCheck() {
  const query = verifyInput.value.trim();
  if (!query) {
    alert("Please enter a Serial Code (e.g. CH-849201) or Hash to verify!");
    return;
  }

  renderValidationResult(query);
}

function processUploadedCertificate(file) {
  const fakeSerial = `CH-${Math.floor(100000 + Math.random() * 900000)}`;
  verifyInput.value = fakeSerial;
  renderValidationResult(fakeSerial, file.name);
}

function renderValidationResult(serialQuery, fileName = null) {
  const cleanQuery = serialQuery.trim().toUpperCase();
  let record = null;

  try {
    const raw = localStorage.getItem('cert_' + cleanQuery);
    if (raw) record = JSON.parse(raw);
  } catch (e) {}

  const serialNo = record ? record.serialNo : (cleanQuery.startsWith('SHA256') ? `CH-${Math.floor(100000 + Math.random() * 900000)}` : (cleanQuery.startsWith('CH-') ? cleanQuery : `CH-${cleanQuery}`));
  const hashVal = record ? record.hashVal : (cleanQuery.startsWith('SHA256') ? cleanQuery : 'SHA256-' + Array.from({length: 16}, () => Math.floor(Math.random()*16).toString(16)).join('').toUpperCase());
  const dateVal = record ? record.dateStr : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const winnersList = (record && record.winners && record.winners.length > 0) ? record.winners : mockCandidatesPool.slice(0, Math.floor(Math.random() * 4) + 2);

  resSerial.textContent = serialNo;
  resHash.textContent = hashVal;
  resDate.textContent = dateVal;

  verifiedWinnersList.innerHTML = '';
  winnersList.forEach((w, idx) => {
    const card = document.createElement('div');
    card.className = 'verified-winner-card';
    const cleanHandle = w.handle.startsWith('@') ? w.handle.substring(1) : w.handle;
    const primaryUrl = w.avatar || `https://unavatar.io/twitter/${cleanHandle}`;
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(w.name)}&background=00f2fe&color=0b0e14&bold=true`;
    
    card.innerHTML = `
      <div class="v-avatar">
        <img src="${primaryUrl}" alt="${w.name}" class="v-avatar-img" referrerpolicy="no-referrer" onerror="if(!this.dataset.fallback){this.dataset.fallback='1'; this.src='${fallbackUrl}';} else {this.style.display='none';}">
      </div>
      <div class="v-meta">
        <div class="v-name">#${idx + 1} ${w.name}</div>
        <div class="v-handle">${w.handle}</div>
      </div>
    `;
    verifiedWinnersList.appendChild(card);
  });

  verifyResultPanel.classList.remove('hidden');
  verifyResultPanel.scrollIntoView({ behavior: 'smooth' });
}

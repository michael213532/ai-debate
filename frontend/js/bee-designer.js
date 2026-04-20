// ============================================
// Bee Designer - Avatar Customization System
// ============================================

const BEE_CANVAS_SIZE = 512;
const BASE_BEE_SRC = '/images/bee-icons/default bee icon.png';

// Accessory categories with z-order
const ACCESSORY_CATEGORIES = [
    { id: 'backgrounds', name: 'Backgrounds', icon: '🎨', zOrder: 0 },
    { id: 'hats', name: 'Hats', icon: '🎩', zOrder: 3 },
    { id: 'glasses', name: 'Glasses', icon: '👓', zOrder: 4 },
    { id: 'face', name: 'Face', icon: '😊', zOrder: 2 },
    { id: 'shirts', name: 'Shirts', icon: '👕', zOrder: 1 },
    { id: 'hand_items', name: 'Items', icon: '⚔️', zOrder: 5 },
    { id: 'effects', name: 'Effects', icon: '✨', zOrder: 6 },
];

// Starter accessories (SVG data URIs)
// These are simple colored shapes as placeholders - replace with real PNGs later
const ACCESSORIES = [
    // === BACKGROUNDS ===
    { id: 'bg-blue', name: 'Sky Blue', category: 'backgrounds', keywords: ['sky', 'blue', 'calm'],
      render: (ctx) => { ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE); } },
    { id: 'bg-sunset', name: 'Sunset', category: 'backgrounds', keywords: ['sunset', 'orange', 'warm'],
      render: (ctx) => { const g = ctx.createLinearGradient(0, 0, 0, BEE_CANVAS_SIZE); g.addColorStop(0, '#FF6B6B'); g.addColorStop(0.5, '#FFA07A'); g.addColorStop(1, '#FFD700'); ctx.fillStyle = g; ctx.fillRect(0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE); } },
    { id: 'bg-night', name: 'Night Sky', category: 'backgrounds', keywords: ['night', 'dark', 'stars'],
      render: (ctx) => { const g = ctx.createLinearGradient(0, 0, 0, BEE_CANVAS_SIZE); g.addColorStop(0, '#0C1445'); g.addColorStop(1, '#1a237e'); ctx.fillStyle = g; ctx.fillRect(0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE); for(let i=0;i<30;i++){ctx.fillStyle='rgba(255,255,255,'+(0.5+Math.random()*0.5)+')';ctx.beginPath();ctx.arc(Math.random()*512,Math.random()*512,1+Math.random()*2,0,Math.PI*2);ctx.fill();} } },
    { id: 'bg-forest', name: 'Forest', category: 'backgrounds', keywords: ['green', 'nature', 'forest'],
      render: (ctx) => { const g = ctx.createLinearGradient(0, 0, 0, BEE_CANVAS_SIZE); g.addColorStop(0, '#2d5016'); g.addColorStop(1, '#4a7c23'); ctx.fillStyle = g; ctx.fillRect(0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE); } },
    { id: 'bg-pink', name: 'Bubblegum', category: 'backgrounds', keywords: ['pink', 'cute', 'fun'],
      render: (ctx) => { const g = ctx.createRadialGradient(256,256,50,256,256,300); g.addColorStop(0, '#FFB6C1'); g.addColorStop(1, '#FF69B4'); ctx.fillStyle = g; ctx.fillRect(0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE); } },
    { id: 'bg-purple', name: 'Galaxy', category: 'backgrounds', keywords: ['purple', 'space', 'galaxy'],
      render: (ctx) => { const g = ctx.createRadialGradient(256,256,20,256,256,350); g.addColorStop(0, '#7c3aed'); g.addColorStop(0.5, '#4c1d95'); g.addColorStop(1, '#1e1b4b'); ctx.fillStyle = g; ctx.fillRect(0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE); for(let i=0;i<40;i++){ctx.fillStyle='rgba(255,255,255,'+(0.3+Math.random()*0.7)+')';ctx.beginPath();ctx.arc(Math.random()*512,Math.random()*512,0.5+Math.random()*1.5,0,Math.PI*2);ctx.fill();} } },

    // === HATS === (top of head ~310, 130)
    { id: 'hat-crown', name: 'Crown', category: 'hats', keywords: ['king', 'queen', 'royal', 'leader'],
      render: (ctx) => { const cx=310; ctx.fillStyle='#FFD700'; ctx.beginPath(); ctx.moveTo(cx-60,140); ctx.lineTo(cx-50,90); ctx.lineTo(cx-20,115); ctx.lineTo(cx,75); ctx.lineTo(cx+20,115); ctx.lineTo(cx+50,90); ctx.lineTo(cx+60,140); ctx.closePath(); ctx.fill(); ctx.fillStyle='#DAA520'; ctx.fillRect(cx-60,133,120,14); ctx.fillStyle='#FF0000'; ctx.beginPath(); ctx.arc(cx-22,138,5,0,Math.PI*2); ctx.arc(cx,138,5,0,Math.PI*2); ctx.arc(cx+22,138,5,0,Math.PI*2); ctx.fill(); } },
    { id: 'hat-tophat', name: 'Top Hat', category: 'hats', keywords: ['fancy', 'gentleman', 'classy'],
      render: (ctx) => { const cx=310; ctx.fillStyle='#1a1a2e'; ctx.fillRect(cx-38,75,76,62); ctx.fillRect(cx-52,133,104,13); ctx.fillStyle='#c0392b'; ctx.fillRect(cx-38,121,76,11); } },
    { id: 'hat-beanie', name: 'Beanie', category: 'hats', keywords: ['casual', 'winter', 'cool', 'chill'],
      render: (ctx) => { const cx=310; ctx.fillStyle='#e74c3c'; ctx.beginPath(); ctx.ellipse(cx,140,60,40,0,Math.PI,0); ctx.fill(); ctx.fillStyle='#c0392b'; ctx.fillRect(cx-60,135,120,13); ctx.fillStyle='#e74c3c'; ctx.beginPath(); ctx.arc(cx,100,9,0,Math.PI*2); ctx.fill(); } },
    { id: 'hat-cap', name: 'Baseball Cap', category: 'hats', keywords: ['sports', 'casual', 'baseball'],
      render: (ctx) => { const cx=310; ctx.fillStyle='#3498db'; ctx.beginPath(); ctx.ellipse(cx,145,58,30,0,Math.PI,0); ctx.fill(); ctx.fillStyle='#2980b9'; ctx.beginPath(); ctx.ellipse(cx+50,148,42,10,-0.3,0,Math.PI*2); ctx.fill(); } },
    { id: 'hat-chef', name: 'Chef Hat', category: 'hats', keywords: ['cooking', 'food', 'chef'],
      render: (ctx) => { const cx=310; ctx.fillStyle='#FFF'; ctx.beginPath(); ctx.arc(cx-20,100,24,0,Math.PI*2); ctx.arc(cx+5,90,28,0,Math.PI*2); ctx.arc(cx+28,100,24,0,Math.PI*2); ctx.fill(); ctx.fillRect(cx-30,112,72,24); ctx.strokeStyle='#ddd'; ctx.lineWidth=2; ctx.strokeRect(cx-30,112,72,24); } },
    { id: 'hat-party', name: 'Party Hat', category: 'hats', keywords: ['party', 'celebration', 'birthday', 'fun'],
      render: (ctx) => { const cx=310; const g=ctx.createLinearGradient(cx-30,145,cx+30,70); g.addColorStop(0,'#e74c3c'); g.addColorStop(0.33,'#f1c40f'); g.addColorStop(0.66,'#2ecc71'); g.addColorStop(1,'#3498db'); ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(cx-30,145); ctx.lineTo(cx,65); ctx.lineTo(cx+30,145); ctx.closePath(); ctx.fill(); ctx.fillStyle='#f1c40f'; ctx.beginPath(); ctx.arc(cx,65,6,0,Math.PI*2); ctx.fill(); } },

    // === GLASSES === (eyes ~300,190 and ~335,190)
    { id: 'glasses-round', name: 'Round Glasses', category: 'glasses', keywords: ['smart', 'nerd', 'intellectual'],
      render: (ctx) => { ctx.strokeStyle='#333'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(295,192,20,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.arc(338,192,20,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(315,192); ctx.lineTo(318,192); ctx.stroke(); } },
    { id: 'glasses-sunglasses', name: 'Sunglasses', category: 'glasses', keywords: ['cool', 'sunny', 'swag'],
      render: (ctx) => { ctx.fillStyle='#1a1a2e'; ctx.beginPath(); ctx.roundRect(272,178,46,28,6); ctx.fill(); ctx.beginPath(); ctx.roundRect(324,178,46,28,6); ctx.fill(); ctx.strokeStyle='#1a1a2e'; ctx.lineWidth=3.5; ctx.beginPath(); ctx.moveTo(318,191); ctx.lineTo(324,191); ctx.stroke(); ctx.beginPath(); ctx.moveTo(272,191); ctx.lineTo(260,187); ctx.stroke(); ctx.beginPath(); ctx.moveTo(370,191); ctx.lineTo(382,187); ctx.stroke(); } },
    { id: 'glasses-star', name: 'Star Glasses', category: 'glasses', keywords: ['star', 'celebrity', 'famous', 'fun'],
      render: (ctx) => { ctx.fillStyle='#f1c40f'; function star(cx,cy,r){ctx.beginPath();for(let i=0;i<5;i++){ctx.lineTo(cx+r*Math.cos((i*72-90)*Math.PI/180),cy+r*Math.sin((i*72-90)*Math.PI/180));ctx.lineTo(cx+r*0.4*Math.cos((i*72+36-90)*Math.PI/180),cy+r*0.4*Math.sin((i*72+36-90)*Math.PI/180));}ctx.closePath();ctx.fill();} star(295,192,22); star(338,192,22); ctx.strokeStyle='#e67e22'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(315,192); ctx.lineTo(320,192); ctx.stroke(); } },
    { id: 'glasses-monocle', name: 'Monocle', category: 'glasses', keywords: ['fancy', 'distinguished', 'classy'],
      render: (ctx) => { ctx.strokeStyle='#DAA520'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(338,192,20,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(338,212); ctx.lineTo(330,275); ctx.stroke(); } },

    // === FACE === (cheeks ~285,205 and ~345,200)
    { id: 'face-blush', name: 'Blush', category: 'face', keywords: ['cute', 'shy', 'sweet'],
      render: (ctx) => { ctx.fillStyle='rgba(255,105,180,0.4)'; ctx.beginPath(); ctx.ellipse(282,207,15,10,0,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(345,203,15,10,0,0,Math.PI*2); ctx.fill(); } },
    { id: 'face-scar', name: 'Battle Scar', category: 'face', keywords: ['tough', 'warrior', 'fighter'],
      render: (ctx) => { ctx.strokeStyle='#8B0000'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(340,180); ctx.lineTo(352,210); ctx.stroke(); ctx.strokeStyle='#B22222'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(343,190); ctx.lineTo(350,190); ctx.stroke(); ctx.beginPath(); ctx.moveTo(346,200); ctx.lineTo(352,200); ctx.stroke(); } },
    { id: 'face-freckles', name: 'Freckles', category: 'face', keywords: ['cute', 'natural', 'friendly'],
      render: (ctx) => { ctx.fillStyle='#CD853F'; [[283,200],[290,207],[278,212],[343,197],[336,204],[348,208]].forEach(([x,y])=>{ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fill();}); } },

    // === SHIRTS === (body/neck ~290,260)
    { id: 'shirt-bowtie', name: 'Bow Tie', category: 'shirts', keywords: ['fancy', 'formal', 'gentleman'],
      render: (ctx) => { const cx=290,cy=268; ctx.fillStyle='#e74c3c'; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx-20,cy-12); ctx.lineTo(cx-20,cy+12); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+20,cy-12); ctx.lineTo(cx+20,cy+12); ctx.closePath(); ctx.fill(); ctx.fillStyle='#c0392b'; ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fill(); } },
    { id: 'shirt-tie', name: 'Necktie', category: 'shirts', keywords: ['business', 'formal', 'work', 'professional'],
      render: (ctx) => { const cx=285; ctx.fillStyle='#2c3e50'; ctx.beginPath(); ctx.moveTo(cx-7,262); ctx.lineTo(cx+7,262); ctx.lineTo(cx+10,272); ctx.lineTo(cx,340); ctx.lineTo(cx-10,272); ctx.closePath(); ctx.fill(); ctx.fillStyle='#34495e'; ctx.beginPath(); ctx.moveTo(cx-8,262); ctx.lineTo(cx+8,262); ctx.lineTo(cx+6,272); ctx.lineTo(cx-6,272); ctx.closePath(); ctx.fill(); } },
    { id: 'shirt-scarf', name: 'Scarf', category: 'shirts', keywords: ['winter', 'cozy', 'warm'],
      render: (ctx) => { const cx=290; ctx.fillStyle='#e74c3c'; ctx.beginPath(); ctx.ellipse(cx,268,52,15,0,0,Math.PI*2); ctx.fill(); ctx.fillRect(cx+10,268,16,50); ctx.fillStyle='#27ae60'; for(let y=0;y<4;y++) ctx.fillRect(cx+10,268+y*13,16,6); } },
    { id: 'shirt-medal', name: 'Medal', category: 'shirts', keywords: ['winner', 'champion', 'award'],
      render: (ctx) => { const cx=280; ctx.fillStyle='#3498db'; ctx.beginPath(); ctx.moveTo(cx-10,275); ctx.lineTo(cx,310); ctx.lineTo(cx+10,275); ctx.closePath(); ctx.fill(); ctx.fillStyle='#FFD700'; ctx.beginPath(); ctx.arc(cx,318,14,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#DAA520'; ctx.beginPath(); ctx.arc(cx,318,9,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#FFD700'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center'; ctx.fillText('★',cx,322); } },

    // === HAND ITEMS === (right hand ~365,280)
    { id: 'item-sword', name: 'Sword', category: 'hand_items', keywords: ['warrior', 'fighter', 'knight', 'battle'],
      render: (ctx) => { ctx.save(); ctx.translate(370,270); ctx.rotate(0.5); ctx.fillStyle='#C0C0C0'; ctx.fillRect(-3,-50,7,70); ctx.fillStyle='#8B4513'; ctx.fillRect(-9,18,18,8); ctx.fillStyle='#FFD700'; ctx.beginPath(); ctx.arc(0,22,4,0,Math.PI*2); ctx.fill(); ctx.restore(); } },
    { id: 'item-wand', name: 'Magic Wand', category: 'hand_items', keywords: ['magic', 'wizard', 'spell', 'fantasy'],
      render: (ctx) => { ctx.save(); ctx.translate(368,275); ctx.rotate(0.4); ctx.fillStyle='#4a2c0a'; ctx.fillRect(-3,-6,6,55); ctx.fillStyle='#f1c40f'; function star(cx,cy,r){ctx.beginPath();for(let i=0;i<5;i++){ctx.lineTo(cx+r*Math.cos((i*72-90)*Math.PI/180),cy+r*Math.sin((i*72-90)*Math.PI/180));ctx.lineTo(cx+r*0.4*Math.cos((i*72+36-90)*Math.PI/180),cy+r*0.4*Math.sin((i*72+36-90)*Math.PI/180));}ctx.closePath();ctx.fill();} star(0,-12,11); ctx.restore(); } },
    { id: 'item-coffee', name: 'Coffee', category: 'hand_items', keywords: ['coffee', 'morning', 'coder', 'work'],
      render: (ctx) => { ctx.fillStyle='#8B4513'; ctx.beginPath(); ctx.roundRect(358,285,28,32,4); ctx.fill(); ctx.fillStyle='#D2691E'; ctx.fillRect(361,289,22,7); ctx.strokeStyle='#8B4513'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(390,298,7,-Math.PI/2,Math.PI/2); ctx.stroke(); } },
    { id: 'item-mic', name: 'Microphone', category: 'hand_items', keywords: ['singer', 'music', 'performer', 'karaoke'],
      render: (ctx) => { ctx.fillStyle='#555'; ctx.fillRect(368,280,6,40); ctx.fillStyle='#888'; ctx.beginPath(); ctx.arc(371,276,12,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#666'; ctx.lineWidth=1; for(let y=266;y<286;y+=3){ctx.beginPath();ctx.moveTo(361,y);ctx.lineTo(381,y);ctx.stroke();} } },

    // === EFFECTS ===
    { id: 'effect-sparkles', name: 'Sparkles', category: 'effects', keywords: ['magic', 'special', 'shiny', 'star'],
      render: (ctx) => { ctx.fillStyle = '#FFD700'; function star(cx,cy,r){ctx.beginPath();for(let i=0;i<4;i++){ctx.lineTo(cx+r*Math.cos((i*90)*Math.PI/180),cy+r*Math.sin((i*90)*Math.PI/180));ctx.lineTo(cx+r*0.3*Math.cos((i*90+45)*Math.PI/180),cy+r*0.3*Math.sin((i*90+45)*Math.PI/180));}ctx.closePath();ctx.fill();} star(120, 120, 15); star(380, 100, 12); star(100, 350, 10); star(400, 340, 14); star(150, 430, 8); star(370, 440, 11); } },
    { id: 'effect-hearts', name: 'Hearts', category: 'effects', keywords: ['love', 'cute', 'romance', 'sweet'],
      render: (ctx) => { ctx.fillStyle = '#FF69B4'; function heart(cx,cy,s){ctx.beginPath();ctx.moveTo(cx,cy+s*0.3);ctx.bezierCurveTo(cx-s,cy-s*0.5,cx-s*0.5,cy-s,cx,cy-s*0.4);ctx.bezierCurveTo(cx+s*0.5,cy-s,cx+s,cy-s*0.5,cx,cy+s*0.3);ctx.fill();} heart(130,130,18); heart(380,120,14); heart(110,380,12); heart(390,370,16); } },
    { id: 'effect-fire', name: 'Fire Aura', category: 'effects', keywords: ['fire', 'hot', 'angry', 'intense'],
      render: (ctx) => { ctx.fillStyle = 'rgba(255, 100, 0, 0.15)'; ctx.beginPath(); ctx.arc(256, 256, 220, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'rgba(255, 50, 0, 0.1)'; ctx.beginPath(); ctx.arc(256, 256, 240, 0, Math.PI*2); ctx.fill(); } },
    { id: 'effect-music', name: 'Music Notes', category: 'effects', keywords: ['music', 'song', 'musician', 'dj'],
      render: (ctx) => { ctx.fillStyle = '#333'; ctx.font = '28px serif'; ctx.fillText('♪', 120, 150); ctx.fillText('♫', 370, 130); ctx.fillText('♪', 100, 380); ctx.font = '22px serif'; ctx.fillText('♫', 390, 400); ctx.fillText('♪', 150, 450); } },
];

// State
let designerEquipped = {}; // { category: [accessoryId, ...], max 2 per category }
let designerCanvas = null;
let designerCtx = null;
let baseBeeImage = null;

function initBeeDesigner() {
    const modal = document.getElementById('bee-designer-modal');
    if (!modal) return;

    designerEquipped = {};
    renderDesignerUI();
    loadBaseBee();
}

function loadBaseBee() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        // Remove white background by making white pixels transparent
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = BEE_CANVAS_SIZE;
        tempCanvas.height = BEE_CANVAS_SIZE;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE);
        const imageData = tempCtx.getImageData(0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            // Make near-white pixels transparent (threshold 240)
            if (r > 240 && g > 240 && b > 240) {
                data[i+3] = 0; // Set alpha to 0
            }
        }
        tempCtx.putImageData(imageData, 0, 0);

        // Store as processed image
        baseBeeImage = new Image();
        baseBeeImage.onload = () => renderBeePreview();
        baseBeeImage.src = tempCanvas.toDataURL();
    };
    img.src = BASE_BEE_SRC;
}

function renderDesignerUI() {
    const modal = document.getElementById('bee-designer-modal');
    const activeTab = modal.dataset.activeTab || 'hats';

    const tabsHtml = ACCESSORY_CATEGORIES.map(cat =>
        `<button class="designer-tab ${activeTab === cat.id ? 'active' : ''}" onclick="switchDesignerTab('${cat.id}')">${cat.icon} ${cat.name}</button>`
    ).join('');

    const items = ACCESSORIES.filter(a => a.category === activeTab);
    const itemsHtml = items.map(acc => {
        const isEquipped = (designerEquipped[acc.category] || []).includes(acc.id);
        return `<div class="designer-item ${isEquipped ? 'equipped' : ''}" onclick="toggleAccessory('${acc.id}')">
            <canvas class="designer-item-preview" width="64" height="64" data-acc-id="${acc.id}"></canvas>
            <span class="designer-item-name">${acc.name}</span>
        </div>`;
    }).join('');

    modal.innerHTML = `
        <div class="designer-content">
            <div class="designer-header">
                <span class="designer-title">Bee Designer</span>
                <button class="hive-creator-close" onclick="closeBeeDesigner()">&times;</button>
            </div>
            <div class="designer-body">
                <div class="designer-preview-area">
                    <canvas id="designer-canvas" width="${BEE_CANVAS_SIZE}" height="${BEE_CANVAS_SIZE}"></canvas>
                </div>
                <div class="designer-controls">
                    <div class="designer-tabs">${tabsHtml}</div>
                    <div class="designer-items-grid">${itemsHtml}</div>
                </div>
            </div>
            <div class="designer-footer">
                <button class="btn btn-secondary" onclick="resetDesigner()">Reset</button>
                <button class="btn btn-primary" onclick="saveBeeDesign()">Save Design</button>
            </div>
        </div>
    `;

    // Init canvas
    designerCanvas = document.getElementById('designer-canvas');
    designerCtx = designerCanvas.getContext('2d');
    renderBeePreview();

    // Render item previews
    setTimeout(() => renderItemPreviews(activeTab), 50);
}

function renderItemPreviews(category) {
    const items = ACCESSORIES.filter(a => a.category === category);
    items.forEach(acc => {
        const canvas = document.querySelector(`.designer-item-preview[data-acc-id="${acc.id}"]`);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 64, 64);
        ctx.save();
        ctx.scale(64 / BEE_CANVAS_SIZE, 64 / BEE_CANVAS_SIZE);
        acc.render(ctx);
        ctx.restore();
    });
}

function renderBeePreview() {
    if (!designerCtx || !designerCanvas) return;
    const ctx = designerCtx;
    ctx.clearRect(0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE);

    // Collect all equipped accessories, sorted by z-order
    const equipped = [];
    for (const [cat, ids] of Object.entries(designerEquipped)) {
        const catDef = ACCESSORY_CATEGORIES.find(c => c.id === cat);
        const zOrder = catDef ? catDef.zOrder : 0;
        ids.forEach(id => {
            const acc = ACCESSORIES.find(a => a.id === id);
            if (acc) equipped.push({ ...acc, zOrder });
        });
    }
    equipped.sort((a, b) => a.zOrder - b.zOrder);

    // Render backgrounds first
    const bgs = equipped.filter(a => a.category === 'backgrounds');
    bgs.forEach(acc => acc.render(ctx));

    // If no background, white
    if (bgs.length === 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE);
    }

    // Render base bee
    if (baseBeeImage && baseBeeImage.complete) {
        ctx.drawImage(baseBeeImage, 0, 0, BEE_CANVAS_SIZE, BEE_CANVAS_SIZE);
    }

    // Render non-background accessories
    // Group by category to handle dual items
    const nonBg = equipped.filter(a => a.category !== 'backgrounds');
    const byCategory = {};
    nonBg.forEach(acc => {
        if (!byCategory[acc.category]) byCategory[acc.category] = [];
        byCategory[acc.category].push(acc);
    });

    // Sort categories by z-order and render
    const sortedCats = Object.entries(byCategory).sort((a, b) => {
        const zA = ACCESSORY_CATEGORIES.find(c => c.id === a[0])?.zOrder || 0;
        const zB = ACCESSORY_CATEGORIES.find(c => c.id === b[0])?.zOrder || 0;
        return zA - zB;
    });

    for (const [cat, items] of sortedCats) {
        if (items.length === 1) {
            // Single item — render centered
            items[0].render(ctx);
        } else if (items.length === 2) {
            // Two items — render side by side, tilted
            ctx.save();
            ctx.translate(BEE_CANVAS_SIZE / 2, BEE_CANVAS_SIZE / 2);
            // Left item: shift left, tilt left
            ctx.save();
            ctx.translate(-35, 0);
            ctx.rotate(-0.2);
            ctx.translate(-BEE_CANVAS_SIZE / 2, -BEE_CANVAS_SIZE / 2);
            items[0].render(ctx);
            ctx.restore();
            // Right item: shift right, tilt right
            ctx.save();
            ctx.translate(35, 0);
            ctx.rotate(0.2);
            ctx.translate(-BEE_CANVAS_SIZE / 2, -BEE_CANVAS_SIZE / 2);
            items[1].render(ctx);
            ctx.restore();
            ctx.restore();
        }
    }
}

function switchDesignerTab(tabId) {
    const modal = document.getElementById('bee-designer-modal');
    modal.dataset.activeTab = tabId;
    renderDesignerUI();
}

function toggleAccessory(accId) {
    const acc = ACCESSORIES.find(a => a.id === accId);
    if (!acc) return;

    if (!designerEquipped[acc.category]) designerEquipped[acc.category] = [];
    const list = designerEquipped[acc.category];
    const idx = list.indexOf(accId);
    const maxItems = acc.category === 'backgrounds' ? 1 : 2;

    if (idx !== -1) {
        // Remove
        list.splice(idx, 1);
    } else {
        // Add (max 1 for backgrounds, 2 for others)
        if (list.length >= maxItems) list.shift();
        list.push(accId);
    }

    renderDesignerUI();
}

function resetDesigner() {
    designerEquipped = {};
    renderDesignerUI();
}

function saveBeeDesign() {
    if (!designerCanvas) return;
    // Get the composite as base64
    const dataUrl = designerCanvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    // Pass back to bee creator
    if (window._beeDesignerCallback) {
        window._beeDesignerCallback(base64);
    }

    closeBeeDesigner();
}

function openBeeDesigner(callback) {
    window._beeDesignerCallback = callback;
    const modal = document.getElementById('bee-designer-modal');
    modal.classList.add('active');
    modal.dataset.activeTab = 'hats';
    designerEquipped = {};
    initBeeDesigner();
}

function closeBeeDesigner() {
    const modal = document.getElementById('bee-designer-modal');
    modal.classList.remove('active');
    modal.innerHTML = '';
    window._beeDesignerCallback = null;
}

// Expose globally
window.openBeeDesigner = openBeeDesigner;
window.closeBeeDesigner = closeBeeDesigner;
window.switchDesignerTab = switchDesignerTab;
window.toggleAccessory = toggleAccessory;
window.resetDesigner = resetDesigner;
window.saveBeeDesign = saveBeeDesign;

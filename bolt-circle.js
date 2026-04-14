// ============================================================
// G-FLOOR — BOLT CIRCLE ENGINE v2
// ============================================================
const TOOL_TABLE = {
    "0.750": { tool: 8,  sfm: 500, feed: 5 },
    "0.875": { tool: 8,  sfm: 500, feed: 5 },
    "1.000": { tool: 9,  sfm: 500, feed: 4 },
    "1.125": { tool: 10, sfm: 500, feed: 4 },
    "1.250": { tool: 11, sfm: 500, feed: 4 },
    "1.375": { tool: 12, sfm: 500, feed: 4 },
    "1.500": { tool: 13, sfm: 500, feed: 3 },
    "1.625": { tool: 14, sfm: 500, feed: 3 },
    "1.750": { tool: 23, sfm: 500, feed: 3 },
    "2.000": { tool: 24, sfm: 500, feed: 3 },
    "2.125": { tool: 24, sfm: 500, feed: 3 }
};
const DEBURR_MAX_DIA = 1.375;

lucide.createIcons();

const elProgNum       = document.getElementById('progNum');
const elToolNum       = document.getElementById('toolNum');
const elToolBadge     = document.getElementById('toolBadge');
const elBcDia         = document.getElementById('bcDia');
const elHoles         = document.getElementById('holes');
const elHoleDia       = document.getElementById('holeDia');
const elStartAngle    = document.getElementById('startAngle');
const elThickness     = document.getElementById('thickness');
const elClearance     = document.getElementById('clearance');
const elSfm           = document.getElementById('sfm');
const elCalcRpm       = document.getElementById('calcRpm');
const elFeed          = document.getElementById('feed');
const elCenterDrill   = document.getElementById('centerDrill');
const elIncludeDeburr = document.getElementById('includeDeburr');
const elDeburWarn     = document.getElementById('deburr-warning');
const elIncludeW      = document.getElementById('includeW');
const elWAxisRow      = document.getElementById('wAxisRow');
const controlToggle   = document.getElementById('controlToggle');
const outputArea      = document.getElementById('outputArea');
const previewCanvas   = document.getElementById('previewCanvas');
const copyBtn         = document.getElementById('copyBtn');

const persistedInputs = {
    progNum: elProgNum, toolNum: elToolNum, bcDia: elBcDia,
    holes: elHoles, holeDia: elHoleDia, startAngle: elStartAngle,
    thickness: elThickness, clearance: elClearance,
    sfm: elSfm, feed: elFeed,
    centerDrill: elCenterDrill, includeDeburr: elIncludeDeburr,
    includeW: elIncludeW
};

// controlMode is managed by shell (window.controlMode)

function updateWAxisVisibility() {
    // W axis is Fanuc only — hide on Haas to prevent accidental inclusion
    if (window.controlMode === 'Haas') {
        elWAxisRow.style.display = 'none';
        elIncludeW.checked = false;
        localStorage.setItem('gfloor_includeW', false);
    } else {
        elWAxisRow.style.display = 'block';
    }
}

// Shell calls this when the Haas/Fanuc toggle changes
function onControlModeChange() {
    updateWAxisVisibility();
    generate();
}

for (const key in persistedInputs) {
    const saved = localStorage.getItem('gfloor_' + key);
    if (saved === null) continue;
    const el = persistedInputs[key];
    if (el.type === 'checkbox') el.checked = (saved === 'true');
    else el.value = saved;
}

function lookupTool() {
    const dia = parseFloat(elHoleDia.value);
    if (isNaN(dia)) return;
    const key = dia.toFixed(3);
    const entry = TOOL_TABLE[key];
    if (entry) {
        elToolNum.value = entry.tool;
        elToolBadge.textContent = 'AUTO';
        elToolBadge.style.cssText = 'background:rgba(255,107,53,0.2);color:var(--accent);';
        // Only pre-fill SFM if it still looks like a default value
        const sfmNow = parseInt(elSfm.value);
        if (sfmNow === 500 || sfmNow === 400) elSfm.value = entry.sfm;
        elFeed.value = entry.feed;
    } else {
        elToolBadge.textContent = 'UNKNOWN — enter manually';
        elToolBadge.style.cssText = 'background:rgba(255,180,0,0.15);color:#ffb400;';
        if (!elFeed.value) elFeed.value = '3';
    }
    updateDeburWarning();
    calcRpm();
}

function calcRpm() {
    const sfm = parseFloat(elSfm.value);
    const dia = parseFloat(elHoleDia.value);
    if (isNaN(sfm) || isNaN(dia) || dia <= 0) { elCalcRpm.value = '---'; return; }
    elCalcRpm.value = Math.round(3.82 * sfm / dia);
}

function updateDeburWarning() {
    const dia = parseFloat(elHoleDia.value);
    if (isNaN(dia)) return;
    if (dia > DEBURR_MAX_DIA) {
        elDeburWarn.textContent = '(' + dia + '" — exceeds 1.375 max)';
        elIncludeDeburr.checked = false;
        elIncludeDeburr.disabled = true;
    } else {
        elDeburWarn.textContent = '';
        elIncludeDeburr.disabled = false;
    }
}

function validateInput(el) {
    if (!el.dataset.validate) return true;
    const val = el.value.trim();
    const type = el.dataset.validate;
    let valid = true;
    if (type === 'numeric') valid = /^\d+$/.test(val);
    else if (type === 'decimal') valid = !isNaN(parseFloat(val)) && /^-?\d*\.?\d+$/.test(val);
    el.classList.toggle('error', !valid);
    return valid;
}

function fmt(num, dec = 4) {
    let s = num.toFixed(dec).replace(/(\.\d*?)0+$/, '$1');
    if (s.slice(-1) === '.') s += '0';
    return s;
}

function fmtProg(val) {
    let n = parseInt(val, 10);
    if (isNaN(n) || n < 0) n = 0;
    return 'O' + n.toString().padStart(4, '0');
}

function holePositions(bcDia, holes, startAngle) {
    const r = bcDia / 2;
    const inc = 360 / holes;
    return Array.from({ length: holes }, (_, i) => {
        const rad = (startAngle + i * inc) * Math.PI / 180;
        return { x: r * Math.cos(rad), y: r * Math.sin(rad), num: i + 1 };
    });
}

// Independent bolt circle position calculator for the preview
// Uses the same trig formula as holePositions() but calculated fresh
// so preview coordinates are never derived from the G-code path —
// they are a separate verification source.
function previewHolePositions(bcDia, holes, startAngle) {
    const r = bcDia / 2;
    const inc = 360 / holes;
    return Array.from({ length: holes }, (_, i) => {
        const deg = startAngle + i * inc;
        const rad = deg * (Math.PI / 180);
        return {
            x: r * Math.cos(rad),   // actual machine X
            y: r * Math.sin(rad),   // actual machine Y
            deg,
            num: i + 1
        };
    });
}

function drawPreview(bcDia, holes, holeDia, startAngle) {
    if (isNaN(bcDia) || isNaN(holes) || isNaN(holeDia) || holes <= 0 || bcDia <= 0) return;

    const pts   = previewHolePositions(bcDia, holes, startAngle);
    const scale = 90 / (bcDia / 2 + holeDia / 2);
    const sr    = (bcDia / 2) * scale;
    const hr    = Math.max((holeDia / 2) * scale, 4);

    let svg = '';

    // Crosshairs
    svg += `<line x1="-110" y1="0" x2="110" y2="0" stroke="var(--border)" stroke-dasharray="4,4" stroke-width="1.5"/>`;
    svg += `<line x1="0" y1="-110" x2="0" y2="110" stroke="var(--border)" stroke-dasharray="4,4" stroke-width="1.5"/>`;

    // Bolt circle reference ring
    svg += `<circle cx="0" cy="0" r="${sr}" stroke="var(--border)" stroke-dasharray="6,4" stroke-width="2" fill="none"/>`;

    for (const pt of pts) {
        const sx  = pt.x * scale;
        const sy  = -pt.y * scale;   // SVG Y is inverted vs machine Y
        const ang = Math.atan2(pt.y, pt.x);

        // Label offset — push outward from center
        const labelR = hr + 14;
        const lx = sx + Math.cos(ang) * labelR;
        const ly = sy - Math.sin(ang) * labelR;

        // Coordinate tooltip — positioned offset from hole, stays within viewBox
        // Flip to inside if hole is near edge
        const tipOffX = (pt.x >= 0) ? (hr + 4) : -(hr + 4);
        const tipAnchor = (pt.x >= 0) ? 'start' : 'end';
        const tipX = sx + tipOffX;
        const tipY = sy - (hr + 6);

        const xStr = fmt(pt.x, 3);
        const yStr = fmt(pt.y, 3);

        // Visible hole — rendered BEFORE hit area so hit area stays on top
        svg += `<circle class="hole-vis" cx="${sx}" cy="${sy}" r="${hr}"
                    fill="rgba(255,107,53,0.15)" stroke="var(--accent)" stroke-width="2"/>`;

        // Center dot
        svg += `<circle cx="${sx}" cy="${sy}" r="1.5" fill="var(--bg-base)"/>`;

        // Hole number label
        svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
                    font-size="11" fill="var(--text-muted)" font-weight="600">${pt.num}</text>`;

        // Hit area rendered LAST so it sits above the visible elements and catches all pointer events
        svg += `<circle class="hole-hit" cx="${sx}" cy="${sy}" r="${Math.max(hr, 18)}"
                    fill="transparent" stroke="none" style="cursor:pointer;"
                    data-hole="${pt.num}" data-x="${xStr}" data-y="${yStr}"
                    data-sx="${sx.toFixed(1)}" data-sy="${sy.toFixed(1)}"/>`;
    }

    // Tooltip group — hidden until a hole is activated
    // Rendered at end of SVG so it always draws on top of everything
    svg += `<g id="coordTip" style="display:none;" pointer-events="none">
                <rect id="tipBg" rx="4" ry="4" fill="#1e2025" stroke="var(--accent)" stroke-width="1.5"/>
                <text id="tipText" font-size="12" font-weight="700" fill="var(--text-main)" dominant-baseline="middle"></text>
            </g>`;

    previewCanvas.innerHTML = svg;

    // Wire up hover (desktop) and touch (tablet) events
    let activeHole = null;

    function showTip(el) {
        const tipG    = previewCanvas.querySelector('#coordTip');
        const tipBg   = previewCanvas.querySelector('#tipBg');
        const tipText = previewCanvas.querySelector('#tipText');
        const x       = el.dataset.x;
        const y       = el.dataset.y;
        const num     = el.dataset.hole;
        const sx      = parseFloat(el.dataset.sx);
        const sy      = parseFloat(el.dataset.sy);

        tipText.textContent = `#${num}   X${x}   Y${y}`;
        tipG.style.display = 'block';

        // Use requestAnimationFrame so Safari/WebKit has rendered the text
        // before we measure it — getBBox() returns 0 on hidden/unrendered elements
        requestAnimationFrame(() => {
            let tw, th;
            try {
                const bbox = tipText.getBBox();
                tw = bbox.width;
                th = bbox.height;
            } catch(e) {
                // Fallback estimate if getBBox fails
                tw = tipText.textContent.length * 7;
                th = 16;
            }

            // Minimum size guard
            if (tw < 10) tw = tipText.textContent.length * 7;
            if (th < 8)  th = 16;

            const pad  = 6;
            tw += pad * 2;
            th += pad * 2;

            // ViewBox is -120 to +120, keep tooltip 12px inside edges
            const vbMax = 108;
            let tx, ty;

            // Horizontal: prefer right, flip left if it clips
            if (sx + hr + tw + 4 <= vbMax) {
                tx = sx + hr + 4;
            } else {
                tx = sx - hr - tw - 4;
            }

            // Vertical: center on hole, clamp to viewBox
            ty = sy - th / 2;
            if (ty < -vbMax)        ty = -vbMax;
            if (ty + th > vbMax)    ty = vbMax - th;

            tipBg.setAttribute('x',      tx);
            tipBg.setAttribute('y',      ty);
            tipBg.setAttribute('width',  tw);
            tipBg.setAttribute('height', th);

            tipText.setAttribute('text-anchor', 'start');
            tipText.setAttribute('x', tx + pad);
            tipText.setAttribute('y', ty + th / 2);

            // Highlight active hole
            previewCanvas.querySelectorAll('.hole-vis').forEach(c => c.setAttribute('stroke-width', '2'));
            const idx = parseInt(num) - 1;
            const vis = previewCanvas.querySelectorAll('.hole-vis')[idx];
            if (vis) vis.setAttribute('stroke-width', '3.5');

            activeHole = el;
        });
    }

    function hideTip() {
        const tipG = previewCanvas.querySelector('#coordTip');
        if (tipG) tipG.style.display = 'none';
        previewCanvas.querySelectorAll('.hole-vis').forEach(c => c.setAttribute('stroke-width', '2'));
        activeHole = null;
    }

    previewCanvas.querySelectorAll('.hole-hit').forEach(el => {
        // Desktop hover
        el.addEventListener('mouseenter', () => showTip(el));
        el.addEventListener('mouseleave', hideTip);

        // Tablet tap — toggle: tap same hole hides, tap new hole shows
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (activeHole === el) { hideTip(); }
            else { showTip(el); }
        }, { passive: false });
    });
}

function generate() {
    let ok = true;
    for (const key in persistedInputs) {
        const el = persistedInputs[key];
        if (el.type !== 'checkbox' && !validateInput(el)) ok = false;
    }
    if (!ok) { outputArea.value = '(ERROR: Fix highlighted inputs above)'; return; }

    const isHaas  = window.controlMode === 'Haas';
    const progNum = fmtProg(elProgNum.value);
    const toolNum = parseInt(elToolNum.value) || 9;
    const tPad    = toolNum.toString().padStart(2, '0');
    const bcDia   = parseFloat(elBcDia.value);
    const holes   = parseInt(elHoles.value);
    const holeDia = parseFloat(elHoleDia.value);
    const angle   = parseFloat(elStartAngle.value) || 0;
    const thick   = parseFloat(elThickness.value);
    const clr     = parseFloat(elClearance.value);
    const rpm     = parseInt(elCalcRpm.value) || 0;
    const feed    = parseFloat(elFeed.value);
    const doCenterDrill = elCenterDrill.checked;
    const doDeburr      = elIncludeDeburr.checked && holeDia <= DEBURR_MAX_DIA;
    const doW           = elIncludeW.checked;

    drawPreview(bcDia, holes, holeDia, angle);

    const drillDepth = fmt(thick + 0.25);
    const strFeed    = (feed % 1 === 0) ? (feed + '.') : feed.toString();
    const strClr     = (clr % 1 === 0) ? (clr + '.') : clr.toString();
    const pts        = holePositions(bcDia, holes, angle);

    const c = [];
    const push  = (...lines) => lines.forEach(l => c.push(l));
    const blank = () => c.push('');

    // HEADER
    push('%', progNum);
    push(`(BOLT CIRCLE - ${holes}X ${fmt(holeDia,3)} ON ${fmt(bcDia,3)} BC)`);
    push(`(MATERIAL THICKNESS: ${fmt(thick,3)})`);
    blank();
    if (doCenterDrill) push(`(T4  - CENTER DRILL)`);
    push(`(T${tPad}  - ${fmt(holeDia,3)} INSERTED DRILL)`);
    if (doDeburr) push(`(T6  - DEBURR TOOL)`);
    blank();

    if (isHaas) {
        const radius = fmt(bcDia / 2, 4);
        const jAng   = fmt(angle, 1);

        if (doCenterDrill) {
            push(`(TURN BLOCK DELETE ON FOR FIRST PART)`);
            blank();
            push(`/GOTO7`);
            blank();
            push(`G00 G90 G57 X0. Y0.`);
            blank();
            push(`(CENTER DRILL)`);
            push(`G00 G90 G57 X0. Y0.`);
            push(`N10 T4 M06`);
            push(`M08`);
            push(`G00 G90 G54 S2500 M03`);
            push(`G43 H04 T${tPad} X0. Y0.`);
            push(`Z${strClr}`);
            push(`G81 G98 Z-0.03 R0.1 F5. L0`);
            push(`G70 I${radius} J${jAng} L${holes}`);
            push(`Z${strClr}`);
            push(`M05`);
            push(`M09`);
            push(`G00 G90 M89`);
            push(`G28 G91 Z0.`);
            push(`G28 G91 Y0.`);
            push(`M01`);
            blank();
            push(`N7`);
            blank();
        }

        push(`G00 G90 G57 X0. Y0.`);
        blank();
        push(`(${fmt(holeDia,3)} INSERTED DRILL)`);
        push(`N20 T${tPad} M06`);
        push(`G00 G90 G54 S${rpm} M03`);
        push(`G43 H${tPad} T${doDeburr ? '06' : '04'} X0. Y0.`);
        push(`Z${strClr}`);
        push(`M31`);
        push(`M88`);
        push(`G81 G98 Z-${drillDepth} R0.1 F${strFeed} L0`);
        push(`G70 I${radius} J${jAng} L${holes}`);
        push(`Z${strClr}`);
        push(`M05`);
        push(`M09`);
        push(`G00 G90 M89`);
        push(`G28 G91 Z0.`);
        push(`G28 G91 Y0.`);
        push(`M01`);
        blank();

        if (doDeburr) {
            // Deburr Z math:
            // Top chamfer:    rapid to Z0.1, feed down to Z-0.5 (breaks top corner)
            // Bottom chamfer: rapid to Z-(thick+0.75), feed up to Z-(thick+0.55)
            const rapBelow = fmt(-(thick + 0.75), 4);
            const feedUp   = fmt(-(thick + 0.55), 4);
            push(`G00 G90 G57 X0. Y0.`);
            blank();
            push(`(${fmt(holeDia,3)} DEBURR TOOL)`);
            push(`N30 T6 M06`);
            push(`G00 G90 G54 S1500 M03`);
            push(`G43 H06 T04 X0. Y0.`);
            push(`Z${strClr}`);
            push(`M08`);
            blank();
            for (const pt of pts) {
                const px = fmt(pt.x, 4), py = fmt(pt.y, 4);
                push(`(HOLE ${pt.num} OF ${holes} - X${px} Y${py})`);
                push(`G00 Z${strClr}`);
                push(`G00 X${px} Y${py}`);
                push(`G00 Z0.1`);
                push(`G01 Z-0.5 F20.`);
                push(`G00 Z${rapBelow}`);
                push(`G01 Z${feedUp} F20.`);
                blank();
            }
            push(`G00 Z${strClr}`);
            push(`M05`);
            push(`M09`);
            push(`G00 G90 M89`);
            push(`G28 G91 Z0.`);
            push(`G28 G91 Y0.`);
            push(`G90`);
            blank();
        }

        push(`M30`);
        push(`%`);

    } else {
        // FANUC
        push(`G28 G91 W0. Z0.`);
        push(`G00 G17 G40 G80 G90 G94`);

        if (doCenterDrill) {
            push(`(.500 CENTER-DRILL)`);
            push(`N1 (STEP) T4 M06`);
            push(`G00 G90 G54 S2200 M03`);
            push(`X${fmt(pts[0].x,4)} Y${fmt(pts[0].y,4)} B0.`);
            push(`G43 H4 Z10. T${tPad}`);
            if (doW) push(`W0.0`);
            push(`Z10.`);
            push(`G98 G81 Z-0.03 R0.1 F3.`);
            // G81 fires at the pre-positioned hole (pts[0]) — start loop at hole 2
            pts.forEach((pt, i) => {
                if (i === 0) return;
                push(`X${fmt(pt.x,4)} Y${fmt(pt.y,4)}`);
            });
            push(`G80`);
            push(`G00`);
            if (doW) push(`W0.0`);
            push(`Z10.`);
            push(`M05`);
            push(`M09`);
            push(`G91 G28 W0. Z0.`);
            push(`M01`);
            blank();
            blank();
            push(`G28 G91 W0. Z0.`);
            push(`G00 G17 G40 G80 G90 G94`);
        }

        const stepNum = doCenterDrill ? 'N2' : 'N1';
        push(`(${fmt(holeDia,3)} INSERTED DRILL)`);
        push(`${stepNum} (STEP) T${tPad} M06`);
        push(`G00 G90 G54 S${rpm} M03`);
        push(`X${fmt(pts[0].x,4)} Y${fmt(pts[0].y,4)} B0.`);
        push(`G43 H${tPad} Z10. T4`);
        push(`M07`);
        if (doW) push(`W0.0`);
        push(`Z10.`);
        push(`G98 G81 Z-${drillDepth} R0.1 F${strFeed}`);
        // G81 fires at the pre-positioned hole (pts[0]) — start loop at hole 2
        pts.forEach((pt, i) => {
            if (i === 0) return;
            push(`X${fmt(pt.x,4)} Y${fmt(pt.y,4)}`);
        });
        push(`G80`);
        push(`G00`);
        if (doW) push(`W0.0`);
        push(`Z10.`);
        push(`M05`);
        push(`M09`);
        push(`G91 G28 W0. Z0.`);
        push(`M30`);
        push(`%`);
    }

    outputArea.value = c.join('\n');
}

function bcCopyToClipboard() {
    outputArea.select();
    document.execCommand('copy');
    const orig = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i data-lucide="check"></i> Copied!';
    copyBtn.style.cssText = 'color:var(--bg-base);background-color:var(--accent);border-color:var(--accent);';
    lucide.createIcons();
    setTimeout(() => { copyBtn.innerHTML = orig; copyBtn.style = ''; lucide.createIcons(); }, 2000);
}

function bcDownloadCode() {
    const content = outputArea.value;
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = fmtProg(elProgNum.value) + '.nc';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Event wiring
elHoleDia.addEventListener('input', () => {
    localStorage.setItem('gfloor_holeDia', elHoleDia.value);
    lookupTool(); generate();
});
elSfm.addEventListener('input', () => {
    localStorage.setItem('gfloor_sfm', elSfm.value);
    calcRpm(); generate();
});
[elProgNum, elToolNum, elBcDia, elHoles, elStartAngle, elThickness, elClearance, elFeed].forEach(el => {
    el.addEventListener('input', () => {
        const key = Object.keys(persistedInputs).find(k => persistedInputs[k] === el);
        if (key) localStorage.setItem('gfloor_' + key, el.value);
        if (validateInput(el)) generate();
    });
});
[elCenterDrill, elIncludeDeburr, elIncludeW].forEach(el => {
    el.addEventListener('change', () => {
        const key = Object.keys(persistedInputs).find(k => persistedInputs[k] === el);
        if (key) localStorage.setItem('gfloor_' + key, el.checked);
        generate();
    });
});

// Boot
lookupTool();
updateWAxisVisibility();
generate();

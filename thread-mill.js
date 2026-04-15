// ============================================================
// G-FLOOR — THREAD MILL ENGINE v1
// Single hole thread mill — UN threads, single point + solid carbide
// ============================================================

// ── THREAD TABLE ────────────────────────────────────────────
// Keys are "majorDia-tpi" matching the select option values
// drillDia   = standard drill diameter
// drillDepth = standard drill depth (LD from chart)
// tpi        = threads per inch
// pitch      = 1/tpi
// toolDia    = thread mill cutter diameter
// tipOffset  = Z tool tip offset
// rpm        = recommended RPM (Fanuc capped at 2500)
// feed       = recommended feed IPM
// type       = 'solid' | 'single'
// maxCut     = solid carbide only — max cutting length
const TM_TABLE = {
    "0.625-11": { drillDia:1.000, drillDepth:1.25, tpi:11, toolDia:0.470, tipOffset:0.050, rpm:2844, feed:3,  type:'solid',  maxCut:1.44 },
    "0.750-10": { drillDia:0.656, drillDepth:1.38, tpi:10, toolDia:0.495, tipOffset:0.050, rpm:2701, feed:3,  type:'solid',  maxCut:1.30 },
    "0.875-9":  { drillDia:0.766, drillDepth:1.56, tpi:9,  toolDia:0.708, tipOffset:0.133, rpm:2700, feed:65, type:'single', maxCut:null },
    "1.000-8":  { drillDia:0.875, drillDepth:1.75, tpi:8,  toolDia:0.787, tipOffset:0.133, rpm:2426, feed:60, type:'single', maxCut:null },
    "1.125-8":  { drillDia:1.000, drillDepth:1.94, tpi:8,  toolDia:0.885, tipOffset:0.185, rpm:2158, feed:65, type:'single', maxCut:null },
    "1.250-8":  { drillDia:1.125, drillDepth:2.06, tpi:8,  toolDia:0.885, tipOffset:0.185, rpm:2158, feed:65, type:'single', maxCut:null },
    "1.375-8":  { drillDia:1.250, drillDepth:2.19, tpi:8,  toolDia:0.885, tipOffset:0.185, rpm:2158, feed:65, type:'single', maxCut:null },
    "1.500-8":  { drillDia:1.375, drillDepth:2.31, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:65, type:'single', maxCut:null },
    "1.625-8":  { drillDia:1.500, drillDepth:2.25, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:65, type:'single', maxCut:null },
    "1.750-8":  { drillDia:1.625, drillDepth:2.38, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:65, type:'single', maxCut:null },
    "1.875-8":  { drillDia:1.750, drillDepth:2.56, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:65, type:'single', maxCut:null },
    "2.000-8":  { drillDia:1.875, drillDepth:2.62, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:65, type:'single', maxCut:null },
    "2.250-8":  { drillDia:2.125, drillDepth:2.88, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:65, type:'single', maxCut:null },
    "2.500-8":  { drillDia:2.375, drillDepth:3.12, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:65, type:'single', maxCut:null },
    "2.750-8":  { drillDia:2.625, drillDepth:3.38, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:65, type:'single', maxCut:null }
};

const SPRING_STOCK    = 0.007;  // finish - rough radial difference
const CHAMFER_Z       = -0.12;  // chamfer always plunges to this depth
const CHAMFER_TIP_R   = 0.175 / 2; // T7 tip radius = 0.0875
const CHAMFER_SMALL   = 0.06;   // chamfer width for threads < 1.5"
const CHAMFER_LARGE   = 0.09;   // chamfer width for threads >= 1.5"
const FANUC_RPM_MAX   = 2500;

// ── DOM REFERENCES ──────────────────────────────────────────
const tmProgNum      = document.getElementById('tm-progNum');
const tmThreadSize   = document.getElementById('tm-threadSize');
const tmToolNum      = document.getElementById('tm-toolNum');
const tmToolDia      = document.getElementById('tm-toolDia');
const tmTipOffset    = document.getElementById('tm-tipOffset');
const tmToolType     = document.getElementById('tm-toolType');
const tmDrillDia     = document.getElementById('tm-drillDia');
const tmDrillDepth   = document.getElementById('tm-drillDepth');
const tmThreadDepth  = document.getElementById('tm-threadDepth');
const tmCutWarn      = document.getElementById('tm-cutLengthWarn');
const tmXPos         = document.getElementById('tm-xPos');
const tmYPos         = document.getElementById('tm-yPos');
const tmRpm          = document.getElementById('tm-rpm');
const tmFeed         = document.getElementById('tm-feed');
const tmCenterDrill  = document.getElementById('tm-centerDrill');
const tmChamfer      = document.getElementById('tm-chamfer');
const tmRampBottom   = document.getElementById('tm-rampBottom');
const tmIncludeW     = document.getElementById('tm-includeW');
const tmWAxisRow     = document.getElementById('tm-wAxisRow');
const tmOutputArea   = document.getElementById('tm-outputArea');
const tmCopyBtn      = document.getElementById('tm-copyBtn');

// ── HELPERS ─────────────────────────────────────────────────
function tmFmt(num, dec) {
    dec = (dec === undefined) ? 4 : dec;
    var s = num.toFixed(dec).replace(/(\.\d*?)0+$/, '$1');
    if (s.slice(-1) === '.') s += '0';
    return s;
}

function tmFmtProg(val) {
    var n = parseInt(val, 10);
    if (isNaN(n) || n < 0) n = 0;
    return 'O' + n.toString().padStart(4, '0');
}

function tmFmtF(val) {
    // Format feed — integer stays as "3.", decimal stays as-is
    return (val % 1 === 0) ? val + '.' : val.toString();
}

function tmValidate(el) {
    if (!el.dataset.validate) return true;
    var val = el.value.trim();
    var valid = true;
    if (el.dataset.validate === 'numeric') valid = /^\d+$/.test(val);
    else if (el.dataset.validate === 'decimal') valid = !isNaN(parseFloat(val)) && /^-?\d*\.?\d+$/.test(val);
    el.classList.toggle('error', !valid);
    return valid;
}

// ── W AXIS VISIBILITY ───────────────────────────────────────
function tmUpdateWAxis() {
    if (window.controlMode === 'Haas') {
        tmWAxisRow.style.display = 'none';
        tmIncludeW.checked = false;
    } else {
        tmWAxisRow.style.display = 'block';
    }
}

// ── THREAD SIZE LOOKUP ──────────────────────────────────────
function tmLookup() {
    var key = tmThreadSize.value;
    if (!key) return;
    var t = TM_TABLE[key];
    if (!t) return;

    var isFanuc = window.controlMode === 'Fanuc';
    var rpm     = Math.min(t.rpm, isFanuc ? FANUC_RPM_MAX : 99999);

    tmToolDia.value    = t.toolDia;
    tmTipOffset.value  = t.tipOffset;
    tmToolType.value   = t.type === 'solid' ? 'Solid Carbide' : 'Single Point';
    tmDrillDia.value   = t.drillDia;
    tmDrillDepth.value = t.drillDepth;
    tmThreadDepth.value = t.drillDepth; // default thread depth to drill depth, user can reduce
    tmRpm.value        = rpm;
    tmFeed.value       = t.feed;

    tmCheckCutLength();
    tmGenerate();
}

// ── CUT LENGTH WARNING (solid carbide only) ─────────────────
function tmCheckCutLength() {
    var key = tmThreadSize.value;
    if (!key) return;
    var t = TM_TABLE[key];
    if (!t || t.type !== 'solid' || !t.maxCut) {
        tmCutWarn.style.display = 'none';
        return;
    }
    var depth     = parseFloat(tmThreadDepth.value) || 0;
    var tipOffset = parseFloat(tmTipOffset.value) || 0;
    var totalZ    = depth + tipOffset;
    tmCutWarn.style.display = (totalZ > t.maxCut) ? 'block' : 'none';
}

// ── CHAMFER MATH ─────────────────────────────────────────────
// toolRadAtDepth = tipRadius + |chamferZ|  (45° taper)
// radialMove     = (holeDia/2) + chamferWidth - toolRadAtDepth
// entryMove      = radialMove / 2
function tmChamferMoves(holeDia, chamferWidth) {
    var toolRadAtDepth = CHAMFER_TIP_R + Math.abs(CHAMFER_Z);
    var radialMove     = (holeDia / 2) + chamferWidth - toolRadAtDepth;
    var entryMove      = radialMove / 2;
    return {
        radial: parseFloat(radialMove.toFixed(4)),
        entry:  parseFloat(entryMove.toFixed(4))
    };
}

// ── SINGLE POINT HELIX GENERATOR ────────────────────────────
// Generates the helical G03 lines for one full pass from bottom to top
// Z steps pitch/2 per arc segment (two segments = one full revolution = one pitch)
function tmSinglePointHelix(cx, cy, threadDepth, tipOffset, pitch, rFinish, toolNum, doW) {
    var c    = [];
    var push = function() { for (var i=0;i<arguments.length;i++) c.push(arguments[i]); };

    var tPad       = toolNum.toString().padStart(2, '0');
    var halfPitch  = parseFloat((pitch / 2).toFixed(4));
    var zStart     = -(threadDepth + tipOffset);    // e.g. -1.685
    var zTop       = parseFloat((halfPitch).toFixed(4)); // one halfPitch above Z0

    // Radii
    var rRough  = parseFloat((rFinish - SPRING_STOCK).toFixed(4));
    var rRamp   = parseFloat((rFinish - halfPitch).toFixed(4));

    // IJ offsets for helix — tool orbits around hole center
    // At hole center (cx, cy), the tool starts offset by rFinish in -X
    // I and J are the arc center offsets from current position back to hole center
    var iFinish = parseFloat(rFinish.toFixed(4));
    var iRough  = parseFloat(rRough.toFixed(4));
    var iRamp   = parseFloat(rRamp.toFixed(4));

    // ── ROUGH PASS ──────────────────────────────────────────
    var zCur = zStart;

    // Rapids and plunge
    push('G00');
    if (doW) push('W0.0');
    push('Z' + tmFmt(zCur - 0.1, 4));
    push('G01 Z' + tmFmt(zCur, 4) + ' F5.');
    push('G41 D' + tPad + ' X' + tmFmt(cx - iRough, 4) + ' Y' + tmFmt(cy, 4) + ' F10.');

    // Climb from zStart to zTop, two arcs per pitch
    while (zCur < zTop) {
        var zMid  = parseFloat((zCur + halfPitch).toFixed(4));
        var zNext = parseFloat((zCur + pitch).toFixed(4));
        if (zMid  > zTop) zMid  = zTop;
        if (zNext > zTop) zNext = zTop;

        // Arc 1: from offset -X back through +X (half revolution)
        push('G03 X' + tmFmt(cx + iRough, 4) + ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zMid, 4) +
             ' I' + tmFmt(iRough, 4) + ' J0. D' + tPad + '(R' + tmFmt(iRough, 4) + ')');

        if (zNext > zTop) break;

        // Arc 2: from +X back to -X (second half)
        push('G03 X' + tmFmt(cx - iRough, 4) + ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zNext, 4) +
             ' I-' + tmFmt(iRough, 4) + ' J0. D' + tPad + '(R' + tmFmt(iRough, 4) + ')');

        zCur = zNext;
        if (zCur >= zTop) break;
    }

    // Exit rough pass
    push('G01 G40 X' + tmFmt(cx, 4) + ' Y' + tmFmt(cy, 4) + ' Z' + tmFmt(zTop + halfPitch, 4));
    push('G00');
    if (doW) push('W0.0');
    push('Z1.');

    return c;
}

// ── FINISH PASS LINES (single point) ────────────────────────
function tmSinglePointFinish(cx, cy, threadDepth, tipOffset, pitch, rFinish, toolNum, rampBottom, doW) {
    var c    = [];
    var push = function() { for (var i=0;i<arguments.length;i++) c.push(arguments[i]); };

    var tPad      = toolNum.toString().padStart(2, '0');
    var halfPitch = parseFloat((pitch / 2).toFixed(4));
    var zStart    = -(threadDepth + tipOffset);
    var zTop      = parseFloat(halfPitch.toFixed(4));
    var iFinish   = parseFloat(rFinish.toFixed(4));
    var rRamp     = parseFloat((rFinish - halfPitch).toFixed(4));

    // Ramp depth calculation (Grok formula)
    var rampDepth = parseFloat((0.0824 * rRamp + 0.0244).toFixed(4));
    var zFeedTo   = rampBottom ? parseFloat((zStart - rampDepth).toFixed(4)) : zStart;
    var zRapidTo  = parseFloat((zFeedTo - 0.1).toFixed(4));

    push('G00');
    if (doW) push('W0.0');
    push('Z' + tmFmt(zRapidTo, 4));
    push('G01 Z' + tmFmt(zFeedTo, 4) + ' F5.');

    if (rampBottom) {
        // Ramp-in arc entry using rRamp radius
        push('G41 D' + tPad +
             ' X' + tmFmt(cx - rRamp, 4) +
             ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zFeedTo + rampDepth * 0.4, 4) + ' F10.');
        push('G03 X' + tmFmt(cx + rRamp, 4) + ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zStart - halfPitch, 4) +
             ' I' + tmFmt(rRamp, 4) + ' J0. D' + tPad + '(R' + tmFmt(rRamp, 4) + ')');
        push('G03 X' + tmFmt(cx - rRamp, 4) + ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zStart, 4) +
             ' I-' + tmFmt(rRamp, 4) + ' J0. D' + tPad + '(R' + tmFmt(rRamp, 4) + ')');
        // Blend into finish helix at rFinish
        push('G03 X' + tmFmt(cx + iFinish, 4) + ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zStart + halfPitch, 4) +
             ' I' + tmFmt(iFinish, 4) + ' J0. D' + tPad + '(R' + tmFmt(iFinish, 4) + ')');
    } else {
        // Direct entry — no ramp
        push('G41 D' + tPad +
             ' X' + tmFmt(cx - iFinish, 4) +
             ' Y' + tmFmt(cy, 4) + ' F10.');
        push('G03 X' + tmFmt(cx + iFinish, 4) + ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zStart + halfPitch, 4) +
             ' I' + tmFmt(iFinish, 4) + ' J0. D' + tPad + '(R' + tmFmt(iFinish, 4) + ')');
    }

    // Climb from current Z to zTop
    var zCur = parseFloat((zStart + halfPitch).toFixed(4));
    while (zCur < zTop) {
        var zMid  = parseFloat((zCur + halfPitch).toFixed(4));
        var zNext = parseFloat((zCur + pitch).toFixed(4));
        if (zMid  > zTop) zMid  = zTop;
        if (zNext > zTop) zNext = zTop;

        push('G03 X' + tmFmt(cx - iFinish, 4) + ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zMid, 4) +
             ' I-' + tmFmt(iFinish, 4) + ' J0. D' + tPad + '(R' + tmFmt(iFinish, 4) + ')');

        if (zNext > zTop) break;

        push('G03 X' + tmFmt(cx + iFinish, 4) + ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zNext, 4) +
             ' I' + tmFmt(iFinish, 4) + ' J0. D' + tPad + '(R' + tmFmt(iFinish, 4) + ')');

        zCur = zNext;
        if (zCur >= zTop) break;
    }

    push('G01 G40 X' + tmFmt(cx, 4) + ' Y' + tmFmt(cy, 4) + ' Z' + tmFmt(zTop + halfPitch, 4));
    push('G00');
    if (doW) push('W0.0');
    push('Z1.');

    return c;
}

// ── SOLID CARBIDE PASS GENERATOR ────────────────────────────
// Generates both rough and finish passes (~8 lines each)
function tmSolidPass(cx, cy, threadDepth, tipOffset, pitch, rPass, toolNum, isFinish, rampBottom, doW) {
    var c    = [];
    var push = function() { for (var i=0;i<arguments.length;i++) c.push(arguments[i]); };

    var tPad      = toolNum.toString().padStart(2, '0');
    var halfPitch = parseFloat((pitch / 2).toFixed(4));
    var zStart    = -(threadDepth + tipOffset);    // bottom of thread engagement
    var zEnd      = parseFloat((zStart + pitch).toFixed(4));  // one pitch up

    // Ramp depth
    var rRamp     = parseFloat((rPass - halfPitch).toFixed(4));
    var rampDepth = parseFloat((0.0824 * rRamp + 0.0244).toFixed(4));
    var zFeedTo   = rampBottom ? parseFloat((zStart - rampDepth).toFixed(4)) : zStart;
    var zRapidTo  = parseFloat((zFeedTo - 0.1).toFixed(4));

    push('G00');
    if (doW) push('W0.0');
    push('Z' + tmFmt(zRapidTo, 4));
    push('G01 Z' + tmFmt(zFeedTo, 4) + ' F' + tmFmt(parseFloat(tmFeed.value) / 2, 1));

    if (rampBottom) {
        // Ramp in using smaller arc
        push('G41 D' + tPad +
             ' X' + tmFmt(cx - rRamp, 4) +
             ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zFeedTo + rampDepth * 0.4, 4) + ' F' + tmFmt(parseFloat(tmFeed.value), 1));
        push('G03 X' + tmFmt(cx + rRamp, 4) + ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zStart - halfPitch, 4) +
             ' I' + tmFmt(rRamp, 4) + ' J0. D' + tPad + '(R' + tmFmt(rRamp, 4) + ')');
        push('G03 X' + tmFmt(cx - rRamp, 4) + ' Y' + tmFmt(cy, 4) +
             ' Z' + tmFmt(zStart, 4) +
             ' I-' + tmFmt(rRamp, 4) + ' J0. D' + tPad + '(R' + tmFmt(rRamp, 4) + ')');
    } else {
        push('G41 D' + tPad +
             ' X' + tmFmt(cx - rPass, 4) +
             ' Y' + tmFmt(cy, 4) + ' F' + tmFmt(parseFloat(tmFeed.value), 1));
    }

    // Main thread arc — one pitch span
    push('G03 X' + tmFmt(cx + rPass, 4) + ' Y' + tmFmt(cy, 4) +
         ' Z' + tmFmt(parseFloat((zStart + halfPitch).toFixed(4)), 4) +
         ' I' + tmFmt(rPass, 4) + ' J0. D' + tPad + '(R' + tmFmt(rPass, 4) + ')');
    push('G03 X' + tmFmt(cx - rPass, 4) + ' Y' + tmFmt(cy, 4) +
         ' Z' + tmFmt(parseFloat(zEnd.toFixed(4)), 4) +
         ' I-' + tmFmt(rPass, 4) + ' J0. D' + tPad + '(R' + tmFmt(rPass, 4) + ')');

    // Arc out
    push('G03 X' + tmFmt(cx - rRamp, 4) + ' Y' + tmFmt(cy, 4) +
         ' Z' + tmFmt(parseFloat((zEnd + halfPitch * 0.3).toFixed(4)), 4) +
         ' I' + tmFmt(rRamp, 4) + ' J0. D' + tPad + '(R' + tmFmt(rRamp, 4) + ')');
    push('G01 G40 X' + tmFmt(cx, 4) + ' Y' + tmFmt(cy, 4) +
         ' Z' + tmFmt(parseFloat((zEnd + halfPitch * 0.5).toFixed(4)), 4));
    push('G00');
    if (doW) push('W0.0');
    push('Z1.');

    return c;
}

// ── CHAMFER LINES ────────────────────────────────────────────
function tmChamferLines(cx, cy, holeDia, threadDia, doW) {
    var c    = [];
    var push = function() { for (var i=0;i<arguments.length;i++) c.push(arguments[i]); };

    var chamWidth = (parseFloat(threadDia) >= 1.5) ? CHAMFER_LARGE : CHAMFER_SMALL;
    var m         = tmChamferMoves(holeDia, chamWidth);
    var entry     = tmFmt(m.entry, 4);
    var radial    = tmFmt(m.radial, 4);

    // Position, plunge, chamfer circle
    push('G00');
    if (doW) push('W0.0');
    push('W0.0');
    push('Z0.1');
    push('G01 Z' + tmFmt(CHAMFER_Z, 2) + ' F10. S2200');
    push('G03 X' + tmFmt(cx - m.entry, 4) + ' Y' + tmFmt(cy - m.entry, 4) +
         ' I0. J-' + entry + ' F20. D7(R' + entry + ')');
    push('X' + tmFmt(cx, 4) + ' Y' + tmFmt(cy - m.radial, 4) +
         ' I' + entry + ' J0. D7(R' + entry + ')');
    push('X' + tmFmt(cx + m.radial, 4) + ' Y' + tmFmt(cy, 4) +
         ' I0. J' + radial + ' D7(R' + radial + ')');
    push('X' + tmFmt(cx - m.radial, 4) + ' Y' + tmFmt(cy, 4) +
         ' I-' + radial + ' J0. D7(R' + radial + ')');
    push('X' + tmFmt(cx, 4) + ' Y' + tmFmt(cy - m.radial, 4) +
         ' I' + radial + ' J0. D7(R' + radial + ')');
    push('X' + tmFmt(cx + m.entry, 4) + ' Y' + tmFmt(cy - m.entry, 4) +
         ' I0. J' + entry + ' D7(R' + entry + ')');
    push('X' + tmFmt(cx, 4) + ' Y' + tmFmt(cy, 4) +
         ' I-' + entry + ' J0. D7(R' + entry + ')');
    push('G00');
    if (doW) push('W0.0');
    push('Z1.');

    return c;
}

// ── MAIN GENERATOR ──────────────────────────────────────────
function tmGenerate() {
    // Validate all inputs
    var inputs = [tmProgNum, tmToolNum, tmToolDia, tmTipOffset,
                  tmDrillDia, tmDrillDepth, tmThreadDepth,
                  tmXPos, tmYPos, tmRpm, tmFeed];
    var ok = true;
    inputs.forEach(function(el) { if (!tmValidate(el)) ok = false; });
    if (!ok || !tmThreadSize.value) {
        tmOutputArea.value = '(Select a thread size and fill all fields)';
        return;
    }

    var key        = tmThreadSize.value;
    var t          = TM_TABLE[key];
    var isHaas     = window.controlMode === 'Haas';
    var isFanuc    = !isHaas;
    var progNum    = tmFmtProg(tmProgNum.value);
    var toolNum    = parseInt(tmToolNum.value);
    var tPad       = toolNum.toString().padStart(2, '0');
    var toolDia    = parseFloat(tmToolDia.value);
    var tipOffset  = parseFloat(tmTipOffset.value);
    var drillDia   = parseFloat(tmDrillDia.value);
    var drillDepth = parseFloat(tmDrillDepth.value);
    var threadDepth= parseFloat(tmThreadDepth.value);
    var cx         = parseFloat(tmXPos.value) || 0;
    var cy         = parseFloat(tmYPos.value) || 0;
    var rpm        = parseInt(tmRpm.value);
    var feed       = parseFloat(tmFeed.value);
    var tpi        = t.tpi;
    var pitch      = parseFloat((1 / tpi).toFixed(6));
    var isSolid    = t.type === 'solid';
    var doCenterDrill = tmCenterDrill.checked;
    var doChamfer  = tmChamfer.checked;
    var doRamp     = tmRampBottom.checked;
    var doW        = tmIncludeW.checked && isFanuc;

    // Thread size label for comments
    var sizeLabel  = tmThreadSize.options[tmThreadSize.selectedIndex].text;

    // Drill RPM using SFM 500
    var drillRpm   = Math.round(3.82 * 500 / drillDia);
    if (isFanuc) drillRpm = Math.min(drillRpm, FANUC_RPM_MAX);

    // Chamfer: use drillDia for hole size, thread major dia for width selection
    var majorDia   = parseFloat(key.split('-')[0]);

    // Thread mill radii
    var rFinish = parseFloat(((drillDia / 2) - (toolDia / 2)).toFixed(4));
    var rRough  = parseFloat((rFinish - SPRING_STOCK).toFixed(4));

    var c    = [];
    var push = function() { for (var i=0;i<arguments.length;i++) c.push(arguments[i]); };
    var blank= function() { c.push(''); };
    var semi = function() { if (isFanuc) { c.push(';'); c.push(';'); } };

    // ── HEADER ──────────────────────────────────────────────
    push('%');
    push(progNum);
    push('(' + sizeLabel + ' THREAD MILL)');
    semi();
    push('');
    if (doCenterDrill) push('(T4  - CENTER DRILL)');
    push('(T' + drillDia.toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0') + ' DRILL — TOOL FROM JOB SETUP)');
    if (doChamfer)    push('(T7  - 45 DEGREE CHAMFER)');
    push('(T' + tPad + ' - ' + (isSolid ? 'SOLID CARBIDE' : 'SINGLE POINT') + ' THREAD MILL)');
    semi();
    blank();

    if (isFanuc) {
        // ── FANUC STRUCTURE ─────────────────────────────────

        // N1 — Center Drill
        if (doCenterDrill) {
            push('G28 G91 W0. Z0.');
            push('G00 G17 G40 G80 G90 G94');
            push('(CENTER DRILL)');
            push('N1 (STEP) T4 M06');
            push('G00 G90 G54 S2200 M03');
            push('X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4) + ' B0.');
            push('G43 H4 Z1.');
            if (doW) push('W0.0');
            push('Z1.');
            push('G98 G81 Z-0.03 R0.1 F5.');
            push('G80');
            push('G00');
            if (doW) push('W0.0');
            push('Z1.');
            push('M05');
            push('M09');
            push('G91 G28 W0. Z0.');
            push('M01');
            semi();
        }

        // N2 — Drill
        var nDrill = doCenterDrill ? 'N2' : 'N1';
        var nextTool = doChamfer ? 'T7' : 'T' + tPad;
        push('G28 G91 W0. Z0.');
        push('G00 G17 G40 G80 G90 G94');
        push('(' + tmFmt(drillDia,3) + ' DRILL)');
        push(nDrill + ' (STEP) T' + 'XX' + ' M06');  // tool num entered by operator
        push('G00 G90 G54 S' + drillRpm + ' M03');
        push('X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4) + ' B0.');
        push('G43 H' + 'XX' + ' Z1. ' + nextTool);
        push('M07');
        if (doW) push('W0.0');
        push('Z1.');
        push('G98 G81 Z-' + tmFmt(drillDepth + 0.25, 4) + ' R0.1 F' + feed + '.');
        push('G80');
        push('G00');
        if (doW) push('W0.0');
        push('Z1.');
        push('M05');
        push('M09');
        push('G91 G28 W0. Z0.');
        push('M01');
        semi();

        // N3 — Chamfer
        if (doChamfer) {
            var nChamfer = doCenterDrill ? 'N3' : 'N2';
            push('G28 G91 W0. Z0.');
            push('G00 G17 G40 G80 G90 G94');
            push('(45 DEGREE CHAMFER)');
            push(nChamfer + ' (STEP) T7 M06');
            push('G00 G90 G54 S2200 M03');
            push('X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4) + ' B0.');
            push('G43 H7 Z1. T' + tPad);
            push('M08');
            push('G00 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
            if (doW) push('W0.0');
            tmChamferLines(cx, cy, drillDia, majorDia, doW).forEach(function(l) { push(l); });
            push('M05');
            push('M09');
            push('G91 G28 W0. Z0.');
            push('M01');
            semi();
        }

        // N4 — Thread Mill
        var stepCount = 1 + (doCenterDrill ? 1 : 0) + (doChamfer ? 1 : 0);
        var nThread = 'N' + stepCount;
        push('G28 G91 W0. Z0.');
        push('G00 G17 G40 G80 G90 G94');
        push('(' + (isSolid ? 'SOLID CARBIDE' : 'SINGLE POINT') + ' THREAD MILL)');
        push(nThread + ' (STEP) T' + tPad + ' M06');
        push('G00 G90 G54 S' + rpm + ' M03');
        push('X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4) + ' B0.');
        push('G43 H' + tPad + ' Z1. T4');
        push('M08');
        push('G00 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
        if (doW) push('W0.0');
        push('Z1.');

        if (isSolid) {
            // Rough pass
            tmSolidPass(cx, cy, threadDepth, tipOffset, pitch, rRough, toolNum, false, doRamp, doW)
                .forEach(function(l) { push(l); });
            // Finish pass
            tmSolidPass(cx, cy, threadDepth, tipOffset, pitch, rFinish, toolNum, true, doRamp, doW)
                .forEach(function(l) { push(l); });
        } else {
            // Rough pass (single point)
            tmSinglePointHelix(cx, cy, threadDepth, tipOffset, pitch, rRough, toolNum, doW)
                .forEach(function(l) { push(l); });
            // Finish pass
            tmSinglePointFinish(cx, cy, threadDepth, tipOffset, pitch, rFinish, toolNum, doRamp, doW)
                .forEach(function(l) { push(l); });
        }

        push('M05');
        push('M09');
        push('G91 G28 W0. Z0.');
        push('M30');
        push('%');

    } else {
        // ── HAAS STRUCTURE ──────────────────────────────────

        if (doCenterDrill) {
            push('(CENTER DRILL)');
            push('N10 T4 M06');
            push('M08');
            push('G00 G90 G54 S2500 M03');
            push('G43 H04 T' + 'XX' + ' X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
            push('Z1.');
            push('G81 G98 Z-0.03 R0.1 F5. L0');
            push('G70 I0. J0. L1');
            push('G80');
            push('Z1.');
            push('M05');
            push('M09');
            push('G00 G90 M89');
            push('G28 G91 Z0.');
            push('G28 G91 Y0.');
            push('M01');
            blank();
        }

        // Drill
        push('(' + tmFmt(drillDia,3) + ' DRILL)');
        push('N20 T' + 'XX' + ' M06');
        push('G00 G90 G54 S' + drillRpm + ' M03');
        push('G43 H' + 'XX' + ' T' + (doChamfer ? '07' : tPad) + ' X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
        push('Z1.');
        push('M31');
        push('M88');
        push('G81 G98 Z-' + tmFmt(drillDepth + 0.25, 4) + ' R0.1 F' + feed + '. L0');
        push('G70 I0. J0. L1');
        push('G80');
        push('Z1.');
        push('M05');
        push('M09');
        push('G00 G90 M89');
        push('G28 G91 Z0.');
        push('G28 G91 Y0.');
        push('M01');
        blank();

        // Chamfer
        if (doChamfer) {
            push('(45 DEGREE CHAMFER)');
            push('N30 T7 M06');
            push('G00 G90 G54 S2200 M03');
            push('G43 H07 T' + tPad + ' X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
            push('Z1.');
            push('M08');
            push('G00 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
            tmChamferLines(cx, cy, drillDia, majorDia, false).forEach(function(l) { push(l); });
            push('M05');
            push('M09');
            push('G00 G90 M89');
            push('G28 G91 Z0.');
            push('G28 G91 Y0.');
            push('M01');
            blank();
        }

        // Thread Mill
        push('(' + (isSolid ? 'SOLID CARBIDE' : 'SINGLE POINT') + ' THREAD MILL)');
        push('N40 T' + tPad + ' M06');
        push('G00 G90 G54 S' + rpm + ' M03');
        push('G43 H' + tPad + ' T4 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
        push('Z1.');
        push('M08');
        push('G00 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
        push('Z1.');

        if (isSolid) {
            tmSolidPass(cx, cy, threadDepth, tipOffset, pitch, rRough, toolNum, false, doRamp, false)
                .forEach(function(l) { push(l); });
            tmSolidPass(cx, cy, threadDepth, tipOffset, pitch, rFinish, toolNum, true, doRamp, false)
                .forEach(function(l) { push(l); });
        } else {
            tmSinglePointHelix(cx, cy, threadDepth, tipOffset, pitch, rRough, toolNum, false)
                .forEach(function(l) { push(l); });
            tmSinglePointFinish(cx, cy, threadDepth, tipOffset, pitch, rFinish, toolNum, doRamp, false)
                .forEach(function(l) { push(l); });
        }

        push('M05');
        push('M09');
        push('G00 G90 M89');
        push('G28 G91 Z0.');
        push('G28 G91 Y0.');
        push('G90');
        push('M30');
        push('%');
    }

    tmOutputArea.value = c.join('\n');
}

// ── COPY & DOWNLOAD ─────────────────────────────────────────
function tmCopyToClipboard() {
    tmOutputArea.select();
    document.execCommand('copy');
    var orig = tmCopyBtn.innerHTML;
    tmCopyBtn.innerHTML = '<i data-lucide="check"></i> Copied!';
    tmCopyBtn.style.cssText = 'color:var(--bg-base);background-color:var(--accent);border-color:var(--accent);';
    lucide.createIcons();
    setTimeout(function() {
        tmCopyBtn.innerHTML = orig;
        tmCopyBtn.style = '';
        lucide.createIcons();
    }, 2000);
}

function tmDownloadCode() {
    var content = tmOutputArea.value;
    var blob = new Blob([content], { type: 'text/plain' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url;
    a.download = tmFmtProg(tmProgNum.value) + '.nc';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── EVENT WIRING ─────────────────────────────────────────────
tmThreadSize.addEventListener('change', tmLookup);

[tmProgNum, tmToolNum, tmToolDia, tmTipOffset,
 tmDrillDia, tmDrillDepth, tmThreadDepth,
 tmXPos, tmYPos, tmRpm, tmFeed].forEach(function(el) {
    el.addEventListener('input', function() {
        tmCheckCutLength();
        if (tmValidate(el)) tmGenerate();
    });
});

[tmCenterDrill, tmChamfer, tmRampBottom, tmIncludeW].forEach(function(el) {
    el.addEventListener('change', tmGenerate);
});

// ── BOOT ─────────────────────────────────────────────────────
// Called by shell when toggle changes
var _bcOnControlModeChange = (typeof onControlModeChange === 'function') ? onControlModeChange : null;
window.onControlModeChange = function() {
    if (_bcOnControlModeChange) _bcOnControlModeChange();
    tmUpdateWAxis();
    if (tmThreadSize.value) {
        // Re-clamp RPM for Fanuc if a thread is already selected
        var t = TM_TABLE[tmThreadSize.value];
        if (t) {
            var rpm = Math.min(t.rpm, window.controlMode === 'Fanuc' ? FANUC_RPM_MAX : 99999);
            tmRpm.value = rpm;
        }
        tmGenerate();
    }
};

tmUpdateWAxis();
lucide.createIcons();

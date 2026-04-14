// ============================================================
// G-FLOOR — THREAD MILL ENGINE v2
// Single hole thread mill — UN threads, single point + solid carbide
// Verified against CAD/CAM reference programs
// ============================================================

// ── THREAD TABLE ────────────────────────────────────────────
// majorDia   = nominal thread diameter (used for rFinish calc)
// drillDia   = standard drill diameter
// drillDepth = standard drill depth (LD from chart)
// tpi        = threads per inch
// toolDia    = thread mill cutter diameter
// tipOffset  = Z tool tip offset (added to threadDepth for zStart)
// rpm        = recommended RPM (Fanuc auto-capped at 2500)
// feed       = recommended feed IPM
// type       = 'solid' | 'single'
// maxCut     = solid carbide only — max cutting length in inches
const TM_TABLE = {
    "0.625-11": { majorDia:0.625, drillDia:0.531, drillDepth:1.25, tpi:11, toolDia:0.470, tipOffset:0.050, rpm:2844, feed:3,  type:'solid',  maxCut:1.44 },
    "0.750-10": { majorDia:0.750, drillDia:0.656, drillDepth:1.38, tpi:10, toolDia:0.495, tipOffset:0.050, rpm:2701, feed:3,  type:'solid',  maxCut:1.30 },
    "0.875-9":  { majorDia:0.875, drillDia:0.766, drillDepth:1.56, tpi:9,  toolDia:0.708, tipOffset:0.133, rpm:2700, feed:30, type:'single', maxCut:null },
    "1.000-8":  { majorDia:1.000, drillDia:0.875, drillDepth:1.75, tpi:8,  toolDia:0.787, tipOffset:0.133, rpm:2426, feed:30, type:'single', maxCut:null },
    "1.125-8":  { majorDia:1.125, drillDia:1.000, drillDepth:1.94, tpi:8,  toolDia:0.885, tipOffset:0.185, rpm:2158, feed:30, type:'single', maxCut:null },
    "1.250-8":  { majorDia:1.250, drillDia:1.125, drillDepth:2.06, tpi:8,  toolDia:0.885, tipOffset:0.185, rpm:2158, feed:30, type:'single', maxCut:null },
    "1.375-8":  { majorDia:1.375, drillDia:1.250, drillDepth:2.19, tpi:8,  toolDia:0.885, tipOffset:0.185, rpm:2158, feed:30, type:'single', maxCut:null },
    "1.500-8":  { majorDia:1.500, drillDia:1.375, drillDepth:2.31, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:30, type:'single', maxCut:null },
    "1.625-8":  { majorDia:1.625, drillDia:1.500, drillDepth:2.25, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:30, type:'single', maxCut:null },
    "1.750-8":  { majorDia:1.750, drillDia:1.625, drillDepth:2.38, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:30, type:'single', maxCut:null },
    "1.875-8":  { majorDia:1.875, drillDia:1.750, drillDepth:2.56, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:30, type:'single', maxCut:null },
    "2.000-8":  { majorDia:2.000, drillDia:1.875, drillDepth:2.62, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:30, type:'single', maxCut:null },
    "2.250-8":  { majorDia:2.250, drillDia:2.125, drillDepth:2.88, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:30, type:'single', maxCut:null },
    "2.500-8":  { majorDia:2.500, drillDia:2.375, drillDepth:3.12, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:30, type:'single', maxCut:null },
    "2.750-8":  { majorDia:2.750, drillDia:2.625, drillDepth:3.38, tpi:8,  toolDia:1.220, tipOffset:0.160, rpm:1870, feed:30, type:'single', maxCut:null }
};

const SPRING_STOCK  = 0.007;   // radial stock between rough and finish pass
const CHAMFER_TIP_R = 0.0875;  // T7 tip radius = 0.175/2
const FANUC_RPM_MAX = 2500;
const ENTRY_ANGLE   = 21 * Math.PI / 180;  // arc entry angle from -X axis (radians)

// ── DOM REFERENCES ──────────────────────────────────────────
const tmProgNum     = document.getElementById('tm-progNum');
const tmThreadSize  = document.getElementById('tm-threadSize');
const tmToolNum     = document.getElementById('tm-toolNum');
const tmToolDia     = document.getElementById('tm-toolDia');
const tmTipOffset   = document.getElementById('tm-tipOffset');
const tmToolType    = document.getElementById('tm-toolType');
const tmDrillDia    = document.getElementById('tm-drillDia');
const tmDrillDepth  = document.getElementById('tm-drillDepth');
const tmThreadDepth = document.getElementById('tm-threadDepth');
const tmCutWarn     = document.getElementById('tm-cutLengthWarn');
const tmXPos        = document.getElementById('tm-xPos');
const tmYPos        = document.getElementById('tm-yPos');
const tmRpm         = document.getElementById('tm-rpm');
const tmFeed        = document.getElementById('tm-feed');
const tmCenterDrill = document.getElementById('tm-centerDrill');
const tmChamfer     = document.getElementById('tm-chamfer');
const tmRampBottom  = document.getElementById('tm-rampBottom');
const tmIncludeW    = document.getElementById('tm-includeW');
const tmWAxisRow    = document.getElementById('tm-wAxisRow');
const tmOutputArea  = document.getElementById('tm-outputArea');
const tmCopyBtn     = document.getElementById('tm-copyBtn');

// ── HELPERS ─────────────────────────────────────────────────
function tmFmt(num, dec) {
    dec = (dec === undefined) ? 4 : dec;
    var s = parseFloat(num.toFixed(dec)).toString();
    if (s.indexOf('.') === -1) s += '.0';
    return s;
}

function tmFmtProg(val) {
    var n = parseInt(val, 10);
    if (isNaN(n) || n < 0) n = 0;
    return 'O' + n.toString().padStart(4, '0');
}

function tmFmtF(val) {
    return (val % 1 === 0) ? val + '.' : val.toString();
}

function tmRound(val, dec) {
    return parseFloat(val.toFixed(dec === undefined ? 4 : dec));
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
    var rpm = Math.min(t.rpm, isFanuc ? FANUC_RPM_MAX : 99999);

    tmToolDia.value     = t.toolDia;
    tmTipOffset.value   = t.tipOffset;
    tmToolType.value    = t.type === 'solid' ? 'Solid Carbide' : 'Single Point';
    tmDrillDia.value    = t.drillDia;
    tmDrillDepth.value  = t.drillDepth;
    tmThreadDepth.value = t.drillDepth; // default to drill depth, user adjusts down
    tmRpm.value         = rpm;
    tmFeed.value        = t.feed;

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
    tmCutWarn.style.display = ((depth + tipOffset) > t.maxCut) ? 'block' : 'none';
}

// ── CHAMFER MATH ─────────────────────────────────────────────
// Small chamfer (thread < 1.5"): Z = -0.09, chamfer width = 0.06
// Large chamfer (thread >= 1.5"): Z = -0.12, chamfer width = 0.09
// toolRadAtZ = CHAMFER_TIP_R + |chamZ|
// radialMove = (holeDia/2) + chamWidth - toolRadAtZ
// entryMove  = radialMove / 2
function tmChamferGeometry(holeDia, majorDia) {
    var isLarge    = majorDia >= 1.5;
    var chamZ      = isLarge ? -0.12 : -0.09;
    var chamWidth  = isLarge ? 0.09  : 0.06;
    var toolRadAtZ = CHAMFER_TIP_R + Math.abs(chamZ);
    var radialMove = tmRound((holeDia / 2) + chamWidth - toolRadAtZ, 4);
    var entryMove  = tmRound(radialMove / 2, 4);
    return { chamZ: chamZ, radial: radialMove, entry: entryMove };
}

// ── CHAMFER G-CODE LINES ────────────────────────────────────
function tmChamferLines(cx, cy, holeDia, majorDia, doW, clr) {
    var g  = tmChamferGeometry(holeDia, majorDia);
    var c  = [];
    var px = function(v) { return tmFmt(cx + v, 4); };
    var py = function(v) { return tmFmt(cy + v, 4); };
    var R  = g.radial, E = g.entry;

    c.push('G00 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
    if (doW) c.push('W0.0');
    c.push('W0.0');
    c.push('Z0.1');
    c.push('G01 Z' + tmFmt(g.chamZ, 2) + ' F10. S2200');
    // Arc in (entry move)
    c.push('G03 X' + px(-E) + ' Y' + py(-E) + ' I0. J-' + tmFmt(E,4) + ' F20. D7(R' + tmFmt(E,4) + ')');
    // Complete entry arc
    c.push('X' + tmFmt(cx,4) + ' Y' + py(-R) + ' I' + tmFmt(E,4) + ' J0. D7(R' + tmFmt(E,4) + ')');
    // Full radial circles (the actual chamfer)
    c.push('X' + px(R) + ' Y' + tmFmt(cy,4) + ' I0. J' + tmFmt(R,4) + ' D7(R' + tmFmt(R,4) + ')');
    c.push('X' + px(-R) + ' Y' + tmFmt(cy,4) + ' I-' + tmFmt(R,4) + ' J0. D7(R' + tmFmt(R,4) + ')');
    c.push('X' + tmFmt(cx,4) + ' Y' + py(-R) + ' I' + tmFmt(R,4) + ' J0. D7(R' + tmFmt(R,4) + ')');
    // Arc out (exit move)
    c.push('X' + px(E) + ' Y' + py(-E) + ' I0. J' + tmFmt(E,4) + ' D7(R' + tmFmt(E,4) + ')');
    c.push('X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4) + ' I-' + tmFmt(E,4) + ' J0. D7(R' + tmFmt(E,4) + ')');
    c.push('G00');
    if (doW) c.push('W0.0');
    c.push('Z' + clr);

    return c;
}

// ── THREAD MILL PASS GENERATOR ──────────────────────────────
// Generates one complete pass (rough or finish) for either tool type
// Uses arc entry geometry matching CAD/CAM reference
function tmPass(cx, cy, threadDepth, tipOffset, pitch, rPass, toolNum, isSolid, rampBottom, doW, feed) {
    var c     = [];
    var tPad  = toolNum.toString().padStart(2, '0');
    var hp    = tmRound(pitch / 2, 6);
    var zStart= tmRound(-(threadDepth + tipOffset), 4);
    var zTop  = tmRound(hp, 4);  // one half-pitch above Z0

    // Ramp geometry
    var rRamp     = tmRound(rPass - hp, 4);
    var rampDepth = tmRound(0.0824 * rRamp + 0.0244, 4);
    var zRapid    = rampBottom ? tmRound(zStart - rampDepth + 0.1, 4)
                               : tmRound(zStart + 0.1, 4);
    var zFeedTo   = tmRound(zRapid - 0.1, 4);

    // Entry point — come in at ENTRY_ANGLE below -X axis at rRamp distance
    // This matches CAD/CAM approach geometry
    var entryX = tmRound(cx - rRamp * Math.cos(ENTRY_ANGLE), 4);
    var entryY = tmRound(cy - rRamp * Math.sin(ENTRY_ANGLE), 4);
    var iEntry = tmRound(rRamp * Math.cos(ENTRY_ANGLE), 4);
    var jEntry = tmRound(-rRamp * Math.sin(ENTRY_ANGLE), 4);

    c.push('G00');
    if (doW) c.push('W0.0');
    c.push('Z' + tmFmt(zRapid, 4));
    c.push('G01 Z' + tmFmt(zFeedTo, 4) + ' F1.5');

    if (rampBottom) {
        // Ramp in entry with Z movement
        var zEntry = tmRound(zFeedTo + rampDepth * 0.5, 4);
        c.push('G41 D' + tPad + ' X' + tmFmt(entryX,4) + ' Y' + tmFmt(entryY,4) +
               ' Z' + tmFmt(zEntry,4) + ' F' + tmFmtF(feed));

        // Two small arcs curving from entry into main helix circle
        var zArc1 = tmRound(zStart - hp, 4);
        var zArc2 = tmRound(zStart, 4);
        c.push('G03 X' + tmFmt(cx + rRamp, 4) + ' Y' + tmFmt(cy, 4) +
               ' Z' + tmFmt(zArc1, 4) +
               ' I' + tmFmt(iEntry, 4) + ' J' + tmFmt(jEntry, 4) +
               ' D' + tPad + '(R' + tmFmt(rRamp, 4) + ')');
        c.push('G03 X' + tmFmt(cx - rRamp, 4) + ' Y' + tmFmt(cy, 4) +
               ' Z' + tmFmt(zArc2, 4) +
               ' I-' + tmFmt(rRamp, 4) + ' J0.' +
               ' D' + tPad + '(R' + tmFmt(rRamp, 4) + ')');

        // Blend onto main helix radius
        var zBlend = tmRound(zStart + hp, 4);
        c.push('G03 X' + tmFmt(cx + rPass, 4) + ' Y' + tmFmt(cy, 4) +
               ' Z' + tmFmt(zBlend, 4) +
               ' I' + tmFmt(rRamp, 4) + ' J' + tmFmt(tmRound(-rPass + rRamp, 4), 4) +
               ' D' + tPad + '(R' + tmFmt(rPass, 4) + ')');
    } else {
        // Direct entry — no ramp bottom
        c.push('G41 D' + tPad + ' X' + tmFmt(cx - rPass, 4) + ' Y' + tmFmt(cy, 4) +
               ' F' + tmFmtF(feed));
    }

    if (isSolid) {
        // Solid carbide: exactly ONE pitch span
        // From zStart to zStart + pitch
        var zMid = tmRound(zStart + hp, 4);
        var zEnd = tmRound(zStart + pitch, 4);

        if (!rampBottom) {
            // Start from ramp-style entry directly into the pass
            c.push('G03 X' + tmFmt(cx + rPass, 4) + ' Y' + tmFmt(cy, 4) +
                   ' Z' + tmFmt(zMid, 4) +
                   ' I' + tmFmt(rPass, 4) + ' J0. D' + tPad + '(R' + tmFmt(rPass, 4) + ')');
        }

        c.push('G03 X' + tmFmt(cx - rPass, 4) + ' Y' + tmFmt(cy, 4) +
               ' Z' + tmFmt(zEnd, 4) +
               ' I-' + tmFmt(rPass, 4) + ' J0. D' + tPad + '(R' + tmFmt(rPass, 4) + ')');

        // Arc out — transition back toward center using rRamp
        var zArcOut = tmRound(zEnd + hp * 0.3, 4);
        c.push('G03 X' + tmFmt(cx - rRamp, 4) + ' Y' + tmFmt(cy, 4) +
               ' Z' + tmFmt(zArcOut, 4) +
               ' I' + tmFmt(rRamp, 4) + ' J0. D' + tPad + '(R' + tmFmt(rRamp, 4) + ')');

        var zExit = tmRound(zEnd + hp * 0.5, 4);
        c.push('G01 G40 X' + tmFmt(cx, 4) + ' Y' + tmFmt(cy, 4) + ' Z' + tmFmt(zExit, 4));

    } else {
        // Single point: helical climb from zStart to zTop
        // Two arcs per revolution, each advancing halfPitch in Z
        var zCur = rampBottom ? tmRound(zStart + hp, 4) : zStart;

        while (zCur < zTop) {
            var zNext1 = tmRound(zCur + hp, 4);
            var zNext2 = tmRound(zCur + pitch, 4);
            if (zNext1 > zTop) zNext1 = zTop;
            if (zNext2 > zTop) zNext2 = zTop;

            c.push('G03 X' + tmFmt(cx - rPass, 4) + ' Y' + tmFmt(cy, 4) +
                   ' Z' + tmFmt(zNext1, 4) +
                   ' I-' + tmFmt(rPass, 4) + ' J0. D' + tPad + '(R' + tmFmt(rPass, 4) + ')');

            if (zNext2 > zTop) break;

            c.push('G03 X' + tmFmt(cx + rPass, 4) + ' Y' + tmFmt(cy, 4) +
                   ' Z' + tmFmt(zNext2, 4) +
                   ' I' + tmFmt(rPass, 4) + ' J0. D' + tPad + '(R' + tmFmt(rPass, 4) + ')');

            zCur = zNext2;
            if (zCur >= zTop) break;
        }

        // Exit arc
        var zExitArc = tmRound(zTop + hp * 0.3, 4);
        c.push('G03 X' + tmFmt(cx - rRamp, 4) + ' Y' + tmFmt(cy, 4) +
               ' Z' + tmFmt(zExitArc, 4) +
               ' I' + tmFmt(rRamp, 4) + ' J0. D' + tPad + '(R' + tmFmt(rRamp, 4) + ')');

        var zExitLine = tmRound(zTop + hp * 0.5, 4);
        c.push('G01 G40 X' + tmFmt(cx, 4) + ' Y' + tmFmt(cy, 4) + ' Z' + tmFmt(zExitLine, 4));
    }

    c.push('G00');
    if (doW) c.push('W0.0');
    c.push('Z1.');

    return c;
}

// ── MAIN GENERATOR ──────────────────────────────────────────
function tmGenerate() {
    var inputs = [tmProgNum, tmToolNum, tmToolDia, tmTipOffset,
                  tmDrillDia, tmDrillDepth, tmThreadDepth,
                  tmXPos, tmYPos, tmRpm, tmFeed];
    var ok = true;
    inputs.forEach(function(el) { if (!tmValidate(el)) ok = false; });
    if (!ok || !tmThreadSize.value) {
        tmOutputArea.value = '(Select a thread size and fill all fields)';
        return;
    }

    var key         = tmThreadSize.value;
    var t           = TM_TABLE[key];
    var isHaas      = window.controlMode === 'Haas';
    var isFanuc     = !isHaas;
    var progNum     = tmFmtProg(tmProgNum.value);
    var toolNum     = parseInt(tmToolNum.value);
    var tPad        = toolNum.toString().padStart(2, '0');
    var toolDia     = parseFloat(tmToolDia.value);
    var tipOffset   = parseFloat(tmTipOffset.value);
    var drillDia    = parseFloat(tmDrillDia.value);
    var drillDepth  = parseFloat(tmDrillDepth.value);
    var threadDepth = parseFloat(tmThreadDepth.value);
    var cx          = parseFloat(tmXPos.value) || 0;
    var cy          = parseFloat(tmYPos.value) || 0;
    var rpm         = parseInt(tmRpm.value);
    var feed        = parseFloat(tmFeed.value);
    var tpi         = t.tpi;
    var pitch       = tmRound(1 / tpi, 6);
    var majorDia    = t.majorDia;
    var isSolid     = t.type === 'solid';
    var doCenterDrill = tmCenterDrill.checked;
    var doChamfer   = tmChamfer.checked;
    var doRamp      = tmRampBottom.checked;
    var doW         = tmIncludeW.checked && isFanuc;

    var sizeLabel   = tmThreadSize.options[tmThreadSize.selectedIndex].text.replace(/"/g, '"');

    // Clearance — Z10 for Fanuc, Z1 for Haas and thread mill section
    var clr     = isFanuc ? 'Z10.' : 'Z1.';
    var clrNum  = isFanuc ? 10 : 1;

    // Drill RPM (SFM 500 for solid carbide drills)
    var drillRpm = Math.round(3.82 * 500 / drillDia);
    if (isFanuc) drillRpm = Math.min(drillRpm, FANUC_RPM_MAX);

    // Thread mill radii — use MAJOR thread diameter
    var rFinish = tmRound((majorDia - toolDia) / 2, 4);
    var rRough  = tmRound(rFinish - SPRING_STOCK, 4);

    // Step counter
    var stepN = 0;
    function nextStep() { stepN++; return 'N' + (stepN * 10); }

    var c    = [];
    var push = function() { for (var i=0;i<arguments.length;i++) c.push(arguments[i]); };
    var blank= function() { c.push(''); };
    var semi = function() { if (isFanuc) { c.push(';'); c.push(';'); } };
    var hdr  = function() { if (isFanuc) { push('G28 G91 W0. Z0.'); push('G00 G17 G40 G80 G90 G94'); } };

    // ── PROGRAM HEADER ──────────────────────────────────────
    push('%');
    push(progNum);
    push('(' + sizeLabel + ' THREAD MILL)');
    semi();
    blank();

    // Tool list
    if (doCenterDrill) push('(T4 H4 D4 - CENTER DRILL)');
    push('(T' + tPad + ' H' + tPad + ' D' + tPad + ' - ' + tmFmt(drillDia,3) + ' INCH DRILL)');
    if (doChamfer)     push('(T7 H7 D7 - 45 DEGREE CHAMFER)');
    push('(T' + tPad + ' H' + tPad + ' D' + tPad + ' - ' + tpi + ' TPI ' +
         (isSolid ? 'SOLID CARBIDE' : 'SINGLE POINT') + ' THREAD MILL)');
    semi();
    blank();

    if (isFanuc) {
        // ── FANUC ───────────────────────────────────────────

        // N1 — Center Drill
        if (doCenterDrill) {
            var nCD = nextStep();
            hdr();
            push('(CENTER DRILL)');
            push(nCD + ' (STEP) T4 M06');
            push('G00 G90 G54 S2200 M03');
            push('X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4) + ' B0.');
            push('G43 H4 ' + clr + ' T' + tPad);
            push('M08');
            push('G00 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
            push('W0.0');
            push(clr);
            push('G98 G81 Z-0.03 R0.1 F3.');
            push('G80');
            push('G00');
            if (doW) push('W0.0');
            push(clr);
            push('M05');
            push('M09');
            push('G91 G28 W0. Z0.');
            push('M01');
            semi();
        }

        // N2 — Drill
        var nDr = nextStep();
        var drillNextTool = doChamfer ? 'T7' : 'T' + tPad;
        hdr();
        push('(' + tmFmt(drillDia,3) + ' INCH DRILL)');
        push(nDr + ' (STEP) T' + tPad + ' M06');
        push('G00 G90 G54 S' + drillRpm + ' M03');
        push('X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4) + ' B0.');
        push('G43 H' + tPad + ' ' + clr + ' ' + drillNextTool);
        push('M07');
        push('G00 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
        push('W0.0');
        push(clr);
        push('G98 G81 Z-' + tmFmt(drillDepth,4) + ' R0.1 F' + tmFmtF(feed));
        push('G80');
        push('G00');
        if (doW) push('W0.0');
        push(clr);
        push('M05');
        push('M09');
        push('G91 G28 W0. Z0.');
        push('M01');
        semi();

        // N3 — Chamfer
        if (doChamfer) {
            var nCh = nextStep();
            hdr();
            push('(45 DEGREE CHAMFER)');
            push(nCh + ' (STEP) T7 M06');
            push('G00 G90 G54 S2200 M03');
            push('X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4) + ' B0.');
            push('G43 H7 ' + clr + ' T' + tPad);
            push('M08');
            tmChamferLines(cx, cy, drillDia, majorDia, doW, clr)
                .forEach(function(l) { push(l); });
            push('M05');
            push('M09');
            push('G91 G28 W0. Z0.');
            push('M01');
            semi();
        }

        // N4 — Thread Mill
        var nTm = nextStep();
        hdr();
        push('(' + tpi + ' TPI THREAD MILL)');
        push(nTm + ' (STEP) T' + tPad + ' M06');
        push('G00 G90 G54 S' + rpm + ' M03');
        push('X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4) + ' B0.');
        push('G43 H' + tPad + ' Z1. T4');
        push('M08');
        push('G00 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
        push('W0.0');
        push('Z1.');

        // Rough pass
        tmPass(cx, cy, threadDepth, tipOffset, pitch, rRough, toolNum, isSolid, doRamp, doW, feed)
            .forEach(function(l) { push(l); });

        // Finish pass
        tmPass(cx, cy, threadDepth, tipOffset, pitch, rFinish, toolNum, isSolid, doRamp, doW, feed)
            .forEach(function(l) { push(l); });

        push('M05');
        push('M09');
        push('G91 G28 W0. Z0.');
        push('M30');
        push('%');

    } else {
        // ── HAAS ────────────────────────────────────────────

        if (doCenterDrill) {
            push('(CENTER DRILL)');
            push('N10 T4 M06');
            push('M08');
            push('G00 G90 G54 S2500 M03');
            push('G43 H04 T' + tPad + ' X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
            push('Z1.');
            push('G81 G98 Z-0.03 R0.1 F3. L0');
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

        push('(' + tmFmt(drillDia,3) + ' INCH DRILL)');
        push('N20 T' + tPad + ' M06');
        push('G00 G90 G54 S' + drillRpm + ' M03');
        push('G43 H' + tPad + ' T' + (doChamfer ? '07' : tPad) + ' X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
        push('Z1.');
        push('M31');
        push('M88');
        push('G81 G98 Z-' + tmFmt(drillDepth,4) + ' R0.1 F' + tmFmtF(feed) + ' L0');
        push('G80');
        push('Z1.');
        push('M05');
        push('M09');
        push('G00 G90 M89');
        push('G28 G91 Z0.');
        push('G28 G91 Y0.');
        push('M01');
        blank();

        if (doChamfer) {
            push('(45 DEGREE CHAMFER)');
            push('N30 T7 M06');
            push('G00 G90 G54 S2200 M03');
            push('G43 H07 T' + tPad + ' X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
            push('Z1.');
            push('M08');
            tmChamferLines(cx, cy, drillDia, majorDia, false, 'Z1.')
                .forEach(function(l) { push(l); });
            push('M05');
            push('M09');
            push('G00 G90 M89');
            push('G28 G91 Z0.');
            push('G28 G91 Y0.');
            push('M01');
            blank();
        }

        push('(' + tpi + ' TPI THREAD MILL)');
        push('N40 T' + tPad + ' M06');
        push('G00 G90 G54 S' + rpm + ' M03');
        push('G43 H' + tPad + ' T4 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
        push('Z1.');
        push('M08');
        push('G00 X' + tmFmt(cx,4) + ' Y' + tmFmt(cy,4));
        push('Z1.');

        tmPass(cx, cy, threadDepth, tipOffset, pitch, rRough, toolNum, isSolid, doRamp, false, feed)
            .forEach(function(l) { push(l); });
        tmPass(cx, cy, threadDepth, tipOffset, pitch, rFinish, toolNum, isSolid, doRamp, false, feed)
            .forEach(function(l) { push(l); });

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

// ── SHELL INTEGRATION ────────────────────────────────────────
// Preserve bolt circle's onControlModeChange hook, add our own
var _prevOnControlModeChange = (typeof onControlModeChange === 'function')
    ? onControlModeChange : null;

window.onControlModeChange = function() {
    if (_prevOnControlModeChange) _prevOnControlModeChange();
    tmUpdateWAxis();
    // Re-clamp RPM for Fanuc
    if (tmThreadSize.value) {
        var t = TM_TABLE[tmThreadSize.value];
        if (t) {
            tmRpm.value = Math.min(t.rpm, window.controlMode === 'Fanuc' ? FANUC_RPM_MAX : 99999);
        }
        tmGenerate();
    }
};

// ── BOOT ─────────────────────────────────────────────────────
// Default tool number to T03
tmToolNum.value = '3';
tmUpdateWAxis();
lucide.createIcons();

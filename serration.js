// ============================================================
// G-FLOOR — SERRATION ENGINE v1
// Face + Serrate + Profile on raised face (6" cutter)
// Verified math against macro + CAD/CAM + hand-written examples
// ============================================================

// ── CONSTANTS ───────────────────────────────────────────────
const SR_FACE_CUTTER_DIA  = 6.0;      // hard-coded for v1
const SR_PASS_DEPTH       = 0.025;    // depth per roughing pass
const SR_SERRATION_STEP   = 0.050;    // radial stepover (full step = two half-arcs)
const SR_FINAL_PROFILE_Z  = -0.24;    // final profile depth
const SR_FINAL_FACE_Z     = 0.0;      // final face depth
const SR_SERRATION_Z      = -0.007;   // starting Z for ball endmill
const SR_HAAS_FACE_TOOL   = 16;
const SR_HAAS_BALL_TOOL   = 2;
const SR_FANUC_FACE_TOOL  = 33;
const SR_FANUC_BALL_TOOL  = 51;

// ── DOM REFERENCES ──────────────────────────────────────────
const srProgNum     = document.getElementById('sr-progNum');
const srIdDia       = document.getElementById('sr-idDia');
const srOdDia       = document.getElementById('sr-odDia');
const srNumPasses   = document.getElementById('sr-numPasses');
const srTotalRemove = document.getElementById('sr-totalRemove');
const srFaceToolNum = document.getElementById('sr-faceToolNum');
const srBallToolNum = document.getElementById('sr-ballToolNum');
const srOutputArea  = document.getElementById('sr-outputArea');
const srCopyBtn     = document.getElementById('sr-copyBtn');

// ── HELPERS ─────────────────────────────────────────────────
function srFmt(num, dec) {
    dec = (dec === undefined) ? 4 : dec;
    var s = parseFloat(num.toFixed(dec)).toString();
    return s.includes('.') ? s : s + '.0';
}

function srFmtProg(val) {
    var n = parseInt(val, 10);
    if (isNaN(n) || n < 0) n = 0;
    return 'O' + n.toString().padStart(4, '0');
}

function srRound(val, dec) {
    dec = (dec === undefined) ? 4 : dec;
    return parseFloat(val.toFixed(dec));
}

function srValidate(el) {
    if (!el.dataset.validate) return true;
    var val = el.value.trim();
    var valid = true;
    if (el.dataset.validate === 'numeric')  valid = /^\d+$/.test(val);
    if (el.dataset.validate === 'decimal')  valid = !isNaN(parseFloat(val)) && /^\d*\.?\d+$/.test(val);
    if (el.dataset.validate === 'posint')   valid = /^[1-9]\d*$/.test(val);
    el.classList.toggle('error', !valid);
    return valid;
}

// ── PASS COUNT LOGIC ────────────────────────────────────────
// Total Remove drives pass count when filled; spinner is the fallback.
// Both feed each other: editing Total Remove updates the spinner display.
function srCalcPassesFromRemoval(totalRemove) {
    if (!totalRemove || isNaN(totalRemove) || totalRemove <= 0) return null;
    return Math.ceil(totalRemove / SR_PASS_DEPTH);
}

function srOnTotalRemoveInput() {
    var val = parseFloat(srTotalRemove.value);
    var computed = srCalcPassesFromRemoval(val);
    if (computed !== null) {
        srNumPasses.value = computed;
        srNumPasses.readOnly = true;
        srNumPasses.style.opacity = '0.6';
    } else {
        srNumPasses.readOnly = false;
        srNumPasses.style.opacity = '';
    }
    srSaveInputs();
    srGenerate();
}

function srOnPassesInput() {
    // If user edits passes directly, clear total remove control
    srTotalRemove.value = '';
    srNumPasses.readOnly = false;
    srNumPasses.style.opacity = '';
    srSaveInputs();
    srGenerate();
}

// ── LOCALSTORAGE ────────────────────────────────────────────
function srSaveInputs() {
    localStorage.setItem('gfloor_sr_progNum',     srProgNum.value);
    localStorage.setItem('gfloor_sr_idDia',       srIdDia.value);
    localStorage.setItem('gfloor_sr_odDia',       srOdDia.value);
    localStorage.setItem('gfloor_sr_numPasses',   srNumPasses.value);
    localStorage.setItem('gfloor_sr_totalRemove', srTotalRemove.value);
    localStorage.setItem('gfloor_sr_faceTool',    srFaceToolNum.value);
    localStorage.setItem('gfloor_sr_ballTool',    srBallToolNum.value);
}

function srLoadInputs() {
    var isHaas = window.controlMode === 'Haas';
    srProgNum.value     = localStorage.getItem('gfloor_sr_progNum')     || '1000';
    srIdDia.value       = localStorage.getItem('gfloor_sr_idDia')       || '29.000';
    srOdDia.value       = localStorage.getItem('gfloor_sr_odDia')       || '33.750';
    srNumPasses.value   = localStorage.getItem('gfloor_sr_numPasses')   || '1';
    srTotalRemove.value = localStorage.getItem('gfloor_sr_totalRemove') || '';
    srFaceToolNum.value = localStorage.getItem('gfloor_sr_faceTool')    || (isHaas ? SR_HAAS_FACE_TOOL : SR_FANUC_FACE_TOOL);
    srBallToolNum.value = localStorage.getItem('gfloor_sr_ballTool')    || (isHaas ? SR_HAAS_BALL_TOOL  : SR_FANUC_BALL_TOOL);

    // Restore locked-spinner state if total remove was set
    var tr = parseFloat(srTotalRemove.value);
    if (!isNaN(tr) && tr > 0) {
        srNumPasses.readOnly = true;
        srNumPasses.style.opacity = '0.6';
    }
}

// ── MAIN GENERATOR ──────────────────────────────────────────
function srGenerate() {
    var inputs = [srProgNum, srIdDia, srOdDia, srNumPasses, srFaceToolNum, srBallToolNum];
    var ok = true;
    inputs.forEach(function(el) { if (!srValidate(el)) ok = false; });

    if (!ok || !srIdDia.value || !srOdDia.value) {
        srOutputArea.value = '(ENTER ID, OD, AND PASS COUNT)';
        return;
    }

    var isHaas    = window.controlMode === 'Haas';
    var isFanuc   = !isHaas;
    var progNum   = srFmtProg(srProgNum.value);
    var idDia     = parseFloat(srIdDia.value);
    var odDia     = parseFloat(srOdDia.value);
    var numPasses = Math.max(1, parseInt(srNumPasses.value, 10) || 1);
    var faceTool  = parseInt(srFaceToolNum.value, 10);
    var ballTool  = parseInt(srBallToolNum.value, 10);
    var clr       = isFanuc ? 'Z10.' : 'Z1.';
    var clrNum    = isFanuc ? 10.0 : 1.0;

    if (isNaN(faceTool)) faceTool = isHaas ? SR_HAAS_FACE_TOOL : SR_FANUC_FACE_TOOL;
    if (isNaN(ballTool)) ballTool = isHaas ? SR_HAAS_BALL_TOOL  : SR_FANUC_BALL_TOOL;

    // ── VERIFIED GEOMETRY ──────────────────────────────────
    // faceArcR: cutter center travels average of ID/2 and OD/2
    //   = (OD + ID) / 4
    // faceArcI: half of faceArcR (midpoint of the half-arc chord)
    var faceArcR = srRound((odDia + idDia) / 4, 4);
    var faceArcI = srRound(faceArcR / 2, 4);

    // serrInner / serrOuter: serration spiral bounds
    var serrInner = srRound((idDia - 0.5) / 2, 4);
    var serrOuter = srRound((odDia + 0.5) / 2, 4);

    // profileR: cutter center radius for OD profile
    //   = (OD + cutter diameter) / 2
    var profileR = srRound((odDia + SR_FACE_CUTTER_DIA) / 2, 4);

    // profileStandoff: safe X approach distance
    //   = profileR + 7  (gives 3.5" swing radius for arc-in move)
    var profileStandoff = srRound(profileR + 7.0, 4);
    // profile arc-in I value is always half of the 7" standoff offset
    var profileArcI = 3.5;

    var sizeLabel = idDia.toFixed(3) + '-' + odDia.toFixed(3) + ' SERRATION';

    // ── BUILDER UTILITIES ───────────────────────────────────
    var c = [];
    function push() {
        for (var i = 0; i < arguments.length; i++) c.push(arguments[i]);
    }
    function blank() { c.push(''); }
    function semi()  { if (isFanuc) { c.push(';'); c.push(';'); } }
    function hdr()   {
        if (isFanuc) {
            push('G28 G91 W0. Z0.');
            push('G00 G17 G40 G80 G90 G94');
        }
    }

    var stepN = 0;
    function nextStep() { stepN++; return 'N' + (stepN * 10); }

    // ── PASS DEPTH CALCULATOR ───────────────────────────────
    // Returns the Z depth for pass p (1-indexed) out of numPasses total.
    // Final pass always lands on finalZ; earlier passes step up by SR_PASS_DEPTH.
    function passZ(p, finalZ) {
        var stepsBack = numPasses - p;   // 0 on final pass
        return srRound(finalZ + stepsBack * SR_PASS_DEPTH, 4);
    }

    // ── HEADER ──────────────────────────────────────────────
    push('%');
    push(progNum);
    push('(' + sizeLabel + ')');
    semi();
    blank();
    push('(T' + faceTool.toString().padStart(2, '0') + ' - ' + SR_FACE_CUTTER_DIA + '" FACE MILL)');
    push('(T' + ballTool.toString().padStart(2, '0') + ' - 1/8 CARBIDE BALL)');
    semi();
    blank();

    // ════════════════════════════════════════════════════════
    // OPERATION 1 — FACE MILL
    // ════════════════════════════════════════════════════════
    hdr();
    push('(FACE MILL)');
    if (isFanuc) {
        push(nextStep() + ' (STEP) T' + faceTool + ' M06');
        push('G00 G90 G54 S318 M03');
        push('X0.0001 Y-0.001 B0.');
        push('G43 H' + faceTool + ' ' + clr + ' T' + ballTool);
        push('M08');
        push('G00 X0.0001 Y-0.001');
        push('W0.0');
        push(clr);
    } else {
        push('N10 T' + faceTool.toString().padStart(2, '0') + ' M06');
        push('G00 G90 G54 S318 M03');
        push('G43 H' + faceTool.toString().padStart(2, '0') + ' T' + ballTool.toString().padStart(2, '0') + ' X0. Y0.');
        push(clr);
        push('M08');
        push('G00 X0.0001 Y-0.001');
    }

    for (var p = 1; p <= numPasses; p++) {
        var fz = passZ(p, SR_FINAL_FACE_Z);
        // Rapid to just above this pass depth, then feed in
        var fzRapid = srRound(fz + (numPasses > 1 && p > 1 ? 0.1 : 0.1), 4);
        push('Z' + srFmt(fzRapid));
        push('G01 Z' + srFmt(fz) + ' F12.5 S318');
        push('Y0. F25.');
        // Four half-arcs: out-left, half-circle-right, half-circle-left, back-home
        push('G03 X-' + srFmt(faceArcR) + ' Y0. I-' + srFmt(faceArcI) + ' J0.');
        push('X' + srFmt(faceArcR) + ' Y0. I' + srFmt(faceArcR) + ' J0.');
        push('X-' + srFmt(faceArcR) + ' Y0. I-' + srFmt(faceArcR) + ' J0.');
        push('X0.0001 Y0. I' + srFmt(faceArcI) + ' J0.');
        push('G01 Y0.001');
        push('G00');
        if (isFanuc) push('W0.0');
        push(clr);
        if (p < numPasses) {
            // Reposition for next pass
            push('G00 X0.0001 Y-0.001');
            if (isFanuc) push('W0.0');
        }
    }

    push('M05');
    push('M09');
    if (isFanuc) push('G91 G28 W0. Z0.');
    else { push('G28 G91 Z0.'); push('G28 G91 Y0.'); }
    push('M01');
    semi();
    blank();

    // ════════════════════════════════════════════════════════
    // OPERATION 2 — SERRATION (1/8 CARBIDE BALL)
    // Archimedes spiral: CW half-arcs stepping outward 0.025" per arc
    // Two arcs per 0.05" radial step — verified against macro WHILE loop
    // ════════════════════════════════════════════════════════
    hdr();
    push('(SERRATION - 1/8 CARBIDE BALL)');
    if (isFanuc) {
        push(nextStep() + ' (STEP) T' + ballTool + ' M06');
        push('G00 G90 G54 S0 M03');
        push('X-' + srFmt(serrOuter) + ' Y0. B0.');
        push('G43 H' + ballTool + ' ' + clr + ' T' + faceTool);
        push('M08');
        push('G00 X-' + srFmt(serrOuter) + ' Y0.');
        push('W0.0');
        push(clr);
        push('Z0.1');
        push('G01 Z' + srFmt(SR_SERRATION_Z) + ' F40.');
        push('G05.1 Q1');
        push(';');
    } else {
        push('N20 T' + ballTool.toString().padStart(2, '0') + ' M06');
        push('G00 G90 G54 S9000 M03');
        push('G43 H' + ballTool.toString().padStart(2, '0') + ' T' + faceTool.toString().padStart(2, '0') + ' X0. Y0.');
        push(clr);
        push('M08');
        push('G00 X-' + srFmt(serrInner) + ' Y0.');
        push('Z0.1');
        push('G01 Z' + srFmt(SR_SERRATION_Z) + ' F40.');
    }

    // Spiral: starts at serrInner (on negative X side), steps outward
    // Each iteration = two G02 half-arcs = one full 0.05" radial step
    // Arc 1: moves +0.025" (toward positive X), midpoint I = currentR + 0.0125
    // Arc 2: moves -0.025" landing on negative side 0.05" further out,
    //         midpoint I = -(currentR + 0.0375)
    var currentR = serrInner;
    while (currentR < serrOuter - 0.0001) {
        var arc1X  = srRound( currentR + 0.025,  4);
        var arc1I  = srRound( currentR + 0.0125, 4);
        var arc2X  = srRound(-(currentR + 0.050), 4);
        var arc2I  = srRound(-(currentR + 0.0375), 4);
        push('G02 X' + srFmt(arc1X) + ' Y0. I' + srFmt(arc1I) + ' J0. F80.');
        push('G02 X' + srFmt(arc2X) + ' Y0. I' + srFmt(arc2I) + ' J0. F80.');
        currentR = srRound(currentR + SR_SERRATION_STEP, 4);
    }

    if (isFanuc) {
        push(';');
        push('G05.1 Q0');
    }
    push('G00');
    if (isFanuc) push('W0.0');
    push(clr);
    push('M05');
    push('M09');
    if (isFanuc) push('G91 G28 W0. Z0.');
    else { push('G28 G91 Z0.'); push('G28 G91 Y0.'); }
    push('M01');
    semi();
    blank();

    // ════════════════════════════════════════════════════════
    // OPERATION 3 — OD PROFILE (face mill, cutter comp G41)
    // Arc-in from standoff, two CW half-circles, arc-out
    // Verified against 33.75 OD real-world example
    // ════════════════════════════════════════════════════════
    hdr();
    push('(OD PROFILE - ' + SR_FACE_CUTTER_DIA + '" FACE MILL)');
    if (isFanuc) {
        push(nextStep() + ' (STEP) T' + faceTool + ' M06');
        push('G00 G90 G54 S318 M03');
        push('X-' + srFmt(profileStandoff) + ' Y0.001 B0.');
        push('G43 H' + faceTool + ' ' + clr);
        push('M08');
        push('G00 X-' + srFmt(profileStandoff) + ' Y0.001');
        push('W0.0');
        push(clr);
    } else {
        push('N30 T' + faceTool.toString().padStart(2, '0') + ' M06');
        push('G00 G90 G54 S318 M03');
        push('G43 H' + faceTool.toString().padStart(2, '0') + ' T' + ballTool.toString().padStart(2, '0') + ' X0. Y0.');
        push(clr);
        push('M08');
        push('G00 X-' + srFmt(profileStandoff) + ' Y0.001');
    }

    for (var p = 1; p <= numPasses; p++) {
        var pz       = passZ(p, SR_FINAL_PROFILE_Z);
        var pzRapid  = srRound(pz + 0.04, 4);
        push('Z' + srFmt(Math.min(pzRapid, clrNum)));
        push('Z' + srFmt(pzRapid));
        push('G01 Z' + srFmt(pz) + ' F12.5');
        push('G41 D' + faceTool.toString().padStart(2, '0') + ' Y0. F25.');
        // Arc in: CCW from standoff to profileR (swing = profileArcI radius)
        push('G03 X-' + srFmt(profileR) + ' Y0. I' + srFmt(profileArcI) + ' J0.');
        // Two CW half-circles covering the full OD
        push('G02 X' + srFmt(profileR) + ' Y0. I' + srFmt(profileR) + ' J0.');
        push('G02 X-' + srFmt(profileR) + ' Y0. I-' + srFmt(profileR) + ' J0.');
        // Arc out: CCW back to standoff
        push('G03 X-' + srFmt(profileStandoff) + ' Y0. I-' + srFmt(profileArcI) + ' J0.');
        push('G01 G40 Y-0.001');
        push('G00');
        if (isFanuc) push('W0.0');
        push(clr);
        if (p < numPasses) {
            push('G00 X-' + srFmt(profileStandoff) + ' Y0.001');
            if (isFanuc) push('W0.0');
        }
    }

    push('M05');
    push('M09');
    if (isFanuc) push('G91 G28 W0. Z0.');
    else { push('G28 G91 Z0.'); push('G28 G91 Y0.'); }
    push('G90');
    push('M30');
    push('%');

    srOutputArea.value = c.join('\n');
}

// ── COPY & DOWNLOAD ─────────────────────────────────────────
function srCopyToClipboard() {
    srOutputArea.select();
    document.execCommand('copy');
    var orig = srCopyBtn.innerHTML;
    srCopyBtn.innerHTML = '<i data-lucide="check"></i> Copied!';
    srCopyBtn.style.cssText = 'color:var(--bg-base);background-color:var(--accent);border-color:var(--accent);';
    lucide.createIcons();
    setTimeout(function() {
        srCopyBtn.innerHTML = orig;
        srCopyBtn.style = '';
        lucide.createIcons();
    }, 2000);
}

function srDownloadCode() {
    var content = srOutputArea.value;
    var blob = new Blob([content], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = srFmtProg(srProgNum.value) + '.NC';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── EVENT WIRING ────────────────────────────────────────────
[srProgNum, srIdDia, srOdDia, srFaceToolNum, srBallToolNum].forEach(function(el) {
    el.addEventListener('input', function() {
        srSaveInputs();
        srGenerate();
    });
});

srNumPasses.addEventListener('input', srOnPassesInput);
srTotalRemove.addEventListener('input', srOnTotalRemoveInput);

// ── SHELL INTEGRATION ───────────────────────────────────────
var _srPrevOnControlModeChange = (typeof onControlModeChange === 'function') ? onControlModeChange : null;

window.onControlModeChange = function() {
    if (_srPrevOnControlModeChange) _srPrevOnControlModeChange();
    var isHaas = window.controlMode === 'Haas';
    // Only reset tool numbers if they haven't been customized
    var savedFace = localStorage.getItem('gfloor_sr_faceTool');
    var savedBall = localStorage.getItem('gfloor_sr_ballTool');
    srFaceToolNum.value = savedFace || (isHaas ? SR_HAAS_FACE_TOOL : SR_FANUC_FACE_TOOL);
    srBallToolNum.value = savedBall || (isHaas ? SR_HAAS_BALL_TOOL  : SR_FANUC_BALL_TOOL);
    srGenerate();
};

// ── BOOT ────────────────────────────────────────────────────
srLoadInputs();
lucide.createIcons();
srGenerate();

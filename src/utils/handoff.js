'use strict';

const fs = require('fs');
const path = require('path');

const HANDOFF_PATH = path.join(process.cwd(), 'data', 'handoff.json');

function readMap() {
    try {
        if (!fs.existsSync(HANDOFF_PATH)) return {};
        const raw = fs.readFileSync(HANDOFF_PATH, 'utf8');
        return raw ? JSON.parse(raw) : {};
    } catch (_) {
        return {};
    }
}

function writeMap(map) {
    const dir = path.dirname(HANDOFF_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(HANDOFF_PATH, JSON.stringify(map, null, 2), 'utf8');
}

function isHandoff(waId) {
    const map = readMap();
    const val = map[waId];
    return Boolean(val && (val.active === undefined ? val : val.active));
}

function setHandoff(waId, enabled) {
    if (!waId) return;
    const map = readMap();
    if (enabled) {
        map[waId] = { active: true };
    } else {
        delete map[waId];
    }
    writeMap(map);
}

module.exports = {
    isHandoff,
    setHandoff,
};



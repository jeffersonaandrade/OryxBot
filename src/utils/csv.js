'use strict';

const fs = require('fs');
const path = require('path');

const CSV_HEADER = 'timestampIso,fromWaId,toWaId,userText,botText\n';
const CSV_PATH = path.join(process.cwd(), 'data', 'interactions.csv');

function ensureCsv() {
    const dir = path.dirname(CSV_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(CSV_PATH)) {
        fs.writeFileSync(CSV_PATH, CSV_HEADER, 'utf8');
    }
}

function escapeCsv(value) {
    const safe = String(value || '');
    if (/[",\n]/.test(safe)) {
        return '"' + safe.replace(/"/g, '""') + '"';
    }
    return safe;
}

function appendInteraction({ timestampIso, fromWaId, toWaId, userText, botText }) {
    ensureCsv();
    const row = [timestampIso, fromWaId, toWaId, userText, botText]
        .map(escapeCsv)
        .join(',') + '\n';
    fs.appendFileSync(CSV_PATH, row, 'utf8');
}

module.exports = {
    appendInteraction,
};



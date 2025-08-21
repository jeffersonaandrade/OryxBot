'use strict';

const fs = require('fs');
const path = require('path');

const AUDIT_PATH = path.join(process.cwd(), 'data', 'audit.jsonl');

function ensureFile() {
    const dir = path.dirname(AUDIT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(AUDIT_PATH)) fs.writeFileSync(AUDIT_PATH, '', 'utf8');
}

function appendAudit(event, payload) {
    try {
        ensureFile();
        const line = JSON.stringify({
            ts: new Date().toISOString(),
            event,
            ...payload,
        });
        fs.appendFileSync(AUDIT_PATH, line + '\n', 'utf8');
    } catch (_) {
        // best-effort logging
    }
}

module.exports = {
    appendAudit,
};



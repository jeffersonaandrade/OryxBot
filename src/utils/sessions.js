'use strict';

const fs = require('fs');
const path = require('path');

const SESSIONS_PATH = path.join(process.cwd(), 'data', 'sessions.json');
const INTRO_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const HANDOFF_OFFER_WINDOW_MS = 60 * 60 * 1000; // 1h para aceitar oferta

function readSessions() {
    try {
        if (!fs.existsSync(SESSIONS_PATH)) return {};
        const raw = fs.readFileSync(SESSIONS_PATH, 'utf8');
        return raw ? JSON.parse(raw) : {};
    } catch (_) {
        return {};
    }
}

function writeSessions(map) {
    const dir = path.dirname(SESSIONS_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(map, null, 2), 'utf8');
}

function shouldSendIntro(waId) {
    if (!waId) return false;
    const map = readSessions();
    const rec = map[waId];
    if (!rec || !rec.lastIntroAt) return true;
    const last = new Date(rec.lastIntroAt).getTime();
    return (Date.now() - last) >= INTRO_WINDOW_MS;
}

function markIntroSent(waId) {
    if (!waId) return;
    const map = readSessions();
    map[waId] = { ...(map[waId] || {}), lastIntroAt: new Date().toISOString() };
    writeSessions(map);
}

function setHandoffOffer(waId) {
    if (!waId) return;
    const map = readSessions();
    map[waId] = { ...(map[waId] || {}), handoffOfferAt: new Date().toISOString() };
    writeSessions(map);
}

function clearHandoffOffer(waId) {
    if (!waId) return;
    const map = readSessions();
    if (map[waId] && map[waId].handoffOfferAt) {
        delete map[waId].handoffOfferAt;
        writeSessions(map);
    }
}

function hasActiveHandoffOffer(waId) {
    if (!waId) return false;
    const map = readSessions();
    const rec = map[waId];
    if (!rec || !rec.handoffOfferAt) return false;
    const t = new Date(rec.handoffOfferAt).getTime();
    return (Date.now() - t) <= HANDOFF_OFFER_WINDOW_MS;
}

module.exports = {
    shouldSendIntro,
    markIntroSent,
    setHandoffOffer,
    clearHandoffOffer,
    hasActiveHandoffOffer,
};



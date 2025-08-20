'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const MiniSearch = require('minisearch');

const DEFAULT_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 800);
const DEFAULT_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 120);

function splitIntoChunks(text, chunkSize, overlap) {
    const chunks = [];
    let start = 0;
    const len = text.length;
    while (start < len) {
        const end = Math.min(start + chunkSize, len);
        const slice = text.slice(start, end);
        chunks.push(slice.trim());
        if (end === len) break;
        start = end - overlap;
        if (start < 0) start = 0;
    }
    return chunks.filter(Boolean);
}

function loadKnowledgeDocs(baseDir) {
    const dir = baseDir || path.join(process.cwd(), 'knowledge', 'faq');
    if (!fs.existsSync(dir)) {
        return [];
    }
    const files = glob.sync('**/*.{md,txt}', { cwd: dir, absolute: true });
    const docs = [];
    for (const filePath of files) {
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const chunks = splitIntoChunks(raw, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP);
            chunks.forEach((chunk, idx) => {
                docs.push({
                    id: `${path.basename(filePath)}:${idx}`,
                    file: path.basename(filePath),
                    content: chunk,
                });
            });
        } catch (_) {}
    }
    return docs;
}

function buildIndex(docs) {
    const miniSearch = new MiniSearch({
        fields: ['content', 'file'],
        storeFields: ['content', 'file', 'id'],
        searchOptions: {
            boost: { content: 2, file: 1 },
            prefix: true,
            fuzzy: 0.1,
        },
    });
    miniSearch.addAll(docs);
    return miniSearch;
}

function searchTopK(miniSearch, query, topK) {
    // Busca padrão do MiniSearch; os storeFields (content, file, id) vêm no resultado
    const results = miniSearch.search(query);
    return results.slice(0, topK).map(r => ({ id: r.id, file: r.file, content: r.content, score: r.score }));
}

function formatContext(snippets) {
    if (!snippets || snippets.length === 0) return '';
    const header = 'Contexto (trechos do FAQ):\n';
    return header + snippets.map((s, i) => `(${i + 1}) [${s.file}] ${s.content}`).join('\n\n');
}

class RAGService {
    constructor() {
        this.index = null;
        this.docs = [];
    }

    load(baseDir) {
        this.docs = loadKnowledgeDocs(baseDir);
        this.index = buildIndex(this.docs);
        return { numDocs: this.docs.length };
    }

    reload(baseDir) { return this.load(baseDir); }

    retrieve(query, topK) {
        if (!this.index) return [];
        const k = Number(topK || process.env.RAG_TOP_K || 3);
        return searchTopK(this.index, query, k);
    }

    buildPromptContext(query, topK) {
        const snippets = this.retrieve(query, topK);
        return {
            snippets,
            contextText: formatContext(snippets),
        };
    }
}

module.exports = {
    RAGService,
};



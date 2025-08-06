// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const Store = require('electron-store');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');

const store = new Store();

function startServer(dialog) {
    const app = express();
    const port = 3001;

    app.use(cors());
    app.use(express.json({ limit: '50mb' }));

    // --- Utility Functions ---
    const parseGlossaryEntry = (entryText) => {
        const lines = entryText.split('\n');
        const entry = {
            term: '', pinyin: '', category: '', chosenRendition: '',
            decisionRationale: '', excludedRendition: '', excludedRationale: '', notes: ''
        };
        lines.forEach(line => {
            const [key, ...valueParts] = line.split(': ');
            const value = valueParts.join(': ').trim();
            if (key && value) {
                const normalizedKey = key.trim().toLowerCase().replace(/_/g, '');
                switch (normalizedKey) {
                    case 'term': entry.term = value; break;
                    case 'pinyin': entry.pinyin = value; break;
                    case 'category': entry.category = value; break;
                    case 'chosenrendition': entry.chosenRendition = value; break;
                    case 'decisionrationale': entry.decisionRationale = value; break;
                    case 'excludedrendition': entry.excludedRendition = value; break;
                    case 'excludedrationale': entry.excludedRationale = value; break;
                    case 'notes': entry.notes = value; break;
                }
            }
        });
        return entry;
    };


    // --- API Endpoints ---
    app.get('/storage/:key', (req, res) => {
        const key = req.params.key;
        const data = store.get(key);
        res.json({ [key]: data });
    });

    app.post('/storage', (req, res) => {
        const { key, value } = req.body;
        store.set(key, value);
        res.status(200).json({ success: true });
    });

    // --- Filesystem Endpoints ---
    app.get('/fs/show-directory-picker', async (req, res) => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        res.json({ path: (canceled || !filePaths.length) ? null : filePaths[0] });
    });

    app.post('/fs/import-books', async (req, res) => {
        const { booksDirPath } = req.body;
        if (!booksDirPath) {
            return res.status(400).json({ error: 'Directory path is required.' });
        }

        const importedBooks = {};
        try {
            const bookFolders = await fsp.readdir(booksDirPath, { withFileTypes: true });
            for (const bookFolder of bookFolders.filter(d => d.isDirectory())) {
                const bookName = bookFolder.name;
                const bookPath = path.join(booksDirPath, bookName);
                const bookData = { glossary: {}, chapters: [], description: '', settings: {}, worldBuilding: {} };

                try { bookData.description = await fsp.readFile(path.join(bookPath, 'description.txt'), 'utf-8'); } catch (e) { /* ignore */ }
                try { bookData.settings = JSON.parse(await fsp.readFile(path.join(bookPath, 'settings.json'), 'utf-8')); } catch (e) { /* ignore */ }
                try { bookData.worldBuilding = JSON.parse(await fsp.readFile(path.join(bookPath, 'world-building.json'), 'utf-8')); } catch (e) { /* ignore */ }

                // --- NEW: Glossary Import Logic ---
                const glossaryJsonPath = path.join(bookPath, 'glossary.json');
                const glossaryTxtPath = path.join(bookPath, 'glossary.txt');

                if (fs.existsSync(glossaryJsonPath)) {
                    // 1. Prioritize glossary.json
                    const glossaryContent = await fsp.readFile(glossaryJsonPath, 'utf-8');
                    const glossaryArray = JSON.parse(glossaryContent);
                    // Convert array of objects to an object keyed by term
                    glossaryArray.forEach(entry => {
                        if (entry && entry.term) {
                            bookData.glossary[entry.term] = entry;
                        }
                    });
                } else if (fs.existsSync(glossaryTxtPath)) {
                    // 2. Fallback to glossary.txt, convert it, and save as .json
                    const glossaryContent = await fsp.readFile(glossaryTxtPath, 'utf-8');
                    glossaryContent.split('\n---\n').forEach(block => {
                        if (block.trim()) {
                            const entryObject = parseGlossaryEntry(block.trim());
                            if (entryObject.term) {
                                bookData.glossary[entryObject.term] = entryObject;
                            }
                        }
                    });
                    // Convert the glossary object to a JSON array and save it
                    try {
                        const glossaryArray = Object.values(bookData.glossary);
                        await fsp.writeFile(glossaryJsonPath, JSON.stringify(glossaryArray, null, 2), 'utf-8');
                        console.log(`Converted glossary.txt to glossary.json for book: ${bookName}`);
                    } catch (writeErr) {
                        console.error(`Could not write glossary.json for book: ${bookName}`, writeErr);
                    }
                }
                // --- END: Glossary Import Logic ---


                const chaptersPath = path.join(bookPath, 'chapters_translated');
                const chapterMap = new Map();

                if (fs.existsSync(chaptersPath)) {
                    const chapterFiles = await fsp.readdir(chaptersPath);
                    for (const chapterFile of chapterFiles) {
                        const title = path.basename(chapterFile, '.txt');
                        const content = await fsp.readFile(path.join(chaptersPath, chapterFile), 'utf-8');
                        chapterMap.set(title, { title, content });
                    }
                }
                bookData.chapters = Array.from(chapterMap.values());
                importedBooks[bookName] = bookData;
            }
            res.json(importedBooks);
        } catch (error) {
            console.error('Import failed:', error);
            res.status(500).json({ error: `Could not read the book directory. ${error.message}` });
        }
    });

    const server = app.listen(port, () => {
        console.log(`Express server with WebSocket support listening on http://localhost:${port}`);
    });

    // --- WebSocket Server Logic ---
    const wss = new WebSocketServer({ server });
    const clients = new Map();

    const broadcast = (message) => {
        const serializedMessage = JSON.stringify(message);
        for (const client of clients.values()) {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(serializedMessage);
            }
        }
    };

    const heartbeatInterval = setInterval(() => {
        for (const [clientId, client] of clients.entries()) {
            if (client.isAlive === false) {
                console.log(`Client ${client.name || clientId} is not responsive. Terminating connection.`);
                client.ws.terminate();
                continue;
            }
            client.isAlive = false;
            client.ws.ping();
        }
    }, 10000);

    wss.on('connection', (ws) => {
        const clientId = uuidv4();
        clients.set(clientId, { ws, id: clientId, isAlive: true });
        console.log(`Client ${clientId} connected.`);

        const broadcastClients = () => {
            const connectedClients = Array.from(clients.values()).map(c => ({ id: c.id, name: c.name }));
            broadcast({ type: 'client-list-update', payload: { connectedClients } });
        };

        broadcastClients();

        ws.on('pong', () => {
            const client = clients.get(clientId);
            if (client) {
                client.isAlive = true;
            }
        });

        ws.on('message', (message) => {
            try {
                const parsedMessage = JSON.parse(message);
                if (!parsedMessage.payload) parsedMessage.payload = {};
                parsedMessage.payload.clientId = clientId;

                if (parsedMessage.type === 'identify') {
                    const client = clients.get(clientId);
                    if (client) {
                        client.name = parsedMessage.payload.clientName;
                        client.type = parsedMessage.payload.clientType;
                        console.log(`Client ${clientId} identified as ${client.name}`);
                        broadcastClients();
                    }
                } else {
                    // For other message types, broadcast them
                    broadcast(parsedMessage);
                }
                console.log('Received message:', parsedMessage);

            } catch (error) {
                console.error('Failed to parse or process message:', error);
            }
        });

        ws.on('close', () => {
            const client = clients.get(clientId);
            console.log(`Client ${client ? client.name : clientId} disconnected.`);
            clients.delete(clientId);
            broadcastClients();
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error for client ${clientId}:`, error);
        });
    });

    wss.on('close', () => {
        clearInterval(heartbeatInterval);
    });
}

module.exports = { startServer };
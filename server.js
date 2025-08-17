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

// --- Robust Queue System ---
let translationQueue = [];      // Holds tasks waiting to be sent to the extension.
let currentlyTranslating = null; // Holds the single task the extension is currently processing.

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
    app.post('/fs/set-books-directory', (req, res) => {
        const { path } = req.body;
        if (path) {
            store.set('booksDirectoryPath', path);
            res.status(200).json({ success: true });
        } else {
            res.status(400).json({ error: 'A valid path is required.' });
        }
    });

    app.get('/fs/show-directory-picker', async (req, res) => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        res.json({ path: (canceled || !filePaths.length) ? null : filePaths[0] });
    });

    app.post('/fs/save-book', async (req, res) => {
        const { bookName, bookData } = req.body;
        const booksDirPath = store.get('booksDirectoryPath');
        if (!booksDirPath || !bookName) {
            return res.status(400).json({ error: 'Missing book directory path or book name.' });
        }

        const bookPath = path.join(booksDirPath, bookName);

        try {
            await fsp.mkdir(bookPath, { recursive: true });

            const writePromises = [];

            // Save description
            if (bookData.description != null) {
                writePromises.push(fsp.writeFile(path.join(bookPath, 'description.txt'), bookData.description, 'utf-8'));
            }

            // Save settings
            if (bookData.settings != null) {
                writePromises.push(fsp.writeFile(path.join(bookPath, 'settings.json'), JSON.stringify(bookData.settings, null, 2), 'utf-8'));
            }

            // Save world-building
            if (bookData.worldBuilding != null) {
                writePromises.push(fsp.writeFile(path.join(bookPath, 'world-building.json'), JSON.stringify(bookData.worldBuilding, null, 2), 'utf-8'));
            }

            // Save glossary (as a JSON array)
            if (bookData.glossary != null) {
                const glossaryArray = Object.values(bookData.glossary);
                writePromises.push(fsp.writeFile(path.join(bookPath, 'glossary.json'), JSON.stringify(glossaryArray, null, 2), 'utf-8'));
            }

            // Save raw chapters
            if (bookData.rawChapterData != null) {
                const rawChaptersPath = path.join(bookPath, 'chapters_raw');
                await fsp.mkdir(rawChaptersPath, { recursive: true });
                writePromises.push(fsp.writeFile(path.join(rawChaptersPath, '_raw_data.json'), JSON.stringify(bookData.rawChapterData, null, 2), 'utf-8'));
            }

            // Save translated chapters
            if (bookData.chapters != null) {
                const translatedChaptersPath = path.join(bookPath, 'chapters_translated');
                await fsp.mkdir(translatedChaptersPath, { recursive: true });
                for (const chapter of bookData.chapters) {
                    const safeFilename = chapter.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100) + '.json'; // Save as .json
                    // Create a clean chapter object for saving
                    const chapterJson = {
                        title: chapter.title,
                        sourceUrl: chapter.sourceUrl, // Ensure sourceUrl is saved
                        content: chapter.content
                    };
                    writePromises.push(fsp.writeFile(path.join(translatedChaptersPath, safeFilename), JSON.stringify(chapterJson, null, 2), 'utf-8'));
                }
            }


            await Promise.all(writePromises);
            res.status(200).json({ success: true, message: `Book "${bookName}" saved successfully.` });

        } catch (error) {
            console.error(`Failed to save book data for ${bookName}:`, error);
            res.status(500).json({ error: `Failed to write book data to disk for "${bookName}".` });
        }
    });


    app.post('/fs/create-book', async (req, res) => {
        const { bookName } = req.body;
        const booksDirPath = store.get('booksDirectoryPath');

        if (!booksDirPath) {
            return res.status(400).json({ error: 'Books directory path is not set.' });
        }
        if (!bookName) {
            return res.status(400).json({ error: 'Book name is required.' });
        }

        const newBookPath = path.join(booksDirPath, bookName);

        try {
            if (fs.existsSync(newBookPath)) {
                return res.status(409).json({ error: `A book folder named "${bookName}" already exists.` });
            }

            await fsp.mkdir(newBookPath, { recursive: true });
            // Also create the subdirectories
            await fsp.mkdir(path.join(newBookPath, 'chapters_raw'), { recursive: true });
            await fsp.mkdir(path.join(newBookPath, 'chapters_translated'), { recursive: true });
            await fsp.writeFile(path.join(newBookPath, 'settings.json'), JSON.stringify({}, null, 2), 'utf-8');

            console.log(`Created new book folder: ${newBookPath}`);
            res.status(201).json({ success: true, path: newBookPath });
        } catch (error) {
            console.error(`Failed to create book folder for ${bookName}:`, error);
            res.status(500).json({ error: 'Failed to create book folder on disk.' });
        }
    });

    app.post('/fs/import-books', async (req, res) => {
        const { booksDirPath } = req.body;
        if (!booksDirPath) {
            return res.status(400).json({ error: 'Directory path is required.' });
        }

        // Save the path for future file operations
        store.set('booksDirectoryPath', booksDirPath);

        const importedBooks = {};
        try {
            const bookFolders = await fsp.readdir(booksDirPath, { withFileTypes: true });
            for (const bookFolder of bookFolders.filter(d => d.isDirectory())) {
                const bookName = bookFolder.name;
                const bookPath = path.join(booksDirPath, bookName);
                const bookData = { glossary: {}, chapters: [], rawChapterData: [], description: '', settings: {}, worldBuilding: {} };

                try { bookData.description = await fsp.readFile(path.join(bookPath, 'description.txt'), 'utf-8'); } catch (e) { /* ignore */ }
                try { bookData.settings = JSON.parse(await fsp.readFile(path.join(bookPath, 'settings.json'), 'utf-8')); } catch (e) { /* ignore */ }
                try { bookData.worldBuilding = JSON.parse(await fsp.readFile(path.join(bookPath, 'world-building.json'), 'utf-8')); } catch (e) { /* ignore */ }

                // --- Import Raw Chapters ---
                const rawChaptersFilePath = path.join(bookPath, 'chapters_raw', '_raw_data.json');
                if (fs.existsSync(rawChaptersFilePath)) {
                    try {
                        const rawData = await fsp.readFile(rawChaptersFilePath, 'utf-8');
                        bookData.rawChapterData = JSON.parse(rawData);
                    } catch (e) { console.error(`Failed to load raw chapters for ${bookName}:`, e); }
                }

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
                        if (chapterFile.endsWith('.json')) { // Read .json files
                            const chapterContent = await fsp.readFile(path.join(chaptersPath, chapterFile), 'utf-8');
                            const chapterData = JSON.parse(chapterContent);
                            chapterMap.set(chapterData.title, chapterData);
                        } else if (chapterFile.endsWith('.txt')) { // Legacy .txt support
                            const title = path.basename(chapterFile, '.txt');
                            const content = await fsp.readFile(path.join(chaptersPath, chapterFile), 'utf-8');
                            chapterMap.set(title, { title, content, sourceUrl: null }); // No sourceUrl for old format
                        }
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

    app.post('/fs/delete-book', async (req, res) => {
        const { bookName } = req.body;
        if (!bookName) {
            return res.status(400).json({ error: 'Book name is required.' });
        }

        const booksDir = store.get('booksDirectoryPath');
        if (!booksDir) {
            return res.status(400).json({ error: 'Books directory path is not configured.' });
        }

        const bookPath = path.join(booksDir, bookName);

        try {
            // Use the promise-based `rm` from `fsp` which works with async/await.
            await fsp.rm(bookPath, { recursive: true, force: true });
            console.log(`SUCCESS: Successfully deleted directory: ${bookPath}`);
            res.json({ success: true, message: `Deleted book folder: ${bookName}` });
        } catch (error) {
            console.error(`FAILURE: Failed to delete folder at ${bookPath}`, error);
            res.status(500).json({ error: `Failed to delete folder: ${error.message}` });
        }
    });

    app.post('/fs/delete-raw-chapters', async (req, res) => {
        const { bookName } = req.body;
        const booksDirPath = store.get('booksDirectoryPath');

        if (!booksDirPath || !bookName) {
            return res.status(400).json({ error: 'Missing book directory path or book name.' });
        }

        const rawChaptersFilePath = path.join(booksDirPath, bookName, 'chapters_raw', '_raw_data.json');

        try {
            if (fs.existsSync(rawChaptersFilePath)) {
                await fsp.unlink(rawChaptersFilePath);
                console.log(`Deleted raw chapters file: ${rawChaptersFilePath}`);
                res.status(200).json({ success: true, message: `Raw chapters file for "${bookName}" deleted.` });
            } else {
                res.status(200).json({ success: true, message: 'Raw chapters file not found, nothing to delete.' });
            }
        } catch (error) {
            console.error(`Failed to delete raw chapters file for ${bookName}:`, error);
            res.status(500).json({ error: 'Failed to delete raw chapters file on disk.' });
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

    const sendToClient = (client, message) => {
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    };

    const getElectronApp = () => Array.from(clients.values()).find(c => c.type === 'electron-app');
    const getChromeExtension = () => Array.from(clients.values()).find(c => c.type === 'chrome-extension');

    const processTranslationQueue = () => {
        const chromeExtension = getChromeExtension();
        const electronApp = getElectronApp();

        // If a task is already running or the queue is empty, do nothing.
        if (currentlyTranslating || translationQueue.length === 0) {
            return;
        }

        // If the extension is not connected, notify the app and wait.
        if (!chromeExtension || chromeExtension.ws.readyState !== WebSocket.OPEN) {
            console.log('Chrome extension is offline. Task remains queued.');
            sendToClient(electronApp, {
                type: 'task_queued',
                payload: { text: 'Browser extension is offline. Request queued.' }
            });
            return;
        }

        // Move the next task from the queue to the 'currentlyTranslating' state.
        currentlyTranslating = translationQueue.shift();
        sendToClient(chromeExtension, currentlyTranslating);
        sendToClient(electronApp, { type: 'translation_started', payload: { sourceUrl: currentlyTranslating.payload.sourceUrl } });
        console.log(`Sent task to ${chromeExtension.name} for translation:`, currentlyTranslating.payload.title);
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

        const broadcastClientsListToApp = () => {
            const connectedClients = Array.from(clients.values()).map(c => ({ id: c.id, name: c.name }));
            sendToClient(getElectronApp(), { type: 'client-list-update', payload: { connectedClients } });
        };

        broadcast({ type: 'client-connected', payload: { clientId } });
        broadcastClientsListToApp();

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
                const senderClientId = parsedMessage.payload.clientId || clientId;
                const senderClient = clients.get(senderClientId);
                const electronApp = getElectronApp();

                switch (parsedMessage.type) {
                    case 'identify':
                        if (senderClient) {
                            if (parsedMessage.payload.clientType === 'chrome-extension') {
                                clients.forEach((c, id) => {
                                    if (c.type === 'chrome-extension' && id !== senderClientId) {
                                        c.ws.terminate();
                                        clients.delete(id);
                                        console.log(`Removed old Chrome extension client: ${id}`);
                                    }
                                });
                            }
                            senderClient.name = parsedMessage.payload.clientName;
                            senderClient.type = parsedMessage.payload.clientType;
                            console.log(`Client ${senderClientId} identified as ${senderClient.name} (${senderClient.type})`);
                            broadcastClientsListToApp();

                            if (senderClient.type === 'chrome-extension') {
                                console.log('Chrome extension connected. Processing any queued tasks...');
                                processTranslationQueue();
                            }
                        }
                        break;

                    case 'sync_pending_chapters':
                        const { pendingChapters } = parsedMessage.payload;
                        const chaptersToReset = [];

                        const activeChapterSourceUrls = new Set();
                        if (currentlyTranslating) {
                            activeChapterSourceUrls.add(currentlyTranslating.payload.sourceUrl);
                        }
                        translationQueue.forEach(task => {
                            activeChapterSourceUrls.add(task.payload.sourceUrl);
                        });

                        for (const chapter of pendingChapters) {
                            if (!activeChapterSourceUrls.has(chapter.sourceUrl)) {
                                chaptersToReset.push(chapter.sourceUrl);
                            }
                        }

                        if (chaptersToReset.length > 0) {
                            sendToClient(electronApp, {
                                type: 'reset_pending_status',
                                payload: { sourceUrls: chaptersToReset }
                            });
                        }
                        break;

                    case 'start_translation':
                        const sourceUrl = parsedMessage.payload.sourceUrl;
                        const isAlreadyQueued = translationQueue.some(task => task.payload.sourceUrl === sourceUrl);
                        const isCurrentlyTranslating = currentlyTranslating?.payload.sourceUrl === sourceUrl;

                        if (isAlreadyQueued || isCurrentlyTranslating) {
                            console.log(`Duplicate translation request rejected for: ${parsedMessage.payload.title}`);
                            sendToClient(electronApp, {
                                type: 'duplicate_translation_request',
                                payload: { title: parsedMessage.payload.title, sourceUrl: sourceUrl }
                            });
                        } else {
                            console.log(`Queuing task: ${parsedMessage.payload.title}`);
                            translationQueue.push(parsedMessage);
                            processTranslationQueue();
                        }
                        break;

                    case 'translation_complete':
                        console.log(`Translation complete for: ${parsedMessage.payload.newChapter.title}`);
                        currentlyTranslating = null; // Clear the currently active task
                        broadcast(parsedMessage); // Broadcast to the app
                        processTranslationQueue(); // Process the next item in the queue
                        break;

                    case 'translation_failed':
                        if (currentlyTranslating && currentlyTranslating.payload.sourceUrl === parsedMessage.payload.sourceUrl) {
                            console.error(`Translation failed for: ${parsedMessage.payload.title}. Re-queueing.`);
                            // Move the failed task back to the front of the queue
                            translationQueue.unshift(currentlyTranslating);
                            currentlyTranslating = null;
                            // Notify the app so it can update the UI
                            sendToClient(electronApp, parsedMessage);
                            // Attempt to process the next item (which might be the same one)
                            setTimeout(processTranslationQueue, 5000); // Wait 5s before retry
                        }
                        break;

                    default:
                        broadcast(parsedMessage);
                        break;
                }
                console.log('Received message:', parsedMessage.type);

            } catch (error) {
                console.error('Failed to parse or process message:', error);
            }
        });

        ws.on('close', (code, reason) => {
            const client = clients.get(clientId);
            const clientName = client ? (client.name || clientId) : clientId;
            const reasonString = reason.toString() || 'Normal closure';
            console.log(`Client ${clientName} disconnected. Reason: ${reasonString}`);
            clients.delete(clientId);

            broadcast({
                type: 'client-disconnected',
                payload: {
                    clientId: clientId,
                    clientName: clientName,
                    reason: reasonString
                }
            });
            broadcastClientsListToApp();
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
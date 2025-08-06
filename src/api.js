// src/api.js

const API_BASE_URL = 'http://localhost:3001';
let ws = null;
let messageHandler = null;
let reconnectInterval = 5000; // 5 seconds
let reconnectTimer = null;

const api = {
    connectWebSocket: (handler) => {
        // This function now returns a cleanup function, as is standard in useEffect.
        // It ensures that when a component unmounts, its specific listener is detached.
        messageHandler = handler;

        const connect = () => {
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            // Do not reconnect if a connection is already open or in the process of opening
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                console.log("WebSocket connect called, but connection is already open or connecting.");
                return;
            }

            ws = new WebSocket('ws://localhost:3001');

            ws.onopen = () => {
                console.log('WebSocket connected');
                if (messageHandler) messageHandler({ type: 'ws-status', payload: { status: 'connected' } });
                // Identify this client to the server as the main Electron app
                ws.send(JSON.stringify({
                    type: 'identify',
                    payload: {
                        clientName: 'electron-app',
                        clientType: 'electron-app'
                    }
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    // Only call the handler if it's still attached
                    if (messageHandler) {
                        messageHandler(message);
                    }
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected');
                if (messageHandler) messageHandler({ type: 'ws-status', payload: { status: 'disconnected' } });
                ws = null; // Clear the instance
                // Attempt to reconnect only if a handler is still present (i.e., not a manual cleanup)
                if (messageHandler && !reconnectTimer) {
                    reconnectTimer = setTimeout(connect, reconnectInterval);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                if (messageHandler) messageHandler({ type: 'ws-status', payload: { status: 'error' } });
                // The onclose event will be fired automatically by the browser after an error,
                // which will then trigger the reconnection logic.
                ws.close();
            };
        };

        connect();

        // The cleanup function returned to the useEffect hook
        return () => {
            console.log("Cleaning up WebSocket connection and listeners.");
            // Setting the handler to null prevents any further messages from being processed
            // by the unmounted component.
            messageHandler = null;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            if (ws) {
                // Remove the onclose listener to prevent the reconnection logic
                // from firing after a deliberate close.
                ws.onclose = null;
                ws.close();
                ws = null;
            }
        };
    },

    sendWebSocketMessage: (message) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        } else {
            console.error('WebSocket is not connected. Message not sent:', message);
            // Optionally, queue the message to be sent upon reconnection.
        }
    },

    getStorage: async (key) => {
        const response = await fetch(`${API_BASE_URL}/storage/${key}`);
        if (!response.ok) {
            throw new Error(`Failed to get data for key ${key}. Status: ${response.status}`);
        }
        return response.json();
    },

    setStorage: async (key, value) => {
        const response = await fetch(`${API_BASE_URL}/storage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
        });
        if (!response.ok) {
            throw new Error(`Failed to set data for key ${key}. Status: ${response.status}`);
        }
    },

    showDirectoryPicker: async () => {
        const response = await fetch(`${API_BASE_URL}/fs/show-directory-picker`);
        if (!response.ok) {
            throw new Error('Failed to open directory picker on the server.');
        }
        return response.json();
    },

    setBooksDirectory: async (path) => {
        const response = await fetch(`${API_BASE_URL}/fs/set-books-directory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        if (!response.ok) {
            throw new Error('Failed to set books directory on the server.');
        }
    },

    importBooks: async (booksDirPath) => {
        const response = await fetch(`${API_BASE_URL}/fs/import-books`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booksDirPath }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to import books: ${error.error}`);
        }
        return response.json();
    },

    createNewBook: async (bookName) => {
        const response = await fetch(`${API_BASE_URL}/fs/create-book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookName }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to create book: ${error.error}`);
        }
    },

    saveRawChapters: async (bookName, rawChapters) => {
        const response = await fetch(`${API_BASE_URL}/fs/save-raw-chapters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookName, rawChapters }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to save raw chapters: ${error.error}`);
        }
    }
};

export default api;
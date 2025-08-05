// A simple event emitter for our logging service
const events = new EventTarget();

export const logToPanel = (type, data) => {
    const logEntry = {
        type,
        payload: {
            source: 'application', // Differentiate from WebSocket messages
            timestamp: new Date().toISOString(),
            data,
        },
    };
    events.dispatchEvent(new CustomEvent('log', { detail: logEntry }));
};

export const onLog = (callback) => {
    const handler = (event) => callback(event.detail);
    events.addEventListener('log', handler);
    // Return a function to remove the listener
    return () => events.removeEventListener('log', handler);
};

import React, { useState, useRef, useLayoutEffect } from 'react';

const LogEntry = ({ log }) => {
    const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const summaryRef = useRef(null);

    const { type, payload } = log;
    const { timestamp, data, source, clientType, clientName, reason } = payload;

    const time = new Date(timestamp).toLocaleTimeString();

    const isDataExpandable = typeof data === 'object' && data !== null;

    let summary = type;
    if (source === 'application') {
        summary = typeof data === 'string' ? data : type;
    } else if (type === 'log-message') {
        summary = `Message from ${clientName || 'client'}`;
    } else if (type === 'client-disconnected') {
        summary = `Client ${clientName || 'unidentified'} disconnected. Reason: ${reason}`;
    } else if (type === 'client-connected') {
        summary = `Client ${clientName} connected.`;
    }

    useLayoutEffect(() => {
        if (summaryRef.current) {
            // Check if the text is wider than its container
            setIsOverflowing(summaryRef.current.scrollWidth > summaryRef.current.clientWidth);
        }
    }, [summary]);

    const canBeClicked = isDataExpandable || isOverflowing;

    const toggleExpansion = () => {
        // If it's expandable because of overflowing text, toggle the summary view
        if (isOverflowing) {
            setIsSummaryExpanded(!isSummaryExpanded);
        }
        // If it's expandable because of data, toggle the details view
        if (isDataExpandable) {
            setIsDetailsExpanded(!isDetailsExpanded);
        }
    };

    return (
        <div className="log-entry">
            <div
                className={`log-summary ${canBeClicked ? 'clickable' : ''}`}
                onClick={toggleExpansion}
            >
                <span className="log-time">[{time}]</span>
                <span
                    ref={summaryRef}
                    className={`log-type ${isSummaryExpanded ? 'expanded' : ''}`}
                    title={isOverflowing ? summary : ''}
                >
                    {summary}
                </span>
                {canBeClicked && (
                    <span className="log-caret">{isDetailsExpanded || isSummaryExpanded ? '▼' : '▶'}</span>
                )}
            </div>
            {isDetailsExpanded && (
                <div className="log-details">
                    <pre>{JSON.stringify(log, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

export default LogEntry;

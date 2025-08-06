import React from 'react';
import { diffChars } from 'diff';

const TranslationComparisonModal = ({ isOpen, onClose, onAccept, comparisonData }) => {
    if (!isOpen || !comparisonData) {
        return null;
    }

    const { oldChapter, newChapter, newGlossaryEntries } = comparisonData;

    const renderDiff = () => {
        // FIX: Consistently use 'translatedContent' and provide a fallback empty string.
        // The old code used 'content', which could be missing or undefined.
        const oldText = oldChapter.translatedContent || '';
        const newText = newChapter.translatedContent || '';
        const differences = diffChars(oldText, newText);
        return differences.map((part, index) => {
            const style = {
                backgroundColor: part.added ? '#2a472a' : part.removed ? '#5d2828' : 'transparent',
                padding: '1px 0',
                whiteSpace: 'pre-wrap', // Ensure line breaks are respected
            };
            return <span key={index} style={style}>{part.value}</span>;
        });
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content comparison-modal-content">
                <h2>Review Re-translation for: {newChapter.title}</h2>

                <div className="comparison-container">
                    <div className="comparison-pane">
                        <h3>Original Version</h3>
                        {/* FIX: Use 'translatedContent' for consistency and provide a fallback. */}
                        <div className="comparison-text">{oldChapter.translatedContent || ''}</div>
                    </div>
                    <div className="comparison-pane">
                        <h3>New Version (Diff)</h3>
                        <div className="comparison-text diff-view">{renderDiff()}</div>
                    </div>
                </div>

                {Object.keys(newGlossaryEntries).length > 0 && (
                    <div className="new-glossary-section">
                        <h3>New/Updated Glossary Entries That Will Be Saved</h3>
                        <pre>
                            {JSON.stringify(newGlossaryEntries, null, 2)}
                        </pre>
                    </div>
                )}

                <div className="modal-footer">
                    <button onClick={onClose} className="btn-secondary">Discard New Translation</button>
                    <button onClick={onAccept} className="btn-primary">Accept and Save New Translation</button>
                </div>
            </div>
        </div>
    );
};

export default TranslationComparisonModal;
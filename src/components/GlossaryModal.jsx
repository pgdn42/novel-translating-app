import React, { useState, useEffect } from 'react';

const EditableField = ({ label, value, onSave, type = 'text' }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [currentValue, setCurrentValue] = useState(value);

    useEffect(() => {
        setCurrentValue(value);
    }, [value]);

    const handleBlur = () => {
        if (currentValue !== value) {
            onSave(currentValue);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && type !== 'textarea') {
            handleBlur();
        } else if (e.key === 'Escape') {
            setCurrentValue(value);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        if (type === 'textarea') {
            return (
                <textarea
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    className="editable-textarea"
                    autoFocus
                />
            );
        }
        return (
            <input
                type="text"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="editable-input"
                autoFocus
            />
        );
    }

    return (
        <div onClick={() => setIsEditing(true)} className="editable-display" title="Click to edit">
            {value || <span className="placeholder-text">Click to add...</span>}
        </div>
    );
};


const GlossaryModal = ({ entry, onSave, onDelete, onClose }) => {
    const [editedEntry, setEditedEntry] = useState(entry);
    const [hasChanges, setHasChanges] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    useEffect(() => {
        setEditedEntry(entry);
        setHasChanges(false);
        setIsConfirmingDelete(false);
    }, [entry]);

    useEffect(() => {
        setHasChanges(JSON.stringify(entry) !== JSON.stringify(editedEntry));
    }, [entry, editedEntry]);

    const handleFieldSave = (field, value) => {
        setEditedEntry(prev => ({ ...prev, [field]: value }));
    };

    const handleSwapRenditions = () => {
        setEditedEntry(prev => ({
            ...prev,
            chosenRendition: prev.excludedRendition,
            decisionRationale: prev.excludedRationale,
            excludedRendition: prev.chosenRendition,
            excludedRationale: prev.decisionRationale,
        }));
    };

    if (!entry) {
        return null;
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content glossary-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="glossary-modal-header">
                    <h3>Glossary Entry</h3>
                </div>
                <div className="modal-body">
                    <div className="glossary-modal-grid">
                        <div className="glossary-modal-field">
                            <label>Term</label>
                            <EditableField value={editedEntry.term} onSave={(val) => handleFieldSave('term', val)} />
                        </div>
                        <div className="glossary-modal-field">
                            <label>Pinyin</label>
                            <EditableField value={editedEntry.pinyin} onSave={(val) => handleFieldSave('pinyin', val)} />
                        </div>
                        <div className="glossary-modal-field">
                            <label>Category</label>
                            <EditableField value={editedEntry.category} onSave={(val) => handleFieldSave('category', val)} />
                        </div>
                        <div className="glossary-modal-field">
                            <label>Chosen Rendition</label>
                            <EditableField value={editedEntry.chosenRendition} onSave={(val) => handleFieldSave('chosenRendition', val)} />
                        </div>
                        <div className="glossary-modal-field full-width">
                            <label>Decision Rationale</label>
                            <EditableField value={editedEntry.decisionRationale} onSave={(val) => handleFieldSave('decisionRationale', val)} type="textarea" />
                        </div>
                        <div className="glossary-modal-field">
                            <label>Excluded Rendition</label>
                            <EditableField value={editedEntry.excludedRendition} onSave={(val) => handleFieldSave('excludedRendition', val)} />
                        </div>
                        <div className="glossary-modal-field full-width">
                            <label>Excluded Rationale</label>
                            <EditableField value={editedEntry.excludedRationale} onSave={(val) => handleFieldSave('excludedRationale', val)} type="textarea" />
                        </div>
                        <div className="glossary-modal-field full-width">
                            <label>Notes</label>
                            <EditableField value={editedEntry.notes} onSave={(val) => handleFieldSave('notes', val)} type="textarea" />
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <div className="modal-footer-left">
                        <button onClick={handleSwapRenditions} className="btn-secondary">Swap Renditions</button>
                        {!isConfirmingDelete ? (
                            <button onClick={() => setIsConfirmingDelete(true)} className="btn-danger">Delete</button>
                        ) : (
                            <button onClick={() => onDelete(entry.term)} className="btn-danger-confirm">Confirm Delete</button>
                        )}
                        <button onClick={() => onSave(editedEntry)} className="btn-primary" disabled={!hasChanges}>Save</button>
                    </div>
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default GlossaryModal;
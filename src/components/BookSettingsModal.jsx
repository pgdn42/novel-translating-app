import React, { useState, useEffect } from 'react';

const BookSettingsModal = ({ settings, onClose, onSave }) => {
    const [editedSettings, setEditedSettings] = useState(settings || {});
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        setEditedSettings(settings || {});
        setHasChanges(false);
    }, [settings]);

    useEffect(() => {
        setHasChanges(JSON.stringify(settings) !== JSON.stringify(editedSettings));
    }, [settings, editedSettings]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setEditedSettings(prev => ({ ...prev, [name]: value }));
    };

    if (!settings) return null;

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content book-settings-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Book Settings</h3>
                <div className="modal-body">
                    <div className="settings-grid">
                        {Object.entries(editedSettings).map(([key, value]) => (
                            <div className="setting-field" key={key}>
                                <label htmlFor={key}>{key.replace(/_/g, ' ')}</label>
                                <input
                                    type="text"
                                    id={key}
                                    name={key}
                                    value={value}
                                    onChange={handleChange}
                                />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                    <button onClick={() => onSave(editedSettings)} className="btn-primary" disabled={!hasChanges}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default BookSettingsModal;
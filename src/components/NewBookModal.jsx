import React, { useState } from 'react';

const NewBookModal = ({ isOpen, onClose, onCreate, existingBookNames }) => {
    const [bookName, setBookName] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) {
        return null;
    }

    const handleCreate = () => {
        const trimmedName = bookName.trim();
        if (!trimmedName) {
            setError('Book name cannot be empty.');
            return;
        }
        if (existingBookNames.includes(trimmedName)) {
            setError(`A book named "${trimmedName}" already exists.`);
            return;
        }
        onCreate(trimmedName);
    };

    const handleClose = () => {
        setBookName('');
        setError('');
        onClose();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleCreate();
        } else if (e.key === 'Escape') {
            handleClose();
        }
    };

    return (
        // When the dark background (backdrop) is clicked, close the modal.
        <div className="modal-backdrop" onClick={handleClose}>
            {/* Clicks on the modal itself should not propagate to the backdrop.
                This prevents the modal from closing when you click on the input field.
                This is likely the core of the issue. */}
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>Create New Book</h3>
                <div className="modal-body">
                    <label htmlFor="new-book-name">Book Name:</label>
                    <input
                        type="text"
                        id="new-book-name"
                        value={bookName}
                        onChange={(e) => setBookName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter the name of the book"
                        // The autoFocus attribute tells the browser to automatically
                        // focus this field when the modal is rendered.
                        autoFocus
                    />
                    {error && <p className="modal-error">{error}</p>}
                </div>
                <div className="modal-footer">
                    <button onClick={handleClose} className="btn-secondary">Cancel</button>
                    <button onClick={handleCreate} className="btn-primary">Create</button>
                </div>
            </div>
        </div>
    );
};

export default NewBookModal;
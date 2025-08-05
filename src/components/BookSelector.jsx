import React from 'react';

const BookSelector = ({ books, activeBook, onAction }) => {
    const handleChange = (e) => {
        const value = e.target.value;
        if (value === '---create-new---') {
            onAction({ type: 'create' });
        } else if (value === '---import---') {
            onAction({ type: 'import' });
        } else {
            onAction({ type: 'select', payload: value });
        }
    };

    return (
        <select value={activeBook || ''} onChange={handleChange}>
            <option value="" disabled>
                Select a book...
            </option>
            {books.map((book) => (
                <option key={book} value={book}>
                    {book}
                </option>
            ))}
            <option value="" disabled>──────────</option>
            <option value="---create-new---">+ Create New Book</option>
            <option value="---import---">Import Books from Folder...</option>
        </select>
    );
};

export default BookSelector;

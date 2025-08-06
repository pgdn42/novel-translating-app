import React, { useState } from 'react';
import GlossaryModal from './GlossaryModal';

const parseGlossaryEntry = (entryText) => {
    const lines = entryText.split('\n');
    const entry = {
        term: '',
        pinyin: '',
        category: '',
        chosenRendition: '',
        decisionRationale: '',
        excludedRendition: '',
        excludedRationale: '',
        notes: ''
    };
    lines.forEach(line => {
        const [key, ...valueParts] = line.split(': ');
        const value = valueParts.join(': ');
        if (key && value) {
            if (key === 'Term') entry.term = value;
            if (key === 'Pinyin') entry.pinyin = value;
            if (key === 'Category') entry.category = value;
            if (key === 'Chosen_Rendition') entry.chosenRendition = value;
            if (key === 'Decision_Rationale') entry.decisionRationale = value;
            if (key === 'Excluded_Rendition') entry.excludedRendition = value;
            if (key === 'Excluded_Rationale') entry.excludedRationale = value;
            if (key === 'Notes') entry.notes = value;
        }
    });
    return entry;
};

const Glossary = ({ glossary, onUpdateEntry, onDeleteEntry }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedEntry, setSelectedEntry] = useState(null);

    const parsedGlossary = Object.values(glossary).map(parseGlossaryEntry);
    const categories = ['all', ...new Set(parsedGlossary.map(e => e.category).filter(Boolean))];

    const filteredGlossary = parsedGlossary.filter(entry => {
        const termMatch = entry.term && entry.term.toLowerCase().includes(searchTerm.toLowerCase());
        const renditionMatch = entry.chosenRendition && entry.chosenRendition.toLowerCase().includes(searchTerm.toLowerCase());
        const categoryMatch = selectedCategory === 'all' || entry.category === selectedCategory;
        return (termMatch || renditionMatch) && categoryMatch;
    });

    const handleEntryClick = (entry) => {
        setSelectedEntry(entry);
    };

    const handleCloseModal = () => {
        setSelectedEntry(null);
    };

    const handleSave = (updatedEntry) => {
        onUpdateEntry(selectedEntry.term, updatedEntry);
        handleCloseModal();
    };

    const handleDelete = (term) => {
        onDeleteEntry(term);
        handleCloseModal();
    };

    return (
        <div className="glossary-view">
            {selectedEntry && <GlossaryModal entry={selectedEntry} onSave={handleSave} onDelete={handleDelete} onClose={handleCloseModal} />}
            <h2>Glossary</h2>
            <div className="glossary-controls">
                <input
                    type="search"
                    placeholder="Search terms or renditions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                    {categories.map(category => (
                        <option key={category} value={category}>
                            {category === 'all' ? 'All Categories' : category}
                        </option>
                    ))}
                </select>
            </div>
            <div className="glossary-list">
                {filteredGlossary.length > 0 ? (
                    filteredGlossary.map((entry) => (
                        <div key={entry.term} className="glossary-item" onClick={() => handleEntryClick(entry)}>
                            <span className="glossary-term">{entry.term}</span>
                            <span className="glossary-rendition">{entry.chosenRendition}</span>
                        </div>
                    ))
                ) : (
                    <p>No glossary entries found.</p>
                )}
            </div>
        </div>
    );
};

export default Glossary;
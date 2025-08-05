import React from 'react';

const Glossary = ({ glossary }) => {
    const entries = Object.entries(glossary);

    if (entries.length === 0) {
        return <div>No glossary entries for this book.</div>;
    }

    return (
        <div className="glossary">
            <h2>Glossary</h2>
            <ul>
                {entries.map(([term, definition]) => (
                    <li key={term}>
                        <strong>{term}:</strong> {definition.split('\n')[3]?.replace('Chosen_Rendition: ', '')}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default Glossary;

// path: src/components/Glossary.jsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import GlossaryModal from './GlossaryModal';

// --- Constants for Grid Layout ---
const ITEM_HEIGHT = 95; // The height of each row, including vertical gap
const ITEM_MIN_WIDTH = 250; // The minimum width of a grid item
const ITEM_GAP = 15; // The gap between items, both horizontal and vertical

const Glossary = ({ glossary, onUpdateEntry, onDeleteEntry }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const containerRef = useRef(null);

    // --- Memoize the filtered glossary data ---
    const parsedGlossary = useMemo(() => Object.values(glossary), [glossary]);
    const categories = useMemo(() => ['all', ...new Set(parsedGlossary.map(e => e.category).filter(Boolean))], [parsedGlossary]);
    const filteredGlossary = useMemo(() => {
        // Reset scroll position when filters change for a better user experience
        if (containerRef.current) containerRef.current.scrollTop = 0;
        return parsedGlossary.filter(entry => {
            const lowerSearchTerm = searchTerm.toLowerCase();
            const termMatch = entry.term && entry.term.toLowerCase().includes(lowerSearchTerm);
            const renditionMatch = entry.chosenRendition && entry.chosenRendition.toLowerCase().includes(lowerSearchTerm);
            const categoryMatch = selectedCategory === 'all' || entry.category === selectedCategory;
            return (termMatch || renditionMatch) && categoryMatch;
        });
    }, [parsedGlossary, searchTerm, selectedCategory]);

    // --- Use a ResizeObserver to get the container's width for responsive columns ---
    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        const currentRef = containerRef.current;
        if (currentRef) {
            observer.observe(currentRef);
        }
        return () => {
            if (currentRef) {
                observer.unobserve(currentRef);
            }
        };
    }, []);

    const handleScroll = (e) => setScrollTop(e.currentTarget.scrollTop);

    // --- Virtualization Logic for the Grid ---
    const { virtualItems, totalHeight } = useMemo(() => {
        if (containerWidth === 0 || !containerRef.current) {
            return { virtualItems: [], totalHeight: 0 };
        }

        const numColumns = Math.max(1, Math.floor(containerWidth / (ITEM_MIN_WIDTH + ITEM_GAP)));
        const itemWidth = (containerWidth - (numColumns - 1) * ITEM_GAP) / numColumns;
        const totalItems = filteredGlossary.length;
        const totalRows = Math.ceil(totalItems / numColumns);
        const containerHeight = containerRef.current.clientHeight;
        const bufferRows = 3; // Render a few extra rows above and below

        const startRow = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - bufferRows);
        const endRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + bufferRows);
        const startIndex = startRow * numColumns;
        const endIndex = Math.min(totalItems, endRow * numColumns);

        const items = [];
        for (let i = startIndex; i < endIndex; i++) {
            const item = filteredGlossary[i];
            const row = Math.floor(i / numColumns);
            const col = i % numColumns;
            items.push({
                ...item,
                style: {
                    position: 'absolute',
                    top: `${row * ITEM_HEIGHT}px`,
                    left: `${col * (itemWidth + ITEM_GAP)}px`,
                    width: `${itemWidth}px`,
                    height: `${ITEM_HEIGHT - ITEM_GAP}px`, // Subtract gap to create margin effect
                },
            });
        }

        return {
            virtualItems: items,
            totalHeight: totalRows * ITEM_HEIGHT,
        };
    }, [filteredGlossary, scrollTop, containerWidth]);

    const handleEntryClick = (entry) => setSelectedEntry(entry);
    const handleCloseModal = () => setSelectedEntry(null);
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
            <div className="glossary-header">
                <h2>Glossary</h2>
                <div className="glossary-term-count">
                    Showing {filteredGlossary.length}/{parsedGlossary.length} terms
                </div>
            </div>
            <div className="glossary-controls">
                <input
                    type="search"
                    placeholder="Search terms or renditions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                    {categories.map(category => (
                        <option key={category} value={category}>{category}</option>
                    ))}
                </select>
            </div>
            <div ref={containerRef} className="glossary-list" onScroll={handleScroll}>
                {filteredGlossary.length > 0 ? (
                    <div style={{ position: 'relative', height: `${totalHeight}px` }}>
                        {virtualItems.map((entry) => (
                            <div key={entry.term} className="glossary-item" style={entry.style} onClick={() => handleEntryClick(entry)}>
                                <span className="glossary-term">{entry.term}</span>
                                <span className="glossary-rendition">{entry.chosenRendition}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p>No glossary entries found.</p>
                )}
            </div>
        </div>
    );
};

export default Glossary;
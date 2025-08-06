import React from 'react';

const ChapterView = ({ chapter, onBack, onPrevious, onNext, hasPrevious, hasNext }) => {
    if (!chapter) {
        return null;
    }

    return (
        <div className="chapter-view">
            <div className="chapter-header">
                <button onClick={onBack} className="back-button">&larr; Back</button>
                <h2>{chapter.title}</h2>
            </div>

            <div className="chapter-content-container">
                <div className="chapter-content">
                    {chapter.content.split('\n').map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                    ))}
                </div>
            </div>

            <div className="chapter-nav-container">
                <div className="chapter-nav">
                    <button onClick={onPrevious} disabled={!hasPrevious}>
                        Previous Chapter
                    </button>
                    <button onClick={onBack}>
                        Table of Contents
                    </button>
                    <button onClick={onNext} disabled={!hasNext}>
                        Next Chapter
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChapterView;
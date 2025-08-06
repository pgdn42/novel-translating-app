import React, { useState } from 'react';

const ChapterView = ({ chapter, onBack, onPrevious, onNext, onRetranslate, hasPrevious, hasNext }) => {
    const [autoTranslate, setAutoTranslate] = useState(false);

    if (!chapter) {
        return <div>Loading chapter...</div>;
    }

    const handleNextClick = () => {
        onNext(autoTranslate);
    };

    return (
        <div className="chapter-view">
            <div className="chapter-header">
                <button onClick={onBack} className="back-button">← Table of Contents</button>
                <h2>{chapter.title}</h2>
            </div>

            <div className="chapter-content-container">
                <div className="chapter-content" dangerouslySetInnerHTML={{ __html: chapter.content.replace(/\n/g, '<br />') }}>
                </div>
            </div>

            <div className="chapter-nav-container">
                <div className="chapter-nav">
                    <button onClick={onPrevious} disabled={!hasPrevious}>Previous Chapter</button>
                    <button onClick={onRetranslate}>Translate this Chapter</button>
                    <div className="auto-translate-control">
                        <input
                            type="checkbox"
                            id="autoTranslateCheckbox"
                            checked={autoTranslate}
                            onChange={(e) => setAutoTranslate(e.target.checked)}
                        />
                        <label htmlFor="autoTranslateCheckbox">Start new translation on next chapter</label>
                    </div>
                    <button onClick={handleNextClick} disabled={!hasNext}>Next Chapter</button>
                </div>
            </div>
        </div>
    );
};

export default ChapterView;
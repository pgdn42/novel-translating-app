import React, { useState } from 'react';
import RepeatIcon from '../assets/repeat-icon.svg';

const ChapterView = ({ chapter, onBack, onPrevious, onNext, onRetranslate, hasPrevious, hasNext }) => {
    const [autoTranslate, setAutoTranslate] = useState(false);

    const handleNextClick = () => {
        onNext(autoTranslate);
    };

    // Split the translated content by newlines to render paragraphs, ensuring it's never undefined.
    const paragraphs = (chapter.translatedContent || '').split('\n').filter(p => p.trim() !== '');

    return (
        <div className="chapter-view">
            <div className="chapter-header">
                <button onClick={onBack} className="back-button">Back</button>
                <h2>{chapter.title}</h2>
                <button onClick={onRetranslate} className="icon-button retranslate-button" title="Translate this chapter again">
                    <img src={RepeatIcon} alt="Retranslate" />
                </button>
            </div>

            <div className="chapter-content-container">
                <div className="chapter-content">
                    {paragraphs.length > 0 ? (
                        paragraphs.map((p, index) => (
                            <p key={index}>{p}</p>
                        ))
                    ) : (
                        <p>This chapter has not been translated yet.</p>
                    )}
                </div>
            </div>

            <div className="chapter-nav-container">
                <div className="chapter-nav">
                    <button onClick={onPrevious} disabled={!hasPrevious}>Previous Chapter</button>
                    <button onClick={onBack}>Table of Contents</button>
                    <button onClick={handleNextClick} disabled={!hasNext}>Next Chapter</button>
                    <div className="auto-translate-control">
                        <input
                            type="checkbox"
                            id="autoTranslateCheck"
                            checked={autoTranslate}
                            onChange={(e) => setAutoTranslate(e.target.checked)}
                        />
                        <label htmlFor="autoTranslateCheck">Auto-translate next</label>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChapterView;
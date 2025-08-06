import React, { useState, useEffect, useCallback } from 'react';
import Glossary from './components/Glossary';
import Translations from './components/Translations';
import WorldBuilding from './components/WorldBuilding';
import LogPanel from './components/LogPanel';
import NewBookModal from './components/NewBookModal';
import BookSettingsModal from './components/BookSettingsModal';
import TranslationComparisonModal from './components/TranslationComparisonModal';
import WelcomeScreen from './components/WelcomeScreen'; // Import the new component
import api from './api';
import { onLog, logToPanel } from './logService';
import LogIcon from './assets/log-icon.svg';

const App = () => {
  const [appData, setAppData] = useState({ activeBook: null, books: {} });
  const [currentView, setCurrentView] = useState('translations');
  const [currentChapter, setCurrentChapter] = useState(null);
  const [currentChapterList, setCurrentChapterList] = useState([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(-1);
  const [sortOrder, setSortOrder] = useState('desc');

  const [isLogVisible, setIsLogVisible] = useState(false);
  const [logWidth, setLogWidth] = useState(400);
  const [logMessages, setLogMessages] = useState([]);
  const [connectedClients, setConnectedClients] = useState([]);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [isNewBookModalOpen, setIsNewBookModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);

  // Debounce the save function to avoid rapid-fire saves to electron-store
  const debouncedSave = useCallback(
    debounce((data) => {
      api.setStorage('novelNavigatorData', data).catch(err => {
        console.error("Failed to save data:", err);
        logToPanel('error', 'Failed to save application data.');
      });
    }, 1000),
    []
  );

  const updateAppData = (newAppData) => {
    setAppData(newAppData);
    debouncedSave(newAppData);
  };

  const handleNewLog = useCallback((log) => {
    setLogMessages(prev => [...prev, log].slice(-100));
  }, []);

  const handleWebSocketMessage = useCallback((message) => {
    // Add timestamp and source to incoming WS messages for consistent logging
    if (!message.payload) message.payload = {};
    if (!message.payload.timestamp) {
      message.payload.timestamp = new Date().toISOString();
    }
    if (!message.payload.source) {
      message.payload.source = 'websocket';
    }

    handleNewLog(message);

    switch (message.type) {
      case 'ws-status':
        setWsStatus(message.payload.status);
        break;
      case 'client-list-update':
        setConnectedClients(message.payload.connectedClients);
        break;
      case 'save_raw_chapter_batch':
        const { bookKey, chapters, nextChapterUrl } = message.payload;
        setAppData(currentData => {
          const newAppData = JSON.parse(JSON.stringify(currentData)); // Deep copy
          const book = newAppData.books[bookKey];
          if (!book) return currentData;

          if (!book.rawChapterData) book.rawChapterData = [];

          const existingUrls = new Set(book.rawChapterData.map(c => c.sourceUrl));
          const newRawChapters = chapters.map(c => ({ ...c, translationStatus: 'untranslated' })).filter(c => !existingUrls.has(c.sourceUrl));

          let changed = false;
          if (newRawChapters.length > 0) {
            book.rawChapterData.push(...newRawChapters);
            api.saveRawChapters(bookKey, book.rawChapterData); // Persist to filesystem
            logToPanel('success', `Saved ${newRawChapters.length} new raw chapters for "${bookKey}".`);
            changed = true;
          }

          if (nextChapterUrl && book.settings.startUrl !== nextChapterUrl) {
            book.settings.startUrl = nextChapterUrl;
            logToPanel('info', `Updated next chapter URL for "${bookKey}".`);
            changed = true;
          }

          return changed ? newAppData : currentData;
        });
        break;
      case 'translation_complete':
        handleTranslationComplete(message.payload);
        break;
      default:
        break;
    }
  }, [handleNewLog]);

  const handleTranslationComplete = (payload) => {
    const { bookKey, newChapter, newGlossaryEntries } = payload;

    setAppData(currentData => {
      const newAppData = JSON.parse(JSON.stringify(currentData));
      const book = newAppData.books[bookKey];
      if (!book) return currentData;

      // Find the original raw chapter and mark it as completed
      const rawChapter = book.rawChapterData?.find(c => c.sourceUrl === newChapter.sourceUrl);
      if (rawChapter) {
        rawChapter.translationStatus = 'completed';
        api.saveRawChapters(bookKey, book.rawChapterData);
      }

      // Check if this is a re-translation
      const existingChapterIndex = book.chapters.findIndex(c => c.sourceUrl === newChapter.sourceUrl);
      if (existingChapterIndex !== -1) {
        // It's a re-translation, open comparison modal
        setComparisonData({
          bookKey,
          oldChapter: book.chapters[existingChapterIndex],
          newChapter,
          newGlossaryEntries
        });
        setIsComparisonModalOpen(true);
        return newAppData; // Don't save yet
      } else {
        // It's a brand new translation
        book.chapters.push(newChapter);
        Object.assign(book.glossary, newGlossaryEntries); // Merge glossary
        logToPanel('success', `New translation for "${newChapter.title}" saved.`);
      }

      return newAppData;
    });
  };

  const handleAcceptComparison = () => {
    if (!comparisonData) return;
    const { bookKey, newChapter, newGlossaryEntries } = comparisonData;

    setAppData(currentData => {
      const newAppData = JSON.parse(JSON.stringify(currentData));
      const book = newAppData.books[bookKey];
      if (!book) return currentData;

      // Find and replace the old chapter
      const chapterIndex = book.chapters.findIndex(c => c.sourceUrl === newChapter.sourceUrl);
      if (chapterIndex !== -1) {
        book.chapters[chapterIndex] = newChapter;
      }

      // Merge new glossary entries
      Object.assign(book.glossary, newGlossaryEntries);

      logToPanel('success', `Re-translation for "${newChapter.title}" accepted and saved.`);
      return newAppData;
    });

    setIsComparisonModalOpen(false);
    setComparisonData(null);
  };

  const handleStartTranslation = (bookKey, chapterToTranslate, isRetranslation = false) => {
    const book = appData.books[bookKey];
    if (!book || !chapterToTranslate) return;

    if (!isRetranslation) {
      logToPanel('info', `Starting translation for: ${chapterToTranslate.title}`);
    } else {
      logToPanel('info', `Starting re-translation for: ${chapterToTranslate.title}`);
    }

    // Generate chapter-specific glossary
    const chapterGlossary = {};
    for (const term in book.glossary) {
      if (chapterToTranslate.sourceContent.includes(term)) {
        chapterGlossary[term] = book.glossary[term];
      }
    }

    // Construct the prompt
    const prompt = `Translate the following chapter.
    
    Chapter-specific Glossary:
    ${JSON.stringify(chapterGlossary, null, 2)}
    
    Raw Chapter Text:
    ${chapterToTranslate.sourceContent}
    `;

    api.sendWebSocketMessage({
      type: 'start_translation',
      payload: {
        bookKey,
        prompt,
        sourceUrl: chapterToTranslate.sourceUrl,
      }
    });

    if (!isRetranslation) {
      // Mark raw chapter as pending
      setAppData(currentData => {
        const newAppData = { ...currentData };
        const rawChapter = newAppData.books[bookKey]?.rawChapterData?.find(c => c.sourceUrl === chapterToTranslate.sourceUrl);
        if (rawChapter) {
          rawChapter.translationStatus = 'pending';
          api.saveRawChapters(bookKey, newAppData.books[bookKey].rawChapterData);
        }
        return newAppData;
      });
    }
  };

  useEffect(() => {
    api.connectWebSocket(handleWebSocketMessage);
    const unsubscribe = onLog(handleNewLog);

    const fetchData = async () => {
      try {
        const data = await api.getStorage('novelNavigatorData');
        const loadedData = data.novelNavigatorData || { activeBook: null, books: {} };
        setAppData(loadedData);
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
        setAppData({ activeBook: null, books: {} });
      }
    };
    fetchData();

    return () => unsubscribe();
  }, [handleWebSocketMessage, handleNewLog]);

  // New effect to ensure the server knows the books directory on startup
  useEffect(() => {
    const setServerPath = async () => {
      const data = await api.getStorage('booksDirectoryPath');
      if (data.booksDirectoryPath) {
        api.setBooksDirectory(data.booksDirectoryPath);
      }
    };
    setServerPath();
  }, []);

  const handleBookAction = (action) => {
    switch (action.type) {
      case 'select':
        const newAppData = { ...appData, activeBook: action.payload };
        updateAppData(newAppData);
        setCurrentChapter(null);
        break;
      case 'create':
        handleCreateBookFlow();
        break;
      case 'import':
        handleImportBooks();
        break;
      case 'delete':
        handleDeleteBook(action.payload);
        break;
      default:
        break;
    }
  };

  const handleSendCommand = (commandString) => {
    logToPanel('info', `(local)> ${commandString}`);

    const parts = commandString.trim().split(/\s+/);
    const command = parts[0];
    const targetClientName = parts[1];

    const targetClient = connectedClients.find(c => c.name === targetClientName);
    if (!targetClient) {
      logToPanel('error', `Client "${targetClientName}" not found.`);
      return;
    }

    if (command === '/message') {
      const messageText = parts.slice(2).join(' ');
      if (messageText) {
        api.sendWebSocketMessage({
          type: 'direct-message',
          payload: {
            targetClientId: targetClient.id,
            message: messageText,
          }
        });
      } else {
        logToPanel('error', 'Cannot send an empty message.');
      }
    } else if (command === '/cancel') {
      api.sendWebSocketMessage({
        type: 'cancel-task',
        payload: {
          targetClientId: targetClient.id,
        }
      });
    } else {
      logToPanel('warning', `Unknown command: "${command}"`);
    }
  };

  const handleDeleteBook = (bookNameToDelete) => {
    const isConfirmed = window.confirm(`Are you sure you want to delete the book "${bookNameToDelete}"? This action cannot be undone.`);
    if (!isConfirmed) {
      return;
    }

    const newBooks = { ...appData.books };
    delete newBooks[bookNameToDelete];

    const newAppData = {
      ...appData,
      books: newBooks,
      activeBook: appData.activeBook === bookNameToDelete ? null : appData.activeBook,
    };

    updateAppData(newAppData);
    logToPanel('info', `Deleted book: "${bookNameToDelete}"`);
  };

  const handleCreateBookFlow = async () => {
    let booksDirData = await api.getStorage('booksDirectoryPath');
    let booksDir = booksDirData.booksDirectoryPath;

    if (!booksDir) {
      logToPanel('info', 'Please select a root directory to store your books.');
      const { path } = await api.showDirectoryPicker();
      if (path) {
        await api.setBooksDirectory(path);
        booksDir = path;
      } else {
        logToPanel('warning', 'Book creation cancelled. No directory selected.');
        return; // User cancelled directory selection
      }
    }

    setIsNewBookModalOpen(true);
  };

  const handleCreateBook = async (bookName) => {
    try {
      // First, tell the server to create the folder structure
      await api.createNewBook(bookName);

      // If successful, then update the app state
      const newBookData = {
        glossary: {},
        chapters: [],
        rawChapterData: [],
        description: '',
        settings: {},
        worldBuilding: { categories: [] }
      };
      const newAppData = {
        ...appData,
        books: {
          ...appData.books,
          [bookName]: newBookData
        },
        activeBook: bookName
      };
      updateAppData(newAppData);
      setIsNewBookModalOpen(false);
      logToPanel('info', `Created new book: "${bookName}"`);
    } catch (error) {
      console.error("Failed to create book:", error);
      logToPanel('error', `Failed to create book: ${error.message}`);
      // Optionally, inform the user in the modal as well
    }
  };

  const handleImportBooks = async () => {
    try {
      const { path } = await api.showDirectoryPicker();
      if (!path) return;

      // This is now the primary point for setting the path on the server
      await api.setBooksDirectory(path);
      logToPanel('info', `Set book directory on server: ${path}`);

      logToPanel('info', `Starting import from folder: ${path}`);
      const importedBooks = await api.importBooks(path);

      let newBooks = { ...appData.books };
      let importedCount = 0;
      for (const bookName in importedBooks) {
        newBooks[bookName] = importedBooks[bookName];
        importedCount++;
      }

      if (importedCount > 0) {
        const newAppData = { ...appData, books: newBooks };
        updateAppData(newAppData);
        logToPanel('success', `Successfully imported ${importedCount} book(s).`);
      } else {
        logToPanel('warning', 'No new books were found in the selected folder.');
      }

    } catch (error) {
      console.error("Import failed:", error);
      logToPanel('error', `Import failed: ${error.message}`);
    }
  };

  const handleBookTitleChange = (oldName, newName) => {
    if (!newName || newName === oldName) return;
    if (appData.books[newName]) {
      logToPanel('error', `A book named "${newName}" already exists.`);
      setAppData({ ...appData });
      return;
    }

    const newBooks = { ...appData.books };
    const bookData = newBooks[oldName];
    delete newBooks[oldName];
    newBooks[newName] = bookData;

    const newAppData = {
      ...appData,
      books: newBooks,
      activeBook: newName
    };
    updateAppData(newAppData);
    logToPanel('info', `Renamed book from "${oldName}" to "${newName}"`);
  };

  const handleDescriptionChange = (newDescription) => {
    if (!appData.activeBook) return;
    const newAppData = {
      ...appData,
      books: {
        ...appData.books,
        [appData.activeBook]: {
          ...appData.books[appData.activeBook],
          description: newDescription
        }
      }
    };
    updateAppData(newAppData);
  }

  const handleChapterSelect = (chapter, chapterList, index) => {
    setCurrentChapter(chapter);
    setCurrentChapterList(chapterList);
    setCurrentChapterIndex(index);
    setCurrentView('translations');
  };

  const handleDeleteChapter = (chapterSourceUrl) => {
    if (!appData.activeBook) return;

    setAppData(currentData => {
      const newAppData = JSON.parse(JSON.stringify(currentData));
      const book = newAppData.books[appData.activeBook];
      const chapterIndex = book.chapters.findIndex(c => c.sourceUrl === chapterSourceUrl);

      if (chapterIndex !== -1) {
        const chapterTitle = book.chapters[chapterIndex].title;
        book.chapters.splice(chapterIndex, 1);
        logToPanel('info', `Deleted chapter: "${chapterTitle}"`);
      }

      return newAppData;
    });
  };

  const handlePreviousChapter = () => {
    const newIndex = sortOrder === 'desc' ? currentChapterIndex + 1 : currentChapterIndex - 1;
    if (newIndex >= 0 && newIndex < currentChapterList.length) {
      setCurrentChapterIndex(newIndex);
      setCurrentChapter(currentChapterList[newIndex]);
    }
  };

  const handleNextChapter = (shouldStartNewTranslation) => {
    // Navigate to the next chapter in the reading sequence
    const newIndex = sortOrder === 'desc' ? currentChapterIndex - 1 : currentChapterIndex + 1;
    if (newIndex >= 0 && newIndex < currentChapterList.length) {
      setCurrentChapterIndex(newIndex);
      setCurrentChapter(currentChapterList[newIndex]);
    }

    // If the checkbox is checked, start translating the next untranslated chapter
    if (shouldStartNewTranslation) {
      const book = appData.books[appData.activeBook];
      if (!book.rawChapterData || book.rawChapterData.length === 0) {
        logToPanel('info', 'No raw chapters available to translate.');
        return;
      }

      // Find all URLs of chapters that are already translated
      const translatedUrls = new Set(book.chapters.map(c => c.sourceUrl));

      // Find all raw chapters that are not yet translated and not pending
      const untranslatedRawChapters = book.rawChapterData
        .filter(c => !translatedUrls.has(c.sourceUrl) && c.translationStatus !== 'pending')
        .map(c => ({ ...c, chapterNumber: parseInt(c.title.match(/(\d+)/)?.[0] || 0, 10) })) // Add chapter number for sorting
        .sort((a, b) => a.chapterNumber - b.chapterNumber); // Sort by chapter number

      if (untranslatedRawChapters.length > 0) {
        // The next chapter to translate is the first one in the sorted list
        const nextToTranslate = untranslatedRawChapters[0];
        handleStartTranslation(appData.activeBook, nextToTranslate);
      } else {
        logToPanel('info', 'All available raw chapters have been translated or are pending.');
      }
    }
  };

  const handleReturnToTOC = () => {
    setCurrentChapter(null);
    setCurrentChapterIndex(-1);
    setCurrentChapterList([]);
  };

  const handleScrapeChapters = () => {
    const activeBookData = appData.books[appData.activeBook];
    if (!activeBookData || !activeBookData.settings || !activeBookData.settings.startUrl) {
      logToPanel('error', 'No start URL configured for this book. Please add it in the book settings.');
      return;
    }
    logToPanel('info', `Requesting chapter scrape for "${appData.activeBook}"...`);
    api.sendWebSocketMessage({
      type: 'start_bulk_scrape',
      payload: {
        bookKey: appData.activeBook,
        settings: activeBookData.settings,
        startUrl: activeBookData.settings.startUrl,
      },
    });
  };

  const handleGlossaryEntryUpdate = (originalTerm, updatedEntry) => {
    if (!appData.activeBook) return;
    const newGlossary = { ...appData.books[appData.activeBook].glossary };

    if (originalTerm && originalTerm !== updatedEntry.term) {
      delete newGlossary[originalTerm];
    }
    newGlossary[updatedEntry.term] = updatedEntry;

    const newAppData = {
      ...appData,
      books: {
        ...appData.books,
        [appData.activeBook]: {
          ...appData.books[appData.activeBook],
          glossary: newGlossary
        }
      }
    };
    updateAppData(newAppData);
    logToPanel('success', `Glossary entry "${updatedEntry.term}" updated.`);
  };

  const handleGlossaryEntryDelete = (termToDelete) => {
    if (!appData.activeBook) return;
    const newGlossary = { ...appData.books[appData.activeBook].glossary };
    delete newGlossary[termToDelete];

    const newAppData = {
      ...appData,
      books: {
        ...appData.books,
        [appData.activeBook]: {
          ...appData.books[appData.activeBook],
          glossary: newGlossary
        }
      }
    };
    updateAppData(newAppData);
    logToPanel('info', `Glossary entry "${termToDelete}" deleted.`);
  };

  const handleSaveSettings = (newSettings) => {
    if (!appData.activeBook) return;
    const newAppData = {
      ...appData,
      books: {
        ...appData.books,
        [appData.activeBook]: {
          ...appData.books[appData.activeBook],
          settings: newSettings,
        },
      },
    };
    updateAppData(newAppData);
    setIsSettingsModalOpen(false);
    logToPanel('success', `Settings for "${appData.activeBook}" have been updated.`);
  };

  const activeBookData = appData.activeBook ? appData.books[appData.activeBook] : null;
  const rawChapterCount = activeBookData?.rawChapterData?.length || 0;

  const renderView = () => {
    if (!appData.activeBook || !activeBookData) {
      return <WelcomeScreen onCreate={handleCreateBookFlow} onImport={handleImportBooks} />;
    }

    switch (currentView) {
      case 'glossary':
        return <Glossary glossary={activeBookData.glossary || {}} onUpdateEntry={handleGlossaryEntryUpdate} onDeleteEntry={handleGlossaryEntryDelete} />;
      case 'translations':
        return <Translations
          books={Object.keys(appData.books)}
          activeBook={appData.activeBook}
          chapters={activeBookData.chapters || []}
          rawChapterCount={rawChapterCount}
          bookDescription={activeBookData.description || ''}
          onDescriptionChange={handleDescriptionChange}
          onBookTitleChange={handleBookTitleChange}
          onChapterSelect={handleChapterSelect}
          onDeleteChapter={handleDeleteChapter}
          onScrapeChapters={handleScrapeChapters}
          onStartTranslation={(...args) => handleStartTranslation(appData.activeBook, ...args)}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onDeleteBook={() => handleBookAction({ type: 'delete', payload: appData.activeBook })}
          onBookSelect={(book) => handleBookAction({ type: 'select', payload: book })}
          onImportBooks={() => handleBookAction({ type: 'import' })}
          currentChapter={currentChapter}
          currentChapterList={currentChapterList}
          currentChapterIndex={currentChapterIndex}
          onReturnToTOC={handleReturnToTOC}
          onPreviousChapter={handlePreviousChapter}
          onNextChapter={handleNextChapter}
        />;
      case 'world-building':
        return <WorldBuilding worldBuilding={activeBookData.worldBuilding || {}} />;
      default:
        return <Glossary glossary={activeBookData.glossary || {}} onUpdateEntry={handleGlossaryEntryUpdate} onDeleteEntry={handleGlossaryEntryDelete} />;
    }
  };

  return (
    <div className="app-container">
      <NewBookModal
        isOpen={isNewBookModalOpen}
        onClose={() => setIsNewBookModalOpen(false)}
        onCreate={handleCreateBook}
        existingBookNames={Object.keys(appData.books)}
      />
      {isSettingsModalOpen && (
        <BookSettingsModal
          settings={activeBookData?.settings}
          onClose={() => setIsSettingsModalOpen(false)}
          onSave={handleSaveSettings}
        />
      )}
      {isComparisonModalOpen && (
        <TranslationComparisonModal
          isOpen={isComparisonModalOpen}
          onClose={() => setIsComparisonModalOpen(false)}
          onAccept={handleAcceptComparison}
          comparisonData={comparisonData}
        />
      )}
      <div className="main-view" style={{ right: isLogVisible ? `${logWidth}px` : '0' }}>
        <nav className="nav-bar">
          <div className="nav-buttons">
            <button onClick={() => setCurrentView('translations')} className={currentView === 'translations' ? 'active' : ''}>
              Books
            </button>
            <button onClick={() => setCurrentView('glossary')} className={currentView === 'glossary' ? 'active' : ''}>Glossary</button>
            <button onClick={() => setCurrentView('world-building')} className={currentView === 'world-building' ? 'active' : ''}>
              World
            </button>
          </div>
          <div className="top-right-controls">
            <button onClick={() => setIsLogVisible(!isLogVisible)} className="log-icon-button">
              <img src={LogIcon} alt="Toggle Log" />
            </button>
          </div>
        </nav>
        <main className="main-content">{renderView()}</main>
      </div>
      {isLogVisible && (
        <LogPanel
          width={logWidth}
          setWidth={setLogWidth}
          logs={logMessages}
          clients={connectedClients}
          status={wsStatus}
          onSendCommand={handleSendCommand}
        />
      )}
    </div>
  );
};

// A simple debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export default App;
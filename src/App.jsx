import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const appDataRef = useRef(appData);

  useEffect(() => {
    appDataRef.current = appData;
  }, [appData]);

  // Debounce the save function to avoid rapid-fire saves
  const debouncedSave = useCallback(
    debounce((dataToSave) => {
      // 1. Save the entire app state to electron-store for quick startup
      api.setStorage('novelNavigatorData', dataToSave).catch(err => {
        console.error("Failed to save data to electron-store:", err);
        logToPanel('error', 'Failed to save application state.');
      });

      // 2. Persist the currently active book to the filesystem
      const activeBookName = dataToSave.activeBook;
      if (activeBookName && dataToSave.books[activeBookName]) {
        const activeBookData = dataToSave.books[activeBookName];
        api.saveBook(activeBookName, activeBookData).then(() => {
          logToPanel('info', `Book "${activeBookName}" saved to filesystem.`);
        }).catch(err => {
          console.error("Failed to save book to filesystem:", err);
          logToPanel('error', `Failed to save "${activeBookName}" to filesystem.`);
        });
      }
    }, 2000),
    []
  );

  const updateAppData = (updater) => {
    setAppData(currentData => {
      const newData = typeof updater === 'function' ? updater(currentData) : updater;
      debouncedSave(newData);
      return newData;
    });
  };


  const handleNewLog = useCallback((log) => {
    setLogMessages(prev => [...prev, log].slice(-200));
  }, []);

  const handleWebSocketMessage = useCallback((message) => {
    if (!message.payload) message.payload = {};
    if (!message.payload.timestamp) {
      message.payload.timestamp = new Date().toISOString();
    }
    if (!message.payload.source) {
      message.payload.source = 'websocket';
    }

    // Prevents double-logging for translation_complete events
    if (message.type !== 'translation_complete') {
      handleNewLog(message);
    }


    switch (message.type) {
      case 'ws-status':
        setWsStatus(message.payload.status);
        break;
      case 'client-list-update':
        setConnectedClients(message.payload.connectedClients);
        break;
      case 'save_raw_chapter_batch':
        updateAppData(currentData => {
          const { bookKey, chapters, nextChapterUrl } = message.payload;
          const newAppData = JSON.parse(JSON.stringify(currentData));
          const book = newAppData.books[bookKey];
          if (!book) return currentData;

          if (!book.rawChapterData) book.rawChapterData = [];

          const existingUrls = new Set(book.rawChapterData.map(c => c.sourceUrl));
          const newRawChapters = chapters.map(c => ({ ...c, translationStatus: 'untranslated' })).filter(c => !existingUrls.has(c.sourceUrl));

          let changed = false;
          if (newRawChapters.length > 0) {
            book.rawChapterData.push(...newRawChapters);
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

  const parseGlossaryText = (text) => {
    if (typeof text !== 'string' || !text.trim()) {
      return {};
    }
    const entries = {};
    const blocks = text.split(/\n---\n/).filter(b => b.trim());

    for (const block of blocks) {
      const entry = {
        term: '', pinyin: '', category: '', chosenRendition: '',
        decisionRationale: '', excludedRendition: '', excludedRationale: '', notes: ''
      };
      const lines = block.trim().split('\n');
      let termFound = false;

      for (const line of lines) {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex === -1) continue;

        const key = line.slice(0, separatorIndex);
        const value = line.slice(separatorIndex + 1).trim();

        if (key && value) {
          const normalizedKey = key.trim().toLowerCase().replace(/_/g, '');
          switch (normalizedKey) {
            case 'term':
              entry.term = value;
              termFound = true;
              break;
            case 'pinyin': entry.pinyin = value; break;
            case 'category': entry.category = value; break;
            case 'chosenrendition': entry.chosenRendition = value; break;
            case 'decisionrationale': entry.decisionRationale = value; break;
            case 'excludedrendition': entry.excludedRendition = value; break;
            case 'excludedrationale': entry.excludedRationale = value; break;
            case 'notes': entry.notes = value; break;
          }
        }
      }

      if (termFound) {
        entries[entry.term] = entry;
      }
    }
    return entries;
  };


  const handleTranslationComplete = (payload) => {
    const { bookKey, newChapter, newGlossaryEntries } = payload;
    const parsedGlossary = parseGlossaryText(newGlossaryEntries);

    updateAppData(currentData => {
      const newAppData = JSON.parse(JSON.stringify(currentData));
      const book = newAppData.books[bookKey];
      if (!book) return currentData;

      const existingChapterIndex = book.chapters.findIndex(c => c.sourceUrl === newChapter.sourceUrl);

      if (existingChapterIndex !== -1) {
        // This is a re-translation, so we open the comparison modal
        // without saving the glossary changes yet.
        setComparisonData({
          bookKey,
          oldChapter: book.chapters[existingChapterIndex],
          newChapter,
          newGlossaryEntries: parsedGlossary // Pass the parsed glossary to the modal
        });
        setIsComparisonModalOpen(true);
        logToPanel('info', `Re-translation for "${newChapter.title}" ready for review.`);
        // Return the original data without changes for now
        return currentData;
      } else {
        // This is a new translation, so we save everything.
        if (!book.glossary) book.glossary = {};
        Object.assign(book.glossary, parsedGlossary);
        const newEntryCount = Object.keys(parsedGlossary).length;
        if (newEntryCount > 0) {
          logToPanel('success', `Added/updated ${newEntryCount} glossary entries for "${bookKey}".`);
        }

        const rawChapter = book.rawChapterData?.find(c => c.sourceUrl === newChapter.sourceUrl);
        if (rawChapter) {
          rawChapter.translationStatus = 'completed';
        }

        book.chapters.push(newChapter);
        logToPanel('success', `New translation for "${newChapter.title}" received and saved.`);
        return newAppData;
      }
    });
  };


  const handleAcceptComparison = () => {
    if (!comparisonData) return;
    const { bookKey, newChapter, newGlossaryEntries } = comparisonData;

    updateAppData(currentData => {
      const newAppData = JSON.parse(JSON.stringify(currentData));
      const book = newAppData.books[bookKey];
      if (!book) return currentData;

      // Save the new glossary entries
      if (!book.glossary) book.glossary = {};
      Object.assign(book.glossary, newGlossaryEntries);

      // Save the new chapter content
      const chapterIndex = book.chapters.findIndex(c => c.sourceUrl === newChapter.sourceUrl);
      if (chapterIndex !== -1) {
        book.chapters[chapterIndex] = newChapter;
      }

      logToPanel('success', `Re-translation for "${newChapter.title}" accepted and saved.`);
      return newAppData;
    });

    // If the accepted chapter is the one currently being viewed, update it immediately.
    if (currentChapter && currentChapter.sourceUrl === newChapter.sourceUrl) {
      setCurrentChapter(newChapter);
    }

    setIsComparisonModalOpen(false);
    setComparisonData(null);
  };


  const handleStartTranslation = (bookKey, chapterToTranslate, isRetranslation = false) => {
    const book = appData.books[bookKey];
    if (!book || !chapterToTranslate) return;

    let sourceContent = chapterToTranslate.sourceContent;

    if (isRetranslation) {
      logToPanel('info', `Starting re-translation for: ${chapterToTranslate.title}`);
      const rawChapter = book.rawChapterData?.find(c => c.sourceUrl === chapterToTranslate.sourceUrl);
      if (!rawChapter) {
        logToPanel('error', `Could not find raw chapter data for re-translation of "${chapterToTranslate.title}".`);
        return;
      }
      sourceContent = rawChapter.sourceContent;
    } else {
      logToPanel('info', `Starting translation for: ${chapterToTranslate.title}`);
    }

    if (!sourceContent) {
      logToPanel('error', `No source content found for chapter "${chapterToTranslate.title}".`);
      return;
    }

    const chapterGlossary = {};
    for (const term in book.glossary) {
      if (sourceContent.includes(term)) {
        chapterGlossary[term] = book.glossary[term];
      }
    }

    const prompt = `Translate the following chapter.
    
    Chapter-specific Glossary:
    ${JSON.stringify(chapterGlossary, null, 2)}
    
    Raw Chapter Text:
    ${sourceContent}
    `;

    api.sendWebSocketMessage({
      type: 'start_translation',
      payload: {
        bookKey,
        prompt,
        title: chapterToTranslate.title,
        sourceUrl: chapterToTranslate.sourceUrl,
      }
    });

    if (!isRetranslation) {
      updateAppData(currentData => {
        const newAppData = { ...currentData };
        const rawChapter = newAppData.books[bookKey]?.rawChapterData?.find(c => c.sourceUrl === chapterToTranslate.sourceUrl);
        if (rawChapter) {
          rawChapter.translationStatus = 'pending';
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
        // Load cached state first to get activeBook, etc.
        const storedAppData = await api.getStorage('novelNavigatorData');
        const cachedData = storedAppData.novelNavigatorData || { activeBook: null, books: {} };

        // Then, check for the books directory, which is the source of truth
        const pathData = await api.getStorage('booksDirectoryPath');
        const booksDir = pathData.booksDirectoryPath;

        if (booksDir) {
          logToPanel('info', `Loading books from saved directory: ${booksDir}`);
          // Set directory on server in case it's not set
          await api.setBooksDirectory(booksDir);

          const booksFromFS = await api.importBooks(booksDir);

          const finalData = {
            ...cachedData,
            books: booksFromFS,
          };

          // Validate that the cached activeBook still exists
          if (finalData.activeBook && !booksFromFS[finalData.activeBook]) {
            logToPanel('warning', `Cached active book "${finalData.activeBook}" not found. Resetting.`);
            finalData.activeBook = Object.keys(booksFromFS)[0] || null;
          }

          setAppData(finalData);

        } else {
          // If no directory is set, just rely on the cache
          logToPanel('info', 'No book directory set. Loading from cache.');
          setAppData(cachedData);
        }
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
        logToPanel('error', `Failed to fetch initial data: ${error.message}`);
        // Fallback to a clean state
        setAppData({ activeBook: null, books: {} });
      }
    };

    fetchData();

    return () => unsubscribe();
  }, [handleWebSocketMessage, handleNewLog]);

  const handleBookAction = (action) => {
    switch (action.type) {
      case 'select':
        updateAppData({ ...appData, activeBook: action.payload });
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
    updateAppData(currentData => {
      const newBooks = { ...currentData.books };
      delete newBooks[bookNameToDelete];

      const remainingBookNames = Object.keys(newBooks);
      let newActiveBook = currentData.activeBook;

      if (currentData.activeBook === bookNameToDelete) {
        newActiveBook = remainingBookNames.length > 0 ? remainingBookNames[0] : null;
        setCurrentChapter(null);
        setCurrentChapterIndex(-1);
        setCurrentChapterList([]);
      }
      logToPanel('info', `Deleted book: "${bookNameToDelete}"`);
      return {
        ...currentData,
        books: newBooks,
        activeBook: newActiveBook,
      };
    });
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
        return;
      }
    }

    setIsNewBookModalOpen(true);
  };

  const handleCreateBook = async (bookName) => {
    try {
      await api.createNewBook(bookName);
      const newBookData = {
        glossary: {},
        chapters: [],
        rawChapterData: [],
        description: '',
        settings: {},
        worldBuilding: { categories: [] }
      };
      updateAppData(currentData => ({
        ...currentData,
        books: {
          ...currentData.books,
          [bookName]: newBookData
        },
        activeBook: bookName
      }));
      setIsNewBookModalOpen(false);
      logToPanel('info', `Created new book: "${bookName}"`);
    } catch (error) {
      console.error("Failed to create book:", error);
      logToPanel('error', `Failed to create book: ${error.message}`);
    }
  };

  const handleImportBooks = async () => {
    try {
      const { path } = await api.showDirectoryPicker();
      if (!path) return;

      await api.setBooksDirectory(path);
      logToPanel('info', `Set book directory on server: ${path}`);

      logToPanel('info', `Starting import from folder: ${path}`);
      const importedBooks = await api.importBooks(path);

      let importedCount = 0;
      let firstImportedBook = null;

      updateAppData(currentData => {
        let newBooks = { ...currentData.books };
        for (const bookName in importedBooks) {
          if (!firstImportedBook) {
            firstImportedBook = bookName;
          }
          newBooks[bookName] = importedBooks[bookName];
          importedCount++;
        }

        if (importedCount > 0) {
          const newAppData = { ...currentData, books: newBooks };
          if (!newAppData.activeBook && firstImportedBook) {
            newAppData.activeBook = firstImportedBook;
          }
          logToPanel('success', `Successfully imported ${importedCount} book(s).`);
          return newAppData
        } else {
          logToPanel('warning', 'No new books were found in the selected folder.');
          return currentData;
        }
      })
    } catch (error) {
      console.error("Import failed:", error);
      logToPanel('error', `Import failed: ${error.message}`);
    }
  };

  const handleBookTitleChange = (oldName, newName) => {
    if (!newName || newName === oldName) return;
    if (appData.books[newName]) {
      logToPanel('error', `A book named "${newName}" already exists.`);
      return;
    }
    updateAppData(currentData => {
      const newBooks = { ...currentData.books };
      const bookData = newBooks[oldName];
      delete newBooks[oldName];
      newBooks[newName] = bookData;
      logToPanel('info', `Renamed book from "${oldName}" to "${newName}"`);
      return {
        ...currentData,
        books: newBooks,
        activeBook: newName
      }
    });
  };

  const handleDescriptionChange = (newDescription) => {
    if (!appData.activeBook) return;
    updateAppData(currentData => ({
      ...currentData,
      books: {
        ...currentData.books,
        [currentData.activeBook]: {
          ...currentData.books[currentData.activeBook],
          description: newDescription
        }
      }
    }));
  }

  const handleChapterSelect = (chapter, chapterList, index) => {
    setCurrentChapter(chapter);
    setCurrentChapterList(chapterList);
    setCurrentChapterIndex(index);
    setCurrentView('translations');
  };

  const handleDeleteChapter = (chapterSourceUrl) => {
    if (!appData.activeBook) return;
    updateAppData(currentData => {
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

  const handleDeleteRawChapters = () => {
    if (!appData.activeBook) return;

    const bookKey = appData.activeBook;

    // Call API to delete the file from the filesystem
    api.deleteRawChapters(bookKey)
      .then(() => {
        logToPanel('info', `Deleted raw chapters file for "${bookKey}".`);
      })
      .catch(err => {
        console.error("Failed to delete raw chapters file:", err);
        logToPanel('error', `Failed to delete raw chapters file for "${bookKey}": ${err.message}`);
      });

    // Update the state
    updateAppData(currentData => {
      const newAppData = JSON.parse(JSON.stringify(currentData));
      const book = newAppData.books[bookKey];
      if (book) {
        book.rawChapterData = [];
      }
      logToPanel('info', `Cleared raw chapters for "${bookKey}".`);
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
    const newIndex = sortOrder === 'desc' ? currentChapterIndex - 1 : currentChapterIndex + 1;
    if (newIndex >= 0 && newIndex < currentChapterList.length) {
      setCurrentChapterIndex(newIndex);
      setCurrentChapter(currentChapterList[newIndex]);
    }

    if (shouldStartNewTranslation) {
      const book = appData.books[appData.activeBook];
      if (!book.rawChapterData || book.rawChapterData.length === 0) {
        logToPanel('info', 'No raw chapters available to translate.');
        return;
      }
      const translatedUrls = new Set(book.chapters.map(c => c.sourceUrl));
      const maxTranslatedNum = book.chapters.reduce((max, chap) => {
        const num = parseInt(chap.title.match(/\d+/)?.[0] || 0, 10);
        return num > max ? num : max;
      }, 0);

      logToPanel('info', `Highest translated chapter is ${maxTranslatedNum}. Looking for the next one.`);

      const untranslatedRawChapters = book.rawChapterData
        .filter(c => !translatedUrls.has(c.sourceUrl) && c.translationStatus !== 'pending')
        .map(c => ({ ...c, chapterNumber: parseInt(c.title.match(/(\d+)/)?.[0] || 0, 10) }))
        .sort((a, b) => a.chapterNumber - b.chapterNumber);

      const nextToTranslate = untranslatedRawChapters.find(c => c.chapterNumber > maxTranslatedNum);

      if (nextToTranslate) {
        logToPanel('info', `Found next chapter to translate: #${nextToTranslate.chapterNumber} "${nextToTranslate.title}"`);
        handleStartTranslation(appData.activeBook, nextToTranslate);
      } else {
        if (untranslatedRawChapters.length > 0) {
          logToPanel('warning', `Could not find a chapter after #${maxTranslatedNum}. Falling back to the lowest available untranslated chapter.`);
          const fallbackChapter = untranslatedRawChapters[0];
          handleStartTranslation(appData.activeBook, fallbackChapter);
        } else {
          logToPanel('info', 'All available raw chapters have been translated or are pending.');
        }
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
    updateAppData(currentData => {
      const newGlossary = { ...currentData.books[appData.activeBook].glossary };
      if (originalTerm && originalTerm !== updatedEntry.term) {
        delete newGlossary[originalTerm];
      }
      newGlossary[updatedEntry.term] = updatedEntry;

      logToPanel('success', `Glossary entry "${updatedEntry.term}" updated.`);
      return {
        ...currentData,
        books: {
          ...currentData.books,
          [appData.activeBook]: {
            ...currentData.books[appData.activeBook],
            glossary: newGlossary
          }
        }
      }
    });
  };

  const handleGlossaryEntryDelete = (termToDelete) => {
    if (!appData.activeBook) return;
    updateAppData(currentData => {
      const newGlossary = { ...currentData.books[appData.activeBook].glossary };
      delete newGlossary[termToDelete];
      logToPanel('info', `Glossary entry "${termToDelete}" deleted.`);
      return {
        ...currentData,
        books: {
          ...currentData.books,
          [appData.activeBook]: {
            ...currentData.books[appData.activeBook],
            glossary: newGlossary
          }
        }
      }
    });
  };

  const handleSaveSettings = (newSettings) => {
    if (!appData.activeBook) return;
    updateAppData(currentData => ({
      ...currentData,
      books: {
        ...currentData.books,
        [appData.activeBook]: {
          ...currentData.books[appData.activeBook],
          settings: newSettings,
        },
      },
    }));
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
          onDeleteRawChapters={handleDeleteRawChapters}
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
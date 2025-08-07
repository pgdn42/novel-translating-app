import React, { useState, useEffect, useCallback, useRef } from 'react';
import Glossary from './components/Glossary';
import Translations from './components/Translations';
import WorldBuilding from './components/WorldBuilding';
import LogPanel from './components/LogPanel';
import NewBookModal from './components/NewBookModal';
import BookSettingsModal from './components/BookSettingsModal';
import TranslationComparisonModal from './components/TranslationComparisonModal';
import WelcomeScreen from './components/WelcomeScreen';
import api from './api';
import { onLog, logToPanel } from './logService';
import { ReactComponent as LogIcon } from './assets/log-icon.svg';

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


const App = () => {
  const [appData, setAppData] = useState({ activeBook: null, books: {} });
  const [currentView, setCurrentView] = useState('translations');
  const [currentChapter, setCurrentChapter] = useState(null);
  const [currentChapterList, setCurrentChapterList] = useState([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(-1);
  const [sortOrder, setSortOrder] = useState('desc');
  const [translatingNextSourceUrl, setTranslatingNextSourceUrl] = useState(null);
  const [autoTranslateNext, setAutoTranslateNext] = useState(true);

  const [isLogVisible, setIsLogVisible] = useState(false);
  const [logWidth, setLogWidth] = useState(400);
  const [logMessages, setLogMessages] = useState([]);
  const [connectedClients, setConnectedClients] = useState([]);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [isNewBookModalOpen, setIsNewBookModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);

  const stateRef = useRef({
    appData,
    currentChapter,
    currentChapterIndex,
    currentChapterList,
    sortOrder,
    translatingNextSourceUrl
  });

  useEffect(() => {
    stateRef.current = {
      appData,
      currentChapter,
      currentChapterIndex,
      currentChapterList,
      sortOrder,
      translatingNextSourceUrl
    };
  }, [appData, currentChapter, currentChapterIndex, currentChapterList, sortOrder, translatingNextSourceUrl]);


  const debouncedSave = useCallback(
    debounce((dataToSave) => {
      api.setStorage('novelNavigatorData', dataToSave).catch(err => {
        console.error("Failed to save data to electron-store:", err);
        logToPanel('error', 'Failed to save application state.');
      });

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
    setAppData(updater);
  };

  const handleUpdateBookmark = (bookmark) => {
    if (!appData.activeBook) return;
    updateAppData(currentData => ({
      ...currentData,
      books: {
        ...currentData.books,
        [currentData.activeBook]: {
          ...currentData.books[currentData.activeBook],
          bookmark: bookmark
        }
      }
    }));
  };

  const handleNewLog = useCallback((log) => {
    setLogMessages(prev => [...prev, log].slice(-200));
  }, []);

  const handleTranslationComplete = useCallback((payload) => {
    const { bookKey, newChapter, newGlossaryEntries } = payload;
    const parsedGlossary = parseGlossaryText(newGlossaryEntries);

    const shouldNavigate = newChapter.sourceUrl === stateRef.current.translatingNextSourceUrl;
    if (shouldNavigate) {
      setTranslatingNextSourceUrl(null);
    }

    updateAppData(currentData => {
      const newAppData = JSON.parse(JSON.stringify(currentData));
      const book = newAppData.books[bookKey];
      if (!book) return currentData;

      const existingChapterIndex = book.chapters.findIndex(c => c.sourceUrl === newChapter.sourceUrl);

      if (existingChapterIndex !== -1) {
        setComparisonData({ bookKey, oldChapter: book.chapters[existingChapterIndex], newChapter, newGlossaryEntries: parsedGlossary });
        setIsComparisonModalOpen(true);
        logToPanel('info', `Re-translation for "${newChapter.title}" ready for review.`);
        return currentData;
      } else {
        if (!book.glossary) book.glossary = {};
        Object.assign(book.glossary, parsedGlossary);
        const newEntryCount = Object.keys(parsedGlossary).length;
        if (newEntryCount > 0) logToPanel('success', `Added/updated ${newEntryCount} glossary entries for "${bookKey}".`);

        const rawChapter = book.rawChapterData?.find(c => c.sourceUrl === newChapter.sourceUrl);
        if (rawChapter) rawChapter.translationStatus = 'completed';

        book.chapters.push(newChapter);
        logToPanel('success', `New translation for "${newChapter.title}" received and saved.`);
        return newAppData;
      }
    });

    if (shouldNavigate) {
      setTimeout(() => {
        setAppData(currentAppData => {
          const book = currentAppData.books[bookKey];
          const enhancedChapters = book.chapters.map((chapter, index) => ({
            ...chapter,
            originalIndex: index,
            chapterNumber: parseInt(chapter.title.match(/(\d+)/)?.[0] || index + 1, 10)
          }));
          const sortedChapters = [...enhancedChapters].sort((a, b) => stateRef.current.sortOrder === 'asc' ? a.chapterNumber - b.chapterNumber : b.chapterNumber - a.chapterNumber);
          const newChapterIndex = sortedChapters.findIndex(c => c.sourceUrl === newChapter.sourceUrl);

          if (newChapterIndex !== -1) {
            setCurrentChapter(sortedChapters[newChapterIndex]);
            setCurrentChapterList(sortedChapters);
            setCurrentChapterIndex(newChapterIndex);
          }
          return currentAppData;
        });
      }, 100);
    }
  }, []);

  const handleWebSocketMessage = useCallback((message) => {
    if (!message.payload) message.payload = {};
    if (!message.payload.timestamp) {
      message.payload.timestamp = new Date().toISOString();
    }
    if (!message.payload.source) {
      message.payload.source = 'websocket';
    }

    if (!['translation_complete', 'task_queued', 'translation_failed', 'reset_pending_status', 'translation_started', 'duplicate_translation_request'].includes(message.type)) {
      handleNewLog(message);
    }

    switch (message.type) {
      case 'ws-status':
        setWsStatus(message.payload.status);
        break;
      case 'client-list-update':
        setConnectedClients(message.payload.connectedClients);
        break;
      case 'task_queued':
        logToPanel('warning', message.payload.text);
        break;
      case 'translation_started':
        {
          const { appData: currentAppData, currentChapter: currentChapterRef, currentChapterList: currentChapterListRef, currentChapterIndex: currentChapterIndexRef, sortOrder: sortOrderRefValue } = stateRef.current;
          const book = currentAppData.books[currentAppData.activeBook];
          if (book && currentChapterRef) {
            const isLastChapter = !currentChapterListRef.some((chap, idx) => sortOrderRefValue === 'desc' ? idx < currentChapterIndexRef : idx > currentChapterIndexRef);
            if (isLastChapter) {
              setTranslatingNextSourceUrl(message.payload.sourceUrl);
            }
          }
        }
        break;
      case 'duplicate_translation_request':
        logToPanel('warning', `Translation for "${message.payload.title}" is already in progress.`);
        if (stateRef.current.translatingNextSourceUrl === message.payload.sourceUrl) {
          setTranslatingNextSourceUrl(null);
        }
        break;
      case 'translation_failed':
        logToPanel('error', `Translation failed for "${message.payload.title}". It has been re-queued.`);
        if (stateRef.current.translatingNextSourceUrl === message.payload.sourceUrl) {
          setTranslatingNextSourceUrl(null);
        }
        updateAppData(currentData => {
          const newAppData = JSON.parse(JSON.stringify(currentData));
          const book = newAppData.books[message.payload.bookKey];
          if (book) {
            const rawChapter = book.rawChapterData?.find(c => c.sourceUrl === message.payload.sourceUrl);
            if (rawChapter) {
              rawChapter.translationStatus = 'untranslated';
            }
          }
          return newAppData;
        });
        break;
      case 'reset_pending_status':
        logToPanel('info', `Resetting ${message.payload.sourceUrls.length} chapter(s) from 'pending' to 'untranslated'.`);
        updateAppData(currentData => {
          const newAppData = JSON.parse(JSON.stringify(currentData));
          const urlsToReset = new Set(message.payload.sourceUrls);
          Object.values(newAppData.books).forEach(book => {
            book.rawChapterData?.forEach(rawChapter => {
              if (urlsToReset.has(rawChapter.sourceUrl)) {
                rawChapter.translationStatus = 'untranslated';
              }
            });
          });
          return newAppData;
        });
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
  }, [handleNewLog, handleTranslationComplete]);


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

  useEffect(() => {
    api.connectWebSocket(handleWebSocketMessage);
    const unsubscribeLog = onLog(handleNewLog);

    const fetchData = async () => {
      try {
        const storedAppData = await api.getStorage('novelNavigatorData');
        const cachedData = storedAppData.novelNavigatorData || { activeBook: null, books: {} };
        const pathData = await api.getStorage('booksDirectoryPath');
        const booksDir = pathData.booksDirectoryPath;
        let booksFromFS = {};

        if (booksDir) {
          logToPanel('info', `Loading books from saved directory: ${booksDir}`);
          await api.setBooksDirectory(booksDir);
          booksFromFS = await api.importBooks(booksDir);
        } else {
          logToPanel('info', 'No book directory set. Loading from cache.');
        }

        const finalData = { ...cachedData, books: booksFromFS };

        if (finalData.activeBook && !booksFromFS[finalData.activeBook]) {
          logToPanel('warning', `Cached active book "${finalData.activeBook}" not found. Resetting.`);
          finalData.activeBook = Object.keys(booksFromFS)[0] || null;
        }

        const pendingChapters = [];
        Object.values(finalData.books).forEach(book => {
          book.rawChapterData?.forEach(rawChapter => {
            if (rawChapter.translationStatus === 'pending') {
              pendingChapters.push({
                sourceUrl: rawChapter.sourceUrl,
                title: rawChapter.title
              });
            }
          });
        });

        if (pendingChapters.length > 0) {
          logToPanel('info', `Found ${pendingChapters.length} chapter(s) with 'pending' status. Verifying with server...`);
          api.sendWebSocketMessage({
            type: 'sync_pending_chapters',
            payload: { pendingChapters }
          });
        }

        setAppData(finalData);

      } catch (error) {
        console.error("Failed to fetch initial data:", error);
        logToPanel('error', `Failed to fetch initial data: ${error.message}`);
        setAppData({ activeBook: null, books: {} });
      }
    };

    fetchData();

    return () => {
      unsubscribeLog();
    };
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
        worldBuilding: { categories: [] },
        bookmark: null
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

      if (book.bookmark && book.bookmark.chapterSourceUrl === chapterSourceUrl) {
        book.bookmark = null;
        logToPanel('info', `Bookmark removed from deleted chapter.`);
      }

      return newAppData;
    });
  };

  const handleDeleteRawChapters = () => {
    if (!appData.activeBook) return;

    const bookKey = appData.activeBook;

    api.deleteRawChapters(bookKey)
      .then(() => {
        logToPanel('info', `Deleted raw chapters file for "${bookKey}".`);
      })
      .catch(err => {
        console.error("Failed to delete raw chapters file:", err);
        logToPanel('error', `Failed to delete raw chapters file for "${bookKey}": ${err.message}`);
      });

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

  const handleNextChapter = () => {
    const book = appData.books[appData.activeBook];
    if (!book) return;

    const newIndex = sortOrder === 'desc' ? currentChapterIndex - 1 : currentChapterIndex + 1;
    const isLastChapter = !(newIndex >= 0 && newIndex < currentChapterList.length);

    if (!isLastChapter) {
      setCurrentChapterIndex(newIndex);
      setCurrentChapter(currentChapterList[newIndex]);
    }

    if (autoTranslateNext) {
      if (!book.rawChapterData) {
        if (isLastChapter) logToPanel('info', 'No raw chapters available to translate.');
        return;
      }

      const maxTranslatedNum = book.chapters.reduce((max, chap) => {
        const num = parseInt(chap.title.match(/\d+/)?.[0] || 0, 10);
        return num > max ? num : max;
      }, 0);

      const untranslatedRawChapters = book.rawChapterData
        .filter(c => c.translationStatus !== 'pending')
        .map(c => ({ ...c, chapterNumber: parseInt(c.title.match(/(\d+)/)?.[0] || 0, 10) }))
        .sort((a, b) => a.chapterNumber - b.chapterNumber);

      const nextToTranslate = untranslatedRawChapters.find(c => c.chapterNumber > maxTranslatedNum);

      if (nextToTranslate) {
        logToPanel('info', `Queuing next chapter for translation: #${nextToTranslate.chapterNumber}`);
        handleStartTranslation(appData.activeBook, nextToTranslate);
      } else if (isLastChapter) {
        logToPanel('info', 'All available chapters are either translated or pending.');
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

  const handleAcceptComparison = () => {
    if (!comparisonData) return;
    const { bookKey, newChapter, newGlossaryEntries } = comparisonData;

    updateAppData(currentData => {
      const newAppData = JSON.parse(JSON.stringify(currentData));
      const book = newAppData.books[bookKey];
      if (!book) return currentData;

      if (!book.glossary) book.glossary = {};
      Object.assign(book.glossary, newGlossaryEntries);

      const chapterIndex = book.chapters.findIndex(c => c.sourceUrl === newChapter.sourceUrl);
      if (chapterIndex !== -1) {
        book.chapters[chapterIndex] = newChapter;
      }

      logToPanel('success', `Re-translation for "${newChapter.title}" accepted and saved.`);
      return newAppData;
    });

    if (currentChapter && currentChapter.sourceUrl === newChapter.sourceUrl) {
      setCurrentChapter(newChapter);
    }

    setIsComparisonModalOpen(false);
    setComparisonData(null);
  };


  const handleStartTranslation = (bookKey, chapterToTranslate, isRetranslation = false) => {
    const book = appData.books[bookKey];
    if (!book || !chapterToTranslate) return;

    let sourceContent;
    const rawChapter = book.rawChapterData?.find(c => c.sourceUrl === chapterToTranslate.sourceUrl);

    if (isRetranslation) {
      logToPanel('info', `Starting re-translation for: ${chapterToTranslate.title}`);
      if (!rawChapter) {
        logToPanel('error', `Could not find raw chapter data for re-translation of "${chapterToTranslate.title}". This may be an older chapter without a saved source URL.`);
        return;
      }
      sourceContent = rawChapter.sourceContent;
    } else {
      logToPanel('info', `Starting translation for: ${chapterToTranslate.title}`);
      sourceContent = chapterToTranslate.sourceContent;
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
        const newAppData = JSON.parse(JSON.stringify(currentData));
        const book = newAppData.books[bookKey];
        if (book) {
          const rawChapterToUpdate = book.rawChapterData?.find(c => c.sourceUrl === chapterToTranslate.sourceUrl);
          if (rawChapterToUpdate && rawChapterToUpdate.translationStatus !== 'pending') {
            rawChapterToUpdate.translationStatus = 'pending';
            return newAppData;
          }
        }
        return currentData;
      });
    }
  };


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
          translatingNextSourceUrl={translatingNextSourceUrl}
          autoTranslateNext={autoTranslateNext}
          setAutoTranslateNext={setAutoTranslateNext}
          bookmark={activeBookData.bookmark}
          onUpdateBookmark={handleUpdateBookmark}
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
              <LogIcon />
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

export default App;
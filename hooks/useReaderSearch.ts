import { useState, useRef } from 'react';

export interface SearchResult {
  cfi?: string;    // ePub
  page?: number;   // PDF
  excerpt: string; // display text
}

export function useReaderSearch() {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchCancelRef = useRef(false);

  function openSearch() {
    setShowSearch(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  function closeSearch() {
    searchCancelRef.current = true;
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  return {
    showSearch, setShowSearch,
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    isSearching, setIsSearching,
    searchInputRef, searchCancelRef,
    openSearch, closeSearch,
  };
}

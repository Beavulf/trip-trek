"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CityResult {
  id: number;
  name: string;
  country: string;
  countryCode: string;
  region: string;
  lat: number;
  lng: number;
  timezone: string;
  language: string;
  flag: string;
  label: string;
}

interface CityAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (city: CityResult) => void;
  placeholder?: string;
  className?: string;
}

export function CityAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Начни вводить город…",
  className,
}: CityAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selected, setSelected] = useState<CityResult | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    if (selected && query === selected.name) return;

    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/city-search?q=${encodeURIComponent(query)}`);
        const data = await r.json();
        setResults(data.results || []);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (city: CityResult) => {
    setSelected(city);
    setQuery(city.name);
    setShowResults(false);
    onChange(city.name);
    onSelect(city);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery("");
    onChange("");
    setResults([]);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setSelected(null);
          }}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-input bg-background pl-10 pr-10 py-2.5 text-sm"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
        )}
        {!loading && query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showResults && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto"
          >
            {results.map((city) => (
              <button
                key={city.id}
                onClick={() => handleSelect(city)}
                className="w-full flex items-center gap-3 p-2.5 hover:bg-accent transition-colors text-left border-b border-border last:border-0"
              >
                <span className="text-2xl shrink-0">{city.flag}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{city.name}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="size-2.5" />
                    {city.region && `${city.region}, `}{city.country}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground uppercase shrink-0">
                  {city.language}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {selected && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1.5">
          <span className="text-base">{selected.flag}</span>
          <span>Выбран: <b className="text-foreground">{selected.label}</b></span>
          <span className="ml-auto">Язык: <b className="text-foreground uppercase">{selected.language}</b></span>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { Input } from "./ui/input";
import { Search } from "lucide-react";

interface SearchWithPlaceholderProps {
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  className?: string;
}

const searchPlaceholders = [
  "Search bicycles",
  "Search textbooks",
  "Search furniture",
  "Search tools",
  "Search electronics",
  "Search notes",
  "Search clothes",
  "Search articles",
  "Search categories",
];

export function SearchWithPlaceholder({
  value,
  onChange,
  loading,
  className,
}: SearchWithPlaceholderProps) {
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPlaceholder((prev) => (prev + 1) % searchPlaceholders.length);
    }, 3500); // Change every 3.5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/90 w-4 h-4 z-10" />
      <Input
        placeholder={searchPlaceholders[currentPlaceholder]}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10 bg-green-600 border-2 border-green-700 text-white placeholder-white/80 focus:bg-green-500 focus:border-green-600 focus:text-white focus:placeholder-white/90 transition-colors"
        style={{
          backgroundColor: "#00A86B",
          borderColor: "#008856",
        }}
      />
      {loading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        </div>
      )}
    </div>
  );
}
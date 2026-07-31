import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Rows2, Rows3, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type Density = "comfortable" | "compact";

const STORAGE_KEY = "ledgerly-density";

const DensityContext = createContext<{
  density: Density;
  setDensity: (d: Density) => void;
} | null>(null);

function getInitial(): Density {
  if (typeof window === "undefined") return "comfortable";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "compact" || v === "comfortable") return v;
  } catch {
    /* ignore */
  }
  return "comfortable";
}

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>(getInitial);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    try {
      window.localStorage.setItem(STORAGE_KEY, density);
    } catch {
      /* ignore */
    }
  }, [density]);

  return (
    <DensityContext.Provider value={{ density, setDensity: setDensityState }}>
      {children}
    </DensityContext.Provider>
  );
}

export function useDensity() {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error("useDensity must be used within DensityProvider");
  return ctx;
}

export function DensityToggle() {
  const { density, setDensity } = useDensity();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Table density" title="Table density">
          {density === "compact" ? <Rows3 className="h-4 w-4" /> : <Rows2 className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Density</DropdownMenuLabel>
        {(["comfortable", "compact"] as Density[]).map((d) => (
          <DropdownMenuItem key={d} onClick={() => setDensity(d)} className="capitalize">
            {d}
            {density === d && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

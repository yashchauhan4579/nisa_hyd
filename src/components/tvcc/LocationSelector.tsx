import * as React from "react"
import { Check, ChevronsUpDown, MapPin, Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

export interface LocationSelectorProps {
    locations: string[];
    selectedLocations: string[];
    onSelectionChange: (locations: string[]) => void;
    placeholder?: string;
    className?: string;
}

export function LocationSelector({
    locations,
    selectedLocations,
    onSelectionChange,
    placeholder = "Select Locations",
    className
}: LocationSelectorProps) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")

    // Sort locations and filter
    const filteredLocations = React.useMemo(() => {
        return locations
            .filter(l => l.toLowerCase().includes(search.toLowerCase()))
            .sort();
    }, [locations, search]);

    const toggleLocation = (location: string) => {
        const newSelection = selectedLocations.includes(location)
            ? selectedLocations.filter(l => l !== location)
            : [...selectedLocations, location];
        onSelectionChange(newSelection);
    }

    const clearSelection = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelectionChange([]);
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("justify-between h-10 px-3 !bg-white !border-slate-200 !text-slate-700 hover:!bg-slate-50 hover:!text-slate-900 dark:!bg-white/5 dark:!border-white/10 dark:!text-white dark:hover:!bg-white/10 dark:hover:!text-white", className)}
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <MapPin className="h-4 w-4 !text-slate-500 dark:!text-zinc-400 shrink-0" />
                        <span className="truncate !text-slate-700 dark:!text-white">
                            {selectedLocations.length === 0
                                ? placeholder
                                : selectedLocations.length === 1
                                    ? selectedLocations[0]
                                    : `${selectedLocations.length} Locations Selected`}
                        </span>
                        {selectedLocations.length > 0 && (
                            <Badge variant="secondary" className="ml-1 rounded-sm px-1 font-normal lg:hidden !bg-slate-100 !text-slate-700 dark:!bg-white/10 dark:!text-white">
                                {selectedLocations.length}
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center ml-2 shrink-0 !text-slate-400 dark:!text-zinc-500">
                        {selectedLocations.length > 0 && (
                            <div onClick={clearSelection} className="mr-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-sm p-0.5 cursor-pointer">
                                <X className="h-3 w-3" />
                            </div>
                        )}
                        <ChevronsUpDown className="h-4 w-4" />
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 bg-white/95 text-slate-900 border-slate-200 dark:bg-zinc-950/95 dark:text-white dark:border-white/10" align="start" style={{ zIndex: 9999 }}>
                <div className="flex items-center border-b px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <Input
                        placeholder="Search locations..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus-visible:ring-0"
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1" style={{ overscrollBehavior: 'contain' }}>
                    {filteredLocations.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">No location found.</div>
                    ) : (
                        filteredLocations.map((location) => (
                            <div
                                key={location}
                                onClick={() => toggleLocation(location)}
                                className={cn(
                                    "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer",
                                    selectedLocations.includes(location) && "bg-accent text-accent-foreground"
                                )}
                            >
                                <Check
                                    className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedLocations.includes(location) ? "opacity-100" : "opacity-0"
                                    )}
                                />
                                {location}
                            </div>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

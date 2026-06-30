import * as React from "react"
import { Camera, Check, ChevronDown, Search } from "lucide-react"

import { cn } from "@irisdrone/lib/utils"
import { Button } from "@irisdrone/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@irisdrone/components/ui/popover"
import { Badge } from "@irisdrone/components/ui/badge"
import { Input } from "@irisdrone/components/ui/input"

export interface CameraOption {
    id: string
    name: string
    metadata?: {
        location?: string
    }
}

interface MultiCameraSelectorProps {
    cameras: CameraOption[]
    selectedCameraIds: string[]
    onSelectionChange: (ids: string[]) => void
    loading?: boolean
    className?: string
}

export function MultiCameraSelector({
    cameras,
    selectedCameraIds,
    onSelectionChange,
    loading = false,
    className
}: MultiCameraSelectorProps) {
    const [open, setOpen] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState("")
    const scrollContainerRef = React.useRef<HTMLDivElement | null>(null)

    // Calculate selected labels
    const selectedCount = selectedCameraIds.length
    const allSelected = selectedCount === cameras.length && cameras.length > 0

    // Helper text
    let labelText = "Select Cameras"
    if (allSelected) {
        labelText = "All Cameras"
    } else if (selectedCount === 0) {
        labelText = "Select Cameras"
    } else if (selectedCount === 1) {
        const cam = cameras.find(c => c.id === selectedCameraIds[0])
        labelText = cam ? (cam.name || cam.id).replace(/^Camera\s+/i, "") : "1 Camera"
    } else {
        labelText = `${selectedCount} Cameras`
    }

    const toggleCamera = (cameraId: string) => {
        const newSelection = selectedCameraIds.includes(cameraId)
            ? selectedCameraIds.filter(id => id !== cameraId)
            : [...selectedCameraIds, cameraId]
        onSelectionChange(newSelection)
    }

    const selectAll = () => {
        onSelectionChange(cameras.map(c => c.id))
    }

    const clearAll = () => {
        onSelectionChange([])
    }

    const handleListWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const container = scrollContainerRef.current
        if (!container) return

        container.scrollTop += event.deltaY
        event.preventDefault()
        event.stopPropagation()
    }

    // Filter and Group cameras
    const { filteredGroups, sortedLocations } = React.useMemo(() => {
        const groups: Record<string, CameraOption[]> = {}
        const query = searchQuery.toLowerCase()

        cameras.forEach(cam => {
            const name = (cam.name || cam.id).toLowerCase()
            const loc = (cam.metadata?.location || "Unknown Location");

            // Search filter
            if (query && !name.includes(query) && !loc.toLowerCase().includes(query)) {
                return;
            }

            if (!groups[loc]) groups[loc] = []
            groups[loc].push(cam)
        })

        return {
            filteredGroups: groups,
            sortedLocations: Object.keys(groups).sort()
        }
    }, [cameras, searchQuery])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "justify-between text-left font-normal h-10 py-2 px-3 min-w-[200px] !bg-white !border-slate-200 !text-slate-700 hover:!bg-slate-50 hover:!text-slate-900 dark:!bg-white/5 dark:!border-white/10 dark:!text-white dark:hover:!bg-white/10 dark:hover:!text-white",
                        className
                    )}
                    disabled={loading}
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Camera className="h-4 w-4 !text-slate-500 dark:!text-zinc-400 flex-shrink-0" />
                        <span className="text-sm font-medium truncate !text-slate-700 dark:!text-white">{labelText}</span>
                        {selectedCount > 0 && !allSelected && (
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 rounded-full text-[10px] !bg-slate-100 !text-slate-700 dark:!bg-white/10 dark:!text-white">
                                {selectedCount}
                            </Badge>
                        )}
                    </div>
                    <ChevronDown className="ml-2 h-3 w-3 !text-slate-400 dark:!text-zinc-500 flex-shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 z-[100] bg-white/95 text-slate-900 border-slate-200 dark:bg-zinc-950/95 dark:text-white dark:border-white/10" align="start">
                <div className="p-2 border-b border-slate-200 dark:border-white/10">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search cameras..."
                            className="pl-8 h-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex items-center justify-between p-2 border-b border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={selectAll}
                    >
                        Select All
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2 text-destructive hover:text-destructive"
                        onClick={clearAll}
                    >
                        Clear
                    </Button>
                </div>

                <div
                    ref={scrollContainerRef}
                    className="max-h-[400px] overflow-y-auto overscroll-contain p-1"
                    onWheel={handleListWheel}
                >
                    {sortedLocations.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                            No cameras found.
                        </div>
                    ) : (
                        sortedLocations.map(location => (
                            <div key={location} className="mb-2">
                                <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                                    {location}
                                </div>
                                {filteredGroups[location].map(camera => {
                                    const isSelected = selectedCameraIds.includes(camera.id)
                                    return (
                                        <div
                                            key={camera.id}
                                            className={cn(
                                                "flex items-center w-full px-2 py-1.5 text-sm rounded-sm cursor-pointer text-slate-800 transition-colors hover:bg-amber-50 hover:text-slate-900 dark:text-zinc-100 dark:hover:bg-white/10 dark:hover:text-white",
                                                isSelected && "bg-amber-50 text-slate-900 dark:bg-white/10 dark:text-white"
                                            )}
                                            onClick={() => toggleCamera(camera.id)}
                                        >
                                            <div
                                                className={cn(
                                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-slate-300 dark:border-white/20",
                                                    isSelected
                                                        ? "bg-amber-600 text-white border-amber-600 dark:bg-white dark:text-black dark:border-white"
                                                        : "opacity-50 [&_svg]:invisible"
                                                )}
                                            >
                                                <Check className={cn("h-3 w-3")} />
                                            </div>
                                            <span className="truncate flex-1">
                                                {(camera.name || camera.id).replace(/^Camera\s+/i, "")}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Clock, ChevronDown } from "lucide-react"
import { cn } from "@irisdrone/lib/utils"
import { Button } from "@irisdrone/components/ui/button"
import { Calendar } from "@irisdrone/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@irisdrone/components/ui/popover"
import { Input } from "@irisdrone/components/ui/input"

export interface DateTimeRange {
    startDate: Date
    endDate: Date
}

interface DateTimeRangePickerProps {
    value: DateTimeRange
    onChange: (range: DateTimeRange) => void
    className?: string
}

type PresetKey = "1h" | "6h" | "24h" | "7d" | "30d" | "custom"

const presets: Record<Exclude<PresetKey, "custom">, { label: string; getRange: () => DateTimeRange }> = {
    "1h": { label: "1 Hour", getRange: () => { const e = new Date(), s = new Date(); s.setHours(s.getHours() - 1); return { startDate: s, endDate: e }; } },
    "6h": { label: "6 Hours", getRange: () => { const e = new Date(), s = new Date(); s.setHours(s.getHours() - 6); return { startDate: s, endDate: e }; } },
    "24h": { label: "24h", getRange: () => { const e = new Date(), s = new Date(); s.setHours(s.getHours() - 24); return { startDate: s, endDate: e }; } },
    "7d": { label: "7 Days", getRange: () => { const e = new Date(), s = new Date(); s.setDate(s.getDate() - 7); s.setHours(0, 0, 0, 0); return { startDate: s, endDate: e }; } },
    "30d": { label: "30 Days", getRange: () => { const e = new Date(), s = new Date(); s.setDate(s.getDate() - 30); s.setHours(0, 0, 0, 0); return { startDate: s, endDate: e }; } },
}

interface DateTimeRangeContentProps {
    value: DateTimeRange
    onChange: (range: DateTimeRange) => void
    onCancel?: () => void
    onApply?: (range: DateTimeRange) => void
    showFooter?: boolean
}

export function DateTimeRangeContent({ value, onChange, onCancel, onApply, showFooter = true }: DateTimeRangeContentProps) {
    const [activePreset, setActivePreset] = React.useState<PresetKey>("custom")
    const [tempStart, setTempStart] = React.useState<Date>(value.startDate)
    const [tempEnd, setTempEnd] = React.useState<Date>(value.endDate)
    const [startTime, setStartTime] = React.useState(() => format(value.startDate, "HH:mm"))
    const [endTime, setEndTime] = React.useState(() => format(value.endDate, "HH:mm"))

    React.useEffect(() => {
        setTempStart(value.startDate)
        setTempEnd(value.endDate)
        setStartTime(format(value.startDate, "HH:mm"))
        setEndTime(format(value.endDate, "HH:mm"))
    }, [value])

    const updateRange = (newStart: Date, newEnd: Date, preset: PresetKey) => {
        setTempStart(newStart)
        setTempEnd(newEnd)
        setStartTime(format(newStart, "HH:mm"))
        setEndTime(format(newEnd, "HH:mm"))
        setActivePreset(preset)
        onChange({ startDate: newStart, endDate: newEnd })
    }

    const handlePresetClick = (key: Exclude<PresetKey, "custom">) => {
        const range = presets[key].getRange()
        updateRange(range.startDate, range.endDate, key)
    }

    const handleStartDateSelect = (date: Date | undefined) => {
        if (!date) return
        const [hours, minutes] = startTime.split(":").map(Number)
        date.setHours(hours || 0, minutes || 0, 0, 0)
        updateRange(date, tempEnd, "custom")
    }

    const handleEndDateSelect = (date: Date | undefined) => {
        if (!date) return
        const [hours, minutes] = endTime.split(":").map(Number)
        date.setHours(hours || 23, minutes || 59, 59, 999)
        updateRange(tempStart, date, "custom")
    }

    const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setStartTime(val)
        if (val) {
            const [hours, minutes] = val.split(":").map(Number)
            const newStart = new Date(tempStart)
            newStart.setHours(hours || 0, minutes || 0)
            updateRange(newStart, tempEnd, "custom")
        }
    }

    const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setEndTime(val)
        if (val) {
            const [hours, minutes] = val.split(":").map(Number)
            const newEnd = new Date(tempEnd)
            newEnd.setHours(hours || 0, minutes || 0)
            updateRange(tempStart, newEnd, "custom")
        }
    }

    return (
        <div className="p-4 space-y-4">
            <div className="flex gap-2 flex-wrap">
                {(Object.keys(presets) as Exclude<PresetKey, "custom">[]).map((key) => (
                    <Button
                        key={key}
                        variant={activePreset === key ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePresetClick(key)}
                        className="text-xs"
                    >
                        {presets[key].label}
                    </Button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Start Date & Time</div>
                    <div className="border border-white/10 rounded-lg overflow-hidden">
                        <Calendar
                            selected={tempStart}
                            onSelect={handleStartDateSelect}
                        />
                        <div className="border-t border-white/10 p-2 flex items-center gap-2 bg-zinc-900/50">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <Input
                                type="time"
                                value={startTime}
                                onChange={handleStartTimeChange}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">End Date & Time</div>
                    <div className="border border-white/10 rounded-lg overflow-hidden">
                        <Calendar
                            selected={tempEnd}
                            onSelect={handleEndDateSelect}
                        />
                        <div className="border-t border-white/10 p-2 flex items-center gap-2 bg-zinc-900/50">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <Input
                                type="time"
                                value={endTime}
                                onChange={handleEndTimeChange}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {showFooter && (
                <div className="flex justify-between items-center pt-2 border-t border-white/10">
                    <div className="text-xs text-muted-foreground">
                        {tempStart < tempEnd ? (
                            <>Range: {Math.ceil((tempEnd.getTime() - tempStart.getTime()) / (1000 * 60 * 60 * 24))} days</>
                        ) : (
                            <span className="text-destructive">Invalid range</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
                        {onApply && <Button size="sm" onClick={() => onApply({ startDate: tempStart, endDate: tempEnd })}>Apply</Button>}
                    </div>
                </div>
            )}
        </div>
    )
}

export function DateTimeRangePicker({ value, onChange, className }: DateTimeRangePickerProps) {
    const [open, setOpen] = React.useState(false)
    const [internalValue, setInternalValue] = React.useState(value)

    React.useEffect(() => { setInternalValue(value) }, [value])

    const handleApply = (range: DateTimeRange) => {
        if (range.startDate >= range.endDate) {
            onChange({ startDate: range.endDate, endDate: range.startDate })
        } else {
            onChange(range)
        }
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={(o) => {
            if (o) setInternalValue(value);
            setOpen(o);
        }}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "justify-start text-left font-normal h-8 px-3 bg-zinc-900/50 border-white/10 text-zinc-300 hover:bg-zinc-800 hover:text-white",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-zinc-500" />
                    <span className="text-xs truncate max-w-[280px]">
                        {format(value.startDate, "MMM d, yyyy HH:mm")} - {format(value.endDate, "MMM d, yyyy HH:mm")}
                    </span>
                    <ChevronDown className="ml-2 h-3 w-3 text-zinc-500" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 min-w-[520px] bg-zinc-950 border-white/10" align="end">
                <DateTimeRangeContent
                    value={internalValue}
                    onChange={setInternalValue}
                    onCancel={() => setOpen(false)}
                    onApply={handleApply}
                />
            </PopoverContent>
        </Popover>
    )
}

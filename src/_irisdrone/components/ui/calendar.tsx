import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@irisdrone/lib/utils"
import { Button } from "@irisdrone/components/ui/button"

interface CalendarProps {
    selected?: Date
    onSelect?: (date: Date | undefined) => void
    className?: string
    disabled?: (date: Date) => boolean
}

function Calendar({ selected, onSelect, className, disabled }: CalendarProps) {
    const [currentMonth, setCurrentMonth] = React.useState(() => selected || new Date())

    React.useEffect(() => {
        if (selected) setCurrentMonth(selected)
    }, [selected])

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()

    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))

    const handleDayClick = (day: number) => {
        const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
        if (disabled?.(newDate)) return
        onSelect?.(newDate)
    }

    const isSelected = (day: number) => {
        if (!selected) return false
        return selected.getDate() === day && selected.getMonth() === currentMonth.getMonth() && selected.getFullYear() === currentMonth.getFullYear()
    }

    const isToday = (day: number) => {
        const today = new Date()
        return today.getDate() === day && today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear()
    }

    const isDisabled = (day: number) => {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
        return disabled?.(date) ?? false
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

    const days = []
    for (let i = 0; i < firstDayOfMonth; i++) {
        days.push(<div key={`empty-${i}`} className="h-8 w-8" />)
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const sel = isSelected(day)
        const dayDisabled = isDisabled(day)
        days.push(
            <button
                key={day}
                type="button"
                onClick={() => handleDayClick(day)}
                disabled={dayDisabled}
                className={cn(
                    "h-8 w-8 rounded-md text-sm transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                    sel && "bg-primary text-primary-foreground hover:bg-primary/90 ring-2 ring-primary ring-offset-2",
                    isToday(day) && !sel && "border border-primary/50",
                    dayDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
                )}
            >
                {day}
            </button>
        )
    }

    return (
        <div className={cn("p-3", className)}>
            <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="icon" onClick={prevMonth} className="h-7 w-7">
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </div>
                <Button variant="ghost" size="icon" onClick={nextMonth} className="h-7 w-7">
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
                {dayNames.map((name) => (
                    <div key={name} className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground">{name}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1">{days}</div>
        </div>
    )
}

export { Calendar }

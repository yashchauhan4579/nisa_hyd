import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
    end: number;
    duration?: number;
    intervalMs?: number;
}

export function CountUp({ end, duration = 2000, intervalMs = 50 }: CountUpProps) {
    const [count, setCount] = useState(0);
    const currentValueRef = useRef(0);

    useEffect(() => {
        currentValueRef.current = count;
    }, [count]);

    useEffect(() => {
        const target = Math.max(0, Math.round(end));
        const start = currentValueRef.current;

        if (start === target) return;

        const totalDelta = Math.abs(target - start);
        const direction = target > start ? 1 : -1;
        const stepCount = Math.max(1, Math.floor(duration / intervalMs));
        const stepSize = Math.max(1, Math.ceil(totalDelta / stepCount));

        const timer = window.setInterval(() => {
            const nextValue =
                direction > 0
                    ? Math.min(currentValueRef.current + stepSize, target)
                    : Math.max(currentValueRef.current - stepSize, target);

            currentValueRef.current = nextValue;
            setCount(nextValue);

            if (nextValue === target) {
                window.clearInterval(timer);
            }
        }, intervalMs);

        return () => window.clearInterval(timer);
    }, [end, duration, intervalMs]);

    return <>{count.toLocaleString()}</>;
}

import { useState, useEffect, useCallback, type ReactNode } from 'react';
// v1 legacy wrapper — provides Responsive + WidthProvider with the original API
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import { playSound } from '@irisdrone/hooks/useSound';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './widget-grid.css';

interface RGLItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

const ResponsiveGrid = (WidthProvider as any)(Responsive as any);

const STORAGE_KEY = 'iris_widget_layout_v1';

export interface WidgetSpec {
  id: string;
  title: string;
  icon?: ReactNode;
  /** Default position/size */
  defaultLayout: { x: number; y: number; w: number; h: number; minW?: number; minH?: number; maxW?: number; maxH?: number };
  /** What to render inside the widget body */
  render: () => ReactNode;
  /** Hide drag/resize chrome (e.g., for the module selector hero card) */
  noChrome?: boolean;
}

interface WidgetGridProps {
  widgets: WidgetSpec[];
  editMode: boolean;
}

function loadStored(defaults: RGLItem[]): RGLItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;
    const byId = new Map<string, RGLItem>(parsed.map((p: RGLItem) => [p.i, p]));
    return defaults.map((d) => byId.get(d.i) || d);
  } catch {
    return defaults;
  }
}

export function WidgetGrid({ widgets, editMode }: WidgetGridProps) {
  const defaultItems: RGLItem[] = widgets.map((w) => ({ i: w.id, ...w.defaultLayout }));
  const [layout, setLayout] = useState<RGLItem[]>(() => loadStored(defaultItems));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {}
  }, [layout]);

  const handleChange = useCallback((newLayout: any) => {
    setLayout(newLayout);
  }, []);

  return (
    <div className="widget-grid-host" data-edit-mode={editMode}>
      <ResponsiveGrid
        className="widget-grid"
        layouts={{ lg: layout, md: layout, sm: layout, xs: layout }}
        breakpoints={{ lg: 1280, md: 996, sm: 768, xs: 480 }}
        cols={{ lg: 12, md: 12, sm: 8, xs: 4 }}
        rowHeight={64}
        margin={[14, 14]}
        containerPadding={[24, 24]}
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={handleChange}
        onDragStart={() => playSound('widget-grab')}
        onDragStop={() => playSound('widget-drop')}
        onResizeStart={() => playSound('widget-resize')}
        onResizeStop={() => playSound('widget-snap')}
        useCSSTransforms
        compactType={null}
        preventCollision={false}
      >
        {widgets.map((w) => (
          <div key={w.id} className="widget-cell">
            <Widget spec={w} editMode={editMode} />
          </div>
        ))}
      </ResponsiveGrid>
    </div>
  );
}

function Widget({ spec, editMode }: { spec: WidgetSpec; editMode: boolean }) {
  if (spec.noChrome) {
    return <div className="widget widget--nochrome">{spec.render()}</div>;
  }
  return (
    <div className="widget tact-brackets-4">
      <span className="tact-corner tact-corner-tl" />
      <span className="tact-corner tact-corner-tr" />
      <span className="tact-corner tact-corner-bl" />
      <span className="tact-corner tact-corner-br" />

      <div className={`widget-header widget-drag-handle ${editMode ? 'widget-drag-handle--active' : ''}`}>
        <span className="widget-header-icon">{spec.icon}</span>
        <span className="widget-header-title">{spec.title}</span>
        <span className="widget-header-flex" />
        {editMode && <span className="widget-header-edit-hint">DRAG · RESIZE</span>}
      </div>

      <div className="widget-body scroll-hidden">{spec.render()}</div>
    </div>
  );
}

/** Reset stored layouts to defaults */
export function resetWidgetLayout() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

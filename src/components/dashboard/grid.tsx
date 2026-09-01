import { useEffect, useState } from "react";
import type { Layout } from "react-grid-layout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

export type GridItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type GridModule = typeof import("react-grid-layout");

export function DashboardGrid({
  items,
  onChange,
  children,
}: {
  items: GridItem[];
  onChange?: (items: GridItem[]) => void;
  children: React.ReactNode;
}) {
  const [grid, setGrid] = useState<GridModule | null>(null);

  useEffect(() => {
    let mounted = true;
    import("react-grid-layout").then((m) => {
      if (mounted) setGrid(m);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!grid) {
    return (
      <div className="grid grid-cols-12 gap-4">
        {children}
      </div>
    );
  }

  const ResponsiveGridLayout = grid.WidthProvider(grid.Responsive);

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={{ lg: items }}
      breakpoints={{ lg: 0 }}
      cols={{ lg: 12 }}
      rowHeight={64}
      width={1200}
      draggableHandle=".drag-handle"
      onLayoutChange={(layout: Layout[]) => {
        onChange?.(layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));
      }}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      isBounded={false}
    >
      {children}
    </ResponsiveGridLayout>
  );
}
